import type { PlayerAction, Position, SkillLevel, Street } from './game'

// EV損失の大きさ (BB) に基づく Snowie 流3段階。重大度は evLoss が決める (カテゴリではない)。
export type MistakeSeverity = 'minor' | 'major' | 'critical'

export interface MistakeRecord {
  handId: string
  street: Street
  position: Position
  action: PlayerAction
  category: MistakeCategory
  severity: MistakeSeverity
  evLoss: number // BB。source が approximate のときは 0 (数値非提示)
  timestamp: number
}

export type MistakeCategory =
  | 'preflop_too_wide'
  | 'preflop_too_tight'
  | 'preflop_passive'  // レイズ推奨手を受動的にコール/リンプ (アクション選択の誤り)
  | 'preflop_sizing'   // アクションは正しいがベット/レイズサイズが標準から逸脱
  | 'fold_to_3bet'
  | 'call_3bet_oop'
  | 'blind_defense_wide'
  | 'blind_defense_tight'
  | 'sb_limp'
  | 'missed_cbet_ip'
  | 'cbet_oop_too_wide'
  | 'check_ip_missed_value'
  | 'oop_donk_bet'
  | 'bluff_frequency'
  | 'value_bet_missed'

// 各ハンドの結果サマリ (U5)。handHistory(アクション列)と handId で対応付ける。
export interface HandSummary {
  handId: string
  heroPosition: Position
  won: boolean
  netBB: number   // hero 純損益 (+受取 / −拠出)
  showdown: boolean
  timestamp: number
}

export interface PositionStats {
  position: Position
  handsPlayed: number
  vpip: number
  pfr: number
  threebet: number
  foldToSteal: number
  stealAttempt: number
  af: number
  gtoAccuracy: number
  evLost: number
}

export interface PlayerStats {
  vpip: number
  pfr: number
  threebet: number
  foldTo3bet: number
  squeeze: number
  coldCall: number
  af: number
  afByStreet: { flop: number; turn: number; river: number }
  wtsd: number
  wsd: number
  cbet: { flop: number; turn: number; river: number }
  foldToCbet: number
  checkRaise: number
  gtoAccuracy: number
  evLostPer100: number
  mistakeRate: number
  byPosition: Record<Position, PositionStats>
  mistakesByCategory: Record<MistakeCategory, number>
}

export interface PlayerProgress {
  level: SkillLevel
  xp: number
  handsPlayed: number
  mistakeRate: number
  evLostPer100: number
  mistakesByCategory: Record<MistakeCategory, number>
  statsByPosition: Record<Position, PositionStats>
  weakestPosition: Position | null
  strongestPosition: Position | null
  masteredConcepts: string[]
}

// ドリル成績 (U4)。集計軸は MistakeCategory に乗らない (postflop=street/potType, pushfold=role/stack)
// ため専用の bucketKey で持つ。
export type DrillKind = 'preflop' | 'postflop' | 'pushfold'

export interface DrillStat {
  attempts: number
  correct: number
}

export interface DrillResult {
  kind: DrillKind
  bucketKey: string   // 集計キー (preflop=scenarioId / postflop=`potType:street` / pushfold=`role:stackbb`)
  bucketLabel: string // 表示用の日本語ラベル
  correct: boolean
  chosen: string
  evLoss: number | null // postflop/pushfold のみ算出。preflop(近似レンジ=EV非提示)は null
  timestamp: number
}

export interface UIComplexity {
  showPotOdds: boolean
  showBoardAnalysis: boolean
  showRangeAdvantage: boolean
  showMixedStrategies: boolean
}

export const XP_THRESHOLDS: Record<SkillLevel, number> = {
  beginner: 0,
  intermediate: 500,
  advanced: 2000,
  pro: 8000,
}

export const MIN_SAMPLE_SIZE = 20
