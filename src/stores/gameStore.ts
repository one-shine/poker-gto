import { create } from 'zustand'
import { AgentBus, type ActionRequiredPayload } from '../engine/agents/AgentBus'
import { DealerAgent } from '../engine/agents/DealerAgent'
import { AIPlayerAgent, type ActionScheduler } from '../engine/agents/AIPlayerAgent'
import { GTOPlayerAgent } from '../engine/agents/GTOPlayerAgent'
import { CoachAgent } from '../engine/agents/CoachAgent'
import type { PlayerConfig } from '../engine/game/GameState'
import type { GameState, PlayerAction, Position, ShowdownResult, Street } from '../types/game'
import type { CoachFeedback } from '../types/coach'
import type { HandSummary } from '../types/stats'
import { useSettingsStore, type AiSpeed } from './settingsStore'
import { useSessionStore } from './sessionStore'
import { useProgressStore } from './progressStore'

export const HERO_ID = 'hero'
const SEAT_COUNT = 6

// バス・AIエージェント・DealerAgent は React のライフサイクル外で生存させる。
let bus: AgentBus | null = null
// ヒーローの意思決定コンテキスト (FEEDBACK_READY 受信時に評価の文脈として使う)。
let heroDecisionCtx: { handId: string; street: Street; position: Position } | null = null

// 代替案: play モードでも postflop コーチを出す。ハンド中に hero の postflop 決定 (実ボード込みの
// state) を捕捉し、ハンド後に on-demand で live solve して復習表示する (求解が重いので都度でなく後で)。
let pendingHeroState: GameState | null = null
let handDecisions: HeroDecision[] = []
// U5/B7: hero 純損益の算出用。配当は stack に戻されない(終了stackは拠出後)ため、当ハンドの hero
// 開始スタック(pre-blind)を保持して「拠出 = 開始 − 終了」を求める。cash モードでは毎ハンド変わる。
let heroHandStartStackBB = 100
// B7 cash: 前ハンド終了時の各席スタック(持ち越し)。reset モードや未開始では null。
let carryStacks: Record<string, number> | null = null
// B7: DealerAgent と現在の卓 configs への参照(cash で毎ハンド席スタックを差し替えるため)。
let dealer: DealerAgent | null = null
let baseConfigs: PlayerConfig[] = []
// cash: BB を払えない(<1BB)席はバスト扱いで buyInBB に自動リバイ(ゲーム運用ルール・GTOではない)。
const MIN_PLAYABLE_BB = 1
function rebuy(stack: number | undefined, buyInBB: number): number {
  return stack == null || stack < MIN_PLAYABLE_BB ? buyInBB : Math.round(stack * 100) / 100
}

// U17: hero がフォールド済みのハンドでは、残りの相手同士の決着を遅延0で瞬時に進める
// (自分は結果に影響しないので観戦不要)。submitHeroAction(fold) で立て、HAND_START でリセット。
let heroFoldedThisHand = false

// study モードの「一時停止」ゲート (R7)。ミス(major+)時に AI の送出を保留し、「次へ」で再開する。
// engine は純粋同期のまま。保留は UI 層 (スケジューラ) で実現する。
let paused = false
const emitQueue: Array<() => void> = []
function gate(emit: () => void): void {
  if (paused) emitQueue.push(emit)
  else emit()
}
function setPaused(p: boolean): void {
  paused = p
  // UI が「一時停止中(=次へ待ち)」を判定できるよう store にミラーする。
  useGameStore.setState({ isPaused: p })
  if (!p) {
    const q = emitQueue.splice(0, emitQueue.length)
    q.forEach(e => e())
  }
}
// 既存スケジューラの送出をゲート経由にラップする。
const gated = (sched: ActionScheduler): ActionScheduler => emit => sched(() => gate(emit))

// 相手 AI の「間」(アクション送出の遅延)。読みやすさ優先で base を長めにし、aiSpeed で倍率調整。
// 遅延算出は UI 層に置く (engine を設定ストア非依存に保つ)。emit 時に設定を読むので、速度変更は
// 再初期化なしで次アクションから反映される。
const AI_SPEED_MULT: Record<AiSpeed, number> = { slow: 1.7, normal: 1, fast: 0.5 }
function delayScheduler(baseMs: number, rangeMs: number): ActionScheduler {
  return emit => {
    // U17: hero がフォールド済みなら残りは瞬時に決着させる(遅延0)。
    if (heroFoldedThisHand) { setTimeout(emit, 0); return }
    const mult = AI_SPEED_MULT[useSettingsStore.getState().aiSpeed]
    setTimeout(emit, (baseMs + Math.random() * rangeMs) * mult)
  }
}
// gto はやや思考的に、fish は衝動的にやや速く (相対差は保つ)。
const villainGtoScheduler = delayScheduler(650, 650)  // normal 650–1300ms
const villainFishScheduler = delayScheduler(550, 550) // normal 550–1100ms

// R12: study モードを離れたら一時停止を確実に解除する (resetGame を経由しない appMode 切替の安全網)。
// paused は study のミス時のみ立つので、非 study になったら必ず flush して残留を防ぐ。
useSettingsStore.subscribe(s => {
  if (s.appMode !== 'study' && paused) setPaused(false)
})

// 評価種別 → XP (docs/archive/PHASE_4.md)。
function xpForFeedback(fb: CoachFeedback): number {
  if (fb.kind === 'correct' || fb.kind === 'mixed') return 10
  if (fb.severity === 'minor') return 5
  if (fb.severity === 'major') return 2
  return 1 // critical
}

// hero の postflop 決定 (実ボード込みの state)。ハンド後の復習で live solve する。
export interface HeroDecision { state: GameState; action: PlayerAction; amount: number }

// 直近に hero が打った決定。アクション「後」に GTO 戦略を答え合わせ表示するために保持する (U8)。
// 事前にはレンジを見せないので、この経路は精度サンプルから除外しない (markHinted しない)。
export interface LastHeroDecision { payload: ActionRequiredPayload; action: PlayerAction; amount: number }

interface GameStore {
  gameState: GameState | null
  pendingHeroAction: ActionRequiredPayload | null // != null のとき ActionPanel 表示
  lastResults: ShowdownResult[] | null
  lastFeedback: CoachFeedback | null              // 直近のコーチ評価 (CoachPanel/トースト)
  lastHeroDecision: LastHeroDecision | null       // 直近の hero 決定 (アクション後の答え合わせ表示用・U8)
  isPaused: boolean                               // 答え合わせ表示で AI 送出を保留中 (=「次へ」待ち)
  handReview: HeroDecision[] | null               // play モードの直近ハンドの postflop 決定 (復習用)
  handCount: number
  initialized: boolean
  effectiveStackBB: number                         // B7: 当ハンドの hero 開始スタック(cash 持ち越しの可視化・精度注記用)
  tableRebought: boolean                           // B7: 当ハンド開始時にいずれかの席がリバイした

  initGame: () => void
  startNewHand: () => void
  submitHeroAction: (action: PlayerAction, amount?: number) => void
  dismissFeedback: () => void
  resetGame: () => void // 設定変更時に再初期化 (新しい opponentMode/stackBB を反映)
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  pendingHeroAction: null,
  lastResults: null,
  lastFeedback: null,
  lastHeroDecision: null,
  isPaused: false,
  handReview: null,
  handCount: 0,
  initialized: false,
  effectiveStackBB: 100,
  tableRebought: false,

  initGame: () => {
    if (get().initialized) return // 二重初期化防止
    // B7: スタックは settings が単一の真実源 (buyInBB)。cash の持ち越しは startNewHand で差し替える。
    const buyInBB = useSettingsStore.getState().buyInBB
    heroHandStartStackBB = buyInBB
    carryStacks = null

    bus = new AgentBus()

    // 対戦相手: trainer=gto_ai (ソルバー解を頻度サンプリング) / exploit=fish_ai (リーク持ち)。
    const opponentMode = useSettingsStore.getState().opponentMode
    const opponentType = opponentMode === 'trainer' ? ('gto_ai' as const) : ('fish_ai' as const)
    const configs: PlayerConfig[] = [
      { id: HERO_ID, agentType: 'human', stackBB: buyInBB, isHero: true },
      ...Array.from({ length: SEAT_COUNT - 1 }, (_, i) => ({
        id: `villain${i + 1}`,
        agentType: opponentType,
        stackBB: buyInBB,
        isHero: false,
      })),
    ]
    baseConfigs = configs

    // Hero 以外に AI を割り当て。スケジューラはゲート経由 (study一時停止に対応)。
    for (const cfg of configs) {
      if (cfg.isHero) continue
      if (opponentMode === 'trainer') new GTOPlayerAgent(bus, cfg.id, gated(villainGtoScheduler))
      else new AIPlayerAgent(bus, cfg.id, gated(villainFishScheduler))
    }

    // コーチ: study モードのみ live solve 許可 (precomputed/approximate は常時)。
    const allowLiveSolve = useSettingsStore.getState().appMode === 'study'
    new CoachAgent(bus, HERO_ID, allowLiveSolve)

    bus.on('HAND_START', ({ state }) => {
      handDecisions = []
      pendingHeroState = null
      heroFoldedThisHand = false
      set({ gameState: state, lastResults: null, pendingHeroAction: null, lastFeedback: null, lastHeroDecision: null, handReview: null })
    })
    bus.on('STREET_DEALT', ({ state }) => set({ gameState: state }))
    bus.on('ACTION_REQUIRED', payload => {
      if (payload.playerId === HERO_ID) {
        const hero = payload.state.players.find(p => p.id === HERO_ID)
        heroDecisionCtx = {
          handId: payload.state.handId,
          street: payload.state.street,
          position: hero?.position ?? 'BTN',
        }
        pendingHeroState = payload.state // 復習用: 決定時点の実 state を保持
      }
      set({
        gameState: payload.state,
        pendingHeroAction: payload.playerId === HERO_ID ? payload : null,
      })
    })

    // コーチ評価 → セッション統計・XP へ橋渡し。
    bus.on('FEEDBACK_READY', ({ feedback }) => {
      set({ lastFeedback: feedback })
      const ctx = heroDecisionCtx
      if (ctx) {
        useSessionStore.getState().recordEvaluation(feedback, {
          handId: ctx.handId, street: ctx.street, position: ctx.position, action: feedback.chosen,
        })
      }
      useProgressStore.getState().addXP(xpForFeedback(feedback))
      if (feedback.kind === 'mistake' && feedback.category) {
        useProgressStore.getState().recordMistake(feedback.category)
      }
      // R7: study モードで major+ のミスはハンドを一時停止 (AI送出を保留)。「次へ」で再開。
      const study = useSettingsStore.getState().appMode === 'study'
      if (study && feedback.kind === 'mistake' && feedback.severity !== 'minor') {
        setPaused(true)
      }
    })

    bus.on('HAND_COMPLETE', ({ state, results }) => {
      const handActions = state.actionHistory
      // 各席の受取額。determineWinners は勝者ごとに1結果(winnerId=その席・amountWonBB=その取り分)を
      // 返すので winnerId で集計する(winnerIds.includes だと split で co-winner 分を二重計上する)。
      const wonByPlayer = (id: string) =>
        results.filter(r => r.winnerId === id).reduce((acc, r) => acc + r.amountWonBB, 0)
      // U5: netBB = グロス受取 − 拠出(当ハンド開始stack − 終了stack)。拠出はエンジンの
      // 「配当を stack に戻さない」post-bet stack から求める(以降で表示用に配当を戻す前に確定する)。
      const hero = state.players.find(p => p.id === HERO_ID)
      const invested = heroHandStartStackBB - (hero?.stackBB ?? heroHandStartStackBB)
      const grossWon = wonByPlayer(HERO_ID)
      // B7 fix: エンジンは勝者のポット受取を stackBB に戻さない(post-bet stack のまま)。そのままだと
      // ショーダウンで「勝ったのに席の数字が拠出分だけ減って見える」→ cash で「キャッシュが増えない」体感バグ。
      // ここで各席へ受取を加算し(=真の終了スタック)ポットを空にして award を可視化する。reset/cash 共通で
      // 正しく、cash の持ち越しはこの credited stack をそのまま使う(表示と carry の単一ソース化)。
      const settledPlayers = state.players.map(p => ({
        ...p,
        stackBB: Math.round((p.stackBB + wonByPlayer(p.id)) * 100) / 100,
      }))
      const settledState: GameState = {
        ...state,
        players: settledPlayers,
        pot: { mainPotBB: 0, sidePots: [] },
      }
      // B7 cash: 全席の真の終了スタックを次ハンドへ持ち越す(= 上の credited stack)。
      if (useSettingsStore.getState().stackMode === 'cash') {
        carryStacks = Object.fromEntries(settledPlayers.map(p => [p.id, p.stackBB]))
      }
      const summary: HandSummary = {
        handId: state.handId,
        heroPosition: hero?.position ?? 'BTN',
        won: results.some(r => r.winnerId === HERO_ID),
        netBB: grossWon - invested,
        showdown: state.street === 'showdown',
        timestamp: Date.now(),
      }
      useSessionStore.getState().recordHand(handActions, summary)
      useProgressStore.getState().recordHandPlayed()
      useProgressStore.getState().addXP(5) // 結果ではなく判断にXP (ハンド完了ボーナス)
      // 代替案: play モードは postflop をライブ求解しない (ハンドを止めない)。
      // 捕捉した postflop 決定をハンド後の復習に回す (実ボードを on-demand で求解)。
      const play = useSettingsStore.getState().appMode === 'play'
      const review = play && handDecisions.length > 0 ? handDecisions : null
      set(s => ({
        gameState: settledState,
        lastResults: results,
        pendingHeroAction: null,
        handReview: review,
        handCount: s.handCount + 1,
      }))
    })

    dealer = new DealerAgent(bus, configs, 0)
    set({ initialized: true, effectiveStackBB: buyInBB, tableRebought: false })
  },

  startNewHand: () => {
    if (!get().initialized) get().initGame()
    setPaused(false) // 念のため: 前ハンドの一時停止を解除してから開始
    // B7: 次ハンドの席スタックを確定する。cash=持ち越し(<1BBはリバイ)/ reset=毎ハンド buyInBB。
    const { stackMode, buyInBB } = useSettingsStore.getState()
    let rebought = false
    if (dealer) {
      const cash = stackMode === 'cash' && carryStacks != null
      const next = baseConfigs.map(c => {
        if (!cash) return { ...c, stackBB: buyInBB }
        const carried = carryStacks![c.id]
        if (carried != null && carried < MIN_PLAYABLE_BB) rebought = true
        return { ...c, stackBB: rebuy(carried, buyInBB) }
      })
      baseConfigs = next
      dealer.setConfigs(next)
      heroHandStartStackBB = next.find(c => c.id === HERO_ID)?.stackBB ?? buyInBB
    } else {
      heroHandStartStackBB = buyInBB
    }
    set({ effectiveStackBB: heroHandStartStackBB, tableRebought: rebought })
    bus!.emit('NEW_HAND_REQUEST', {})
  },

  submitHeroAction: (action, amount = 0) => {
    const pending = get().pendingHeroAction
    if (!pending || !bus) return // 自分のターンでなければ無視
    // 復習用: postflop の hero 決定を実 state ごと捕捉 (preflop はライブで既にコーチ可)。
    if (pendingHeroState && pendingHeroState.street !== 'preflop') {
      handDecisions.push({ state: pendingHeroState, action, amount })
    }
    pendingHeroState = null
    // U17: フォールドしたら以降は瞬時決着 (delayScheduler が遅延0に切替)。
    if (action === 'fold') heroFoldedThisHand = true
    // U8: アクション後に GTO 戦略を答え合わせ表示するため、打った決定 (payload) を保持する。
    set({ pendingHeroAction: null, lastHeroDecision: { payload: pending, action, amount } })
    bus.emit('PLAYER_ACTION', { playerId: HERO_ID, action, amount })
    // U16: study + 答え合わせ では、打った後に AI 送出を保留する。解の求解(非同期)中にゲームが進んで
    // 答え合わせが消えるのを防ぎ、「次へ」を押すまで確実に読めるようにする。bus.emit が先に AI を
    // setTimeout 予約するが、実送出は gate を通るので、ここで paused を立てれば保留される。
    const s = useSettingsStore.getState()
    if (s.appMode === 'study' && s.studyShowStrategy) setPaused(true)
  },

  // 「次へ」: フィードバックを閉じ、一時停止していた AI 送出を再開する (R7)。
  dismissFeedback: () => {
    setPaused(false)
    set({ lastFeedback: null })
  },

  // 設定変更時: バス/エージェントを破棄し未初期化に戻す。GamePage が再マウント時に新設定で initGame。
  resetGame: () => {
    bus = null
    dealer = null
    baseConfigs = []
    carryStacks = null
    heroHandStartStackBB = useSettingsStore.getState().buyInBB
    heroDecisionCtx = null
    pendingHeroState = null
    handDecisions = []
    heroFoldedThisHand = false
    setPaused(false)
    emitQueue.length = 0
    set({
      gameState: null, pendingHeroAction: null, lastResults: null,
      lastFeedback: null, lastHeroDecision: null, handReview: null, handCount: 0, initialized: false,
      effectiveStackBB: useSettingsStore.getState().buyInBB, tableRebought: false,
    })
  },
}))
