import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Position, SkillLevel } from '../types/game'
import type { MistakeCategory, PlayerProgress, PositionStats, UIComplexity } from '../types/stats'
import { XP_THRESHOLDS } from '../types/stats'

const POSITIONS: Position[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']
const CATEGORIES: MistakeCategory[] = [
  'preflop_too_wide', 'preflop_too_tight', 'preflop_passive', 'preflop_sizing',
  'fold_to_3bet', 'call_3bet_oop', 'blind_defense_wide', 'blind_defense_tight', 'sb_limp',
  'missed_cbet_ip', 'cbet_oop_too_wide', 'check_ip_missed_value', 'oop_donk_bet',
  'bluff_frequency', 'value_bet_missed',
]

function emptyPositionStats(position: Position): PositionStats {
  return {
    position, handsPlayed: 0, vpip: 0, pfr: 0, threebet: 0, foldToSteal: 0,
    stealAttempt: 0, af: 0, gtoAccuracy: 0, evLost: 0,
  }
}
const zeroByCategory = () =>
  Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<MistakeCategory, number>
const zeroByPosition = () =>
  Object.fromEntries(POSITIONS.map(p => [p, emptyPositionStats(p)])) as Record<Position, PositionStats>

// XP からスキルレベルを導く (XP_THRESHOLDS 以下で最大のレベル)。
export function levelFromXP(xp: number): SkillLevel {
  const order: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'pro']
  let level: SkillLevel = 'beginner'
  for (const l of order) if (xp >= XP_THRESHOLDS[l]) level = l
  return level
}

// レベル別のプログレッシブUI開示 (CLAUDE.md / src CLAUDE.md)。
export function computeUIComplexity(level: SkillLevel): UIComplexity {
  return {
    showPotOdds: level !== 'beginner',
    showBoardAnalysis: level !== 'beginner',
    showRangeAdvantage: level === 'advanced' || level === 'pro',
    showMixedStrategies: level === 'pro',
  }
}

function initialProgress(): PlayerProgress {
  return {
    level: 'beginner', xp: 0, handsPlayed: 0, mistakeRate: 0, evLostPer100: 0,
    mistakesByCategory: zeroByCategory(), statsByPosition: zeroByPosition(),
    weakestPosition: null, strongestPosition: null, masteredConcepts: [],
  }
}

interface ProgressStore {
  progress: PlayerProgress
  uiComplexity: UIComplexity

  addXP: (amount: number) => void
  recordMistake: (category: MistakeCategory) => void
  recordHandPlayed: () => void
  resetProgress: () => void
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    set => ({
      progress: initialProgress(),
      uiComplexity: computeUIComplexity('beginner'),

      addXP: amount =>
        set(s => {
          const xp = s.progress.xp + amount
          const level = levelFromXP(xp)
          return { progress: { ...s.progress, xp, level }, uiComplexity: computeUIComplexity(level) }
        }),

      recordMistake: category =>
        set(s => ({
          progress: {
            ...s.progress,
            mistakesByCategory: {
              ...s.progress.mistakesByCategory,
              [category]: (s.progress.mistakesByCategory[category] ?? 0) + 1,
            },
          },
        })),

      recordHandPlayed: () =>
        set(s => ({ progress: { ...s.progress, handsPlayed: s.progress.handsPlayed + 1 } })),

      resetProgress: () =>
        set({ progress: initialProgress(), uiComplexity: computeUIComplexity('beginner') }),
    }),
    { name: 'poker-gto-progress' },
  ),
)
