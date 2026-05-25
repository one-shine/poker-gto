import type { ActionRecord } from './game'
import type { MistakeCategory, PlayerStats } from './stats'

export type TrendDirection = 'improving' | 'stable' | 'regressing'

export interface PlayerTendency {
  category: MistakeCategory
  description: string
  severity: 'critical' | 'major' | 'minor'
  firstDetected: number
  lastOccurrence: number
  occurrenceRate: number // per 100 hands
  trend: TrendDirection
}

export interface TendencySnapshot {
  timestamp: number
  stats: Partial<PlayerStats>
}

export interface WeeklySnapshot {
  weekStart: number
  handsPlayed: number
  gtoAccuracy: number
  evLostPer100: number
  mistakesByCategory: Record<MistakeCategory, number>
}

export type PlayerProfileType = 'calling_station' | 'nit' | 'maniac' | 'tag' | 'lag' | 'balanced'

export interface PlayerProfile {
  type: PlayerProfileType
  vpip: number
  pfr: number
  threebet: number
  foldToCbet: number
  aggressionFactor: number
}

export interface ShortTermMemory {
  sessionId: string
  recentActions: ActionRecord[]
  currentStreak: { gtoCorrect: number; gtoWrong: number }
  sessionPatterns: TendencySnapshot
  mistakeCountThisSession: Record<MistakeCategory, number>
  learnedMoments: Record<string, number> // lessonId → show count
}

export interface MediumTermMemory {
  windowHandCount: number
  weeklySnapshots: WeeklySnapshot[]
  trendsByCategory: Record<MistakeCategory, TrendDirection>
  improvingAreas: string[]
  stallingAreas: string[]
}

export interface LongTermMemory {
  totalHands: number
  coreTendencies: PlayerTendency[]
  masteredConcepts: string[]
  persistentWeaknesses: string[]
  personalityProfile: PlayerProfile | null
  learnedMoments: Record<string, number> // lessonId → total show count (persisted)
}

export interface ReflectionReport {
  period: 'session' | 'weekly' | 'monthly'
  timestamp: number
  improvements: {
    category: MistakeCategory
    before: number
    after: number
    deltaPercent: number
    message: string
  }[]
  persistentIssues: {
    category: MistakeCategory
    duration: string
    mistakeRate: number
    priority: 'high' | 'medium' | 'low'
    suggestedDrill: string
  }[]
  highlights: string[]
  nextGoals: string[]
  overallProgress: number // 0-100
}
