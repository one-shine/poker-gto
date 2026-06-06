import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ActionRecord, Position } from '../types/game'
import type { CoachFeedback } from '../types/coach'
import type { HandSummary, MistakeRecord } from '../types/stats'
import { idbStorage } from '../lib/storage/idbStorage'

// R25: IDB へ移行し履歴上限を緩和 (旧 localStorage は idbStorage が自動マイグレーション)。
// 上限を 0 = 無制限にしないのは、UI 表示・集計の単純化と、IDB 内で 1 ストアが過大化するのを避けるため。
const MAX_HISTORY = 1000

interface SessionStore {
  handHistory: ActionRecord[][]   // ハンドごとのアクション列
  handSummaries: HandSummary[]    // 各ハンドの結果 (勝敗/純損益)。handHistory と handId で対応 (U5)
  mistakes: MistakeRecord[]
  evaluatedCount: number          // 評価されたヒーロー判断数 (精度の母数)
  correctCount: number            // 正解 (correct + mixed)
  // R20: ポジション別の厳密な精度母数。decisions(全HU判断)でなく「実際にコーチが評価した数」を持つ。
  evalByPosition: Partial<Record<Position, { evaluated: number; correct: number }>>
  sessionHandCount: number
  hintedHandIds: Set<string>      // ヒント参照ハンド (精度サンプルから除外)

  recordEvaluation: (fb: CoachFeedback, ctx: { handId: string; street: ActionRecord['street']; position: MistakeRecord['position']; action: MistakeRecord['action'] }) => void
  recordHand: (actions: ActionRecord[], summary?: HandSummary) => void
  markHinted: (handId: string) => void
  gtoAccuracy: () => number | null // null = サンプルなし
  clearSession: () => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
  handHistory: [],
  handSummaries: [],
  mistakes: [],
  evaluatedCount: 0,
  correctCount: 0,
  evalByPosition: {},
  sessionHandCount: 0,
  hintedHandIds: new Set(),

  recordEvaluation: (fb, ctx) =>
    set(s => {
      // ヒント参照ハンドは精度サンプルから除外 (実力測定の汚染防止・docs/archive/PHASE_3.md)
      const counted = !s.hintedHandIds.has(ctx.handId)
      const isCorrect = fb.kind !== 'mistake'
      const mistakes = fb.kind === 'mistake'
        ? [...s.mistakes, {
            handId: ctx.handId, street: ctx.street, position: ctx.position, action: ctx.action,
            category: fb.category!, severity: fb.severity!, evLoss: fb.evLoss, timestamp: Date.now(),
          } satisfies MistakeRecord]
        : s.mistakes
      // R20: ポジション別にも評価/正解を計上 (ヒント参照ハンドは同様に除外)。
      let evalByPosition = s.evalByPosition
      if (counted) {
        const prev = s.evalByPosition[ctx.position] ?? { evaluated: 0, correct: 0 }
        evalByPosition = {
          ...s.evalByPosition,
          [ctx.position]: { evaluated: prev.evaluated + 1, correct: prev.correct + (isCorrect ? 1 : 0) },
        }
      }
      return {
        mistakes,
        evaluatedCount: s.evaluatedCount + (counted ? 1 : 0),
        correctCount: s.correctCount + (counted && isCorrect ? 1 : 0),
        evalByPosition,
      }
    }),

  // handHistory と handSummaries は同時 push + 同一 slice で件数・順序を一致させ、handId で対応付ける。
  recordHand: (actions, summary) =>
    set(s => ({
      handHistory: [...s.handHistory, actions].slice(-MAX_HISTORY),
      handSummaries: summary ? [...s.handSummaries, summary].slice(-MAX_HISTORY) : s.handSummaries,
      sessionHandCount: s.sessionHandCount + 1,
    })),

  markHinted: handId =>
    set(s => ({ hintedHandIds: new Set(s.hintedHandIds).add(handId) })),

  gtoAccuracy: () => {
    const { evaluatedCount, correctCount } = get()
    return evaluatedCount === 0 ? null : correctCount / evaluatedCount
  },

  clearSession: () =>
    set({
      handHistory: [], handSummaries: [], mistakes: [], evaluatedCount: 0, correctCount: 0,
      evalByPosition: {}, sessionHandCount: 0, hintedHandIds: new Set(),
    }),
    }),
    {
      name: 'poker-gto-session',
      storage: createJSONStorage(() => idbStorage),
      // Set はそのまま JSON 化できないため配列に変換して保存/復元する。
      partialize: s => ({
        handHistory: s.handHistory, handSummaries: s.handSummaries, mistakes: s.mistakes,
        evaluatedCount: s.evaluatedCount, correctCount: s.correctCount,
        evalByPosition: s.evalByPosition,
        sessionHandCount: s.sessionHandCount, hintedHandIds: [...s.hintedHandIds],
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SessionStore> & { hintedHandIds?: string[] }
        // 旧データに handSummaries が無い場合は [] で補完 (後方互換)。
        return { ...current, ...p, handSummaries: p.handSummaries ?? [], hintedHandIds: new Set(p.hintedHandIds ?? []) }
      },
    },
  ),
)
