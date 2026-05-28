import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ActionRecord } from '../types/game'
import type { CoachFeedback } from '../types/coach'
import type { MistakeRecord } from '../types/stats'
import { idbStorage } from '../lib/storage/idbStorage'

// R25: IDB へ移行し履歴上限を緩和 (旧 localStorage は idbStorage が自動マイグレーション)。
// 上限を 0 = 無制限にしないのは、UI 表示・集計の単純化と、IDB 内で 1 ストアが過大化するのを避けるため。
const MAX_HISTORY = 1000

interface SessionStore {
  handHistory: ActionRecord[][]   // ハンドごとのアクション列
  mistakes: MistakeRecord[]
  evaluatedCount: number          // 評価されたヒーロー判断数 (精度の母数)
  correctCount: number            // 正解 (correct + mixed)
  sessionHandCount: number
  hintedHandIds: Set<string>      // ヒント参照ハンド (精度サンプルから除外)

  recordEvaluation: (fb: CoachFeedback, ctx: { handId: string; street: ActionRecord['street']; position: MistakeRecord['position']; action: MistakeRecord['action'] }) => void
  recordHand: (actions: ActionRecord[]) => void
  markHinted: (handId: string) => void
  gtoAccuracy: () => number | null // null = サンプルなし
  clearSession: () => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
  handHistory: [],
  mistakes: [],
  evaluatedCount: 0,
  correctCount: 0,
  sessionHandCount: 0,
  hintedHandIds: new Set(),

  recordEvaluation: (fb, ctx) =>
    set(s => {
      // ヒント参照ハンドは精度サンプルから除外 (実力測定の汚染防止・docs/PHASE_3.md)
      const counted = !s.hintedHandIds.has(ctx.handId)
      const isCorrect = fb.kind !== 'mistake'
      const mistakes = fb.kind === 'mistake'
        ? [...s.mistakes, {
            handId: ctx.handId, street: ctx.street, position: ctx.position, action: ctx.action,
            category: fb.category!, severity: fb.severity!, evLoss: fb.evLoss, timestamp: Date.now(),
          } satisfies MistakeRecord]
        : s.mistakes
      return {
        mistakes,
        evaluatedCount: s.evaluatedCount + (counted ? 1 : 0),
        correctCount: s.correctCount + (counted && isCorrect ? 1 : 0),
      }
    }),

  recordHand: actions =>
    set(s => ({
      handHistory: [...s.handHistory, actions].slice(-MAX_HISTORY),
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
      handHistory: [], mistakes: [], evaluatedCount: 0, correctCount: 0,
      sessionHandCount: 0, hintedHandIds: new Set(),
    }),
    }),
    {
      name: 'poker-gto-session',
      storage: createJSONStorage(() => idbStorage),
      // Set はそのまま JSON 化できないため配列に変換して保存/復元する。
      partialize: s => ({
        handHistory: s.handHistory, mistakes: s.mistakes,
        evaluatedCount: s.evaluatedCount, correctCount: s.correctCount,
        sessionHandCount: s.sessionHandCount, hintedHandIds: [...s.hintedHandIds],
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SessionStore> & { hintedHandIds?: string[] }
        return { ...current, ...p, hintedHandIds: new Set(p.hintedHandIds ?? []) }
      },
    },
  ),
)
