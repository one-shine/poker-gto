import { create } from 'zustand'
import { AgentBus, type ActionRequiredPayload } from '../engine/agents/AgentBus'
import { DealerAgent } from '../engine/agents/DealerAgent'
import { AIPlayerAgent, fishDelayScheduler, type ActionScheduler } from '../engine/agents/AIPlayerAgent'
import { GTOPlayerAgent, gtoDelayScheduler } from '../engine/agents/GTOPlayerAgent'
import { CoachAgent } from '../engine/agents/CoachAgent'
import type { PlayerConfig } from '../engine/game/GameState'
import type { GameState, PlayerAction, Position, ShowdownResult, Street } from '../types/game'
import type { CoachFeedback } from '../types/coach'
import { useSettingsStore } from './settingsStore'
import { useSessionStore } from './sessionStore'
import { useProgressStore } from './progressStore'

export const HERO_ID = 'hero'
const SEAT_COUNT = 6

// バス・AIエージェント・DealerAgent は React のライフサイクル外で生存させる。
let bus: AgentBus | null = null
// ヒーローの意思決定コンテキスト (FEEDBACK_READY 受信時に評価の文脈として使う)。
let heroDecisionCtx: { handId: string; street: Street; position: Position } | null = null

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
  if (!p) {
    const q = emitQueue.splice(0, emitQueue.length)
    q.forEach(e => e())
  }
}
// 既存スケジューラの送出をゲート経由にラップする。
const gated = (sched: ActionScheduler): ActionScheduler => emit => sched(() => gate(emit))

// 評価種別 → XP (docs/PHASE_4.md)。
function xpForFeedback(fb: CoachFeedback): number {
  if (fb.kind === 'correct' || fb.kind === 'mixed') return 10
  if (fb.severity === 'minor') return 5
  if (fb.severity === 'major') return 2
  return 1 // critical
}

interface GameStore {
  gameState: GameState | null
  pendingHeroAction: ActionRequiredPayload | null // != null のとき ActionPanel 表示
  lastResults: ShowdownResult[] | null
  lastFeedback: CoachFeedback | null              // 直近のコーチ評価 (CoachPanel/トースト)
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
  handCount: 0,
  initialized: false,

  initGame: (stackBB = 100) => {
    if (get().initialized) return // 二重初期化防止

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
      if (opponentMode === 'trainer') new GTOPlayerAgent(bus, cfg.id, gated(gtoDelayScheduler))
      else new AIPlayerAgent(bus, cfg.id, gated(fishDelayScheduler))
    }

    // コーチ: study モードのみ live solve 許可 (precomputed/approximate は常時)。
    const allowLiveSolve = useSettingsStore.getState().appMode === 'study'
    new CoachAgent(bus, HERO_ID, allowLiveSolve)

    bus.on('HAND_START', ({ state }) => {
      set({ gameState: state, lastResults: null, pendingHeroAction: null, lastFeedback: null })
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
      useSessionStore.getState().recordHand(handActions)
      useProgressStore.getState().recordHandPlayed()
      useProgressStore.getState().addXP(5) // 結果ではなく判断にXP (ハンド完了ボーナス)
      set(s => ({
        gameState: state,
        lastResults: results,
        pendingHeroAction: null,
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
    set({ pendingHeroAction: null })
    bus.emit('PLAYER_ACTION', { playerId: HERO_ID, action, amount })
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
    setPaused(false)
    emitQueue.length = 0
    set({
      gameState: null, pendingHeroAction: null, lastResults: null,
      lastFeedback: null, handCount: 0, initialized: false,
    })
  },
}))
