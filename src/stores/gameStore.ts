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
// U5: hero 純損益の算出用。配当は stack に戻されない(終了stackは拠出後)ため、開始stackを保持して
// 「拠出 = 開始 − 終了」を求める。initGame の stackBB を覚える。
let startStackBB = 100

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

  initGame: (stackBB?: number) => void
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

  initGame: (stackBB = 100) => {
    if (get().initialized) return // 二重初期化防止
    startStackBB = stackBB

    bus = new AgentBus()

    // 対戦相手: trainer=gto_ai (ソルバー解を頻度サンプリング) / exploit=fish_ai (リーク持ち)。
    const opponentMode = useSettingsStore.getState().opponentMode
    const opponentType = opponentMode === 'trainer' ? ('gto_ai' as const) : ('fish_ai' as const)
    const configs: PlayerConfig[] = [
      { id: HERO_ID, agentType: 'human', stackBB, isHero: true },
      ...Array.from({ length: SEAT_COUNT - 1 }, (_, i) => ({
        id: `villain${i + 1}`,
        agentType: opponentType,
        stackBB,
        isHero: false,
      })),
    ]

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
      // U5: hero の勝敗/純損益を算出してハンド結果サマリを残す。
      // netBB = グロス受取(自分が勝者の結果の amountWonBB 合計) − 拠出(開始stack − 終了stack)。
      // 配当は stack に戻されない実装のため、stack 差分がそのまま拠出になる。
      const hero = state.players.find(p => p.id === HERO_ID)
      const invested = startStackBB - (hero?.stackBB ?? startStackBB)
      const grossWon = results.filter(r => r.winnerIds.includes(HERO_ID)).reduce((acc, r) => acc + r.amountWonBB, 0)
      const summary: HandSummary = {
        handId: state.handId,
        heroPosition: hero?.position ?? 'BTN',
        won: results.some(r => r.winnerIds.includes(HERO_ID)),
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
        gameState: state,
        lastResults: results,
        pendingHeroAction: null,
        handReview: review,
        handCount: s.handCount + 1,
      }))
    })

    new DealerAgent(bus, configs, 0)
    set({ initialized: true })
  },

  startNewHand: () => {
    if (!get().initialized) get().initGame()
    setPaused(false) // 念のため: 前ハンドの一時停止を解除してから開始
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
    heroDecisionCtx = null
    pendingHeroState = null
    handDecisions = []
    setPaused(false)
    emitQueue.length = 0
    set({
      gameState: null, pendingHeroAction: null, lastResults: null,
      lastFeedback: null, lastHeroDecision: null, handReview: null, handCount: 0, initialized: false,
    })
  },
}))
