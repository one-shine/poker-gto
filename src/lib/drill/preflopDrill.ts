import type { MistakeCategory } from '../../types/stats'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

export type DrillAction = 'raise' | 'call' | 'fold'

export interface DrillOption {
  action: DrillAction
  label: string
}

export interface PreflopDrillQuestion {
  scenarioId: string
  scenarioLabel: string
  position: string
  hand: string // ハンドカテゴリ (KJs / KJo / AA)
  options: DrillOption[]
}

export interface ActionFreq {
  action: DrillAction
  freq: number
}

export interface DrillJudgement {
  correct: boolean
  chosen: DrillAction
  best: ActionFreq[] // 頻度 ≥ 0.10 の正解アクション
  all: ActionFreq[]  // 全アクションの頻度 (説明用)
}

const MIXED_THRESHOLD = 0.10

export function allHandCategories(): string[] {
  const out: string[] = []
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      if (i === j) out.push(RANKS[i] + RANKS[i])
      else if (i < j) out.push(RANKS[i] + RANKS[j] + 's')
      else out.push(RANKS[j] + RANKS[i] + 'o')
    }
  }
  return [...new Set(out)]
}

// シナリオ + ハンドから各アクションの頻度を返す (未収録 = fold 100%)。
export function actionFreqs(scenarioId: string, hand: string): ActionFreq[] {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  const cell = sc?.cells[hand]
  const raise = cell?.raise ?? 0
  const call = cell?.call ?? 0
  const fold = Math.max(0, 1 - raise - call)
  return [
    { action: 'raise', freq: raise },
    { action: 'call', freq: call },
    { action: 'fold', freq: fold },
  ]
}

// シナリオが取りうる選択肢 (call を含むのは BB ディフェンス系のみ)。
function optionsFor(scenarioId: string): DrillOption[] {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  const hasCall = sc ? Object.values(sc.cells).some(c => c.call > 0) : false
  const raiseLabel = hasCall ? '3Bet' : 'レイズ'
  return hasCall
    ? [{ action: 'raise', label: raiseLabel }, { action: 'call', label: 'コール' }, { action: 'fold', label: 'フォールド' }]
    : [{ action: 'raise', label: raiseLabel }, { action: 'fold', label: 'フォールド' }]
}

// MistakeCategory → 出題対象シナリオの絞り込み。
function scenariosForCategory(category?: MistakeCategory): typeof PREFLOP_SCENARIOS {
  if (!category) return PREFLOP_SCENARIOS
  if (category.startsWith('blind_defense')) return PREFLOP_SCENARIOS.filter(s => s.id.startsWith('bb-vs-'))
  if (category === 'sb_limp') return PREFLOP_SCENARIOS.filter(s => s.id === 'sb-open')
  if (category.startsWith('preflop')) return PREFLOP_SCENARIOS.filter(s => s.id.endsWith('-open'))
  return PREFLOP_SCENARIOS
}

export function generateQuestion(rng: () => number = Math.random, category?: MistakeCategory): PreflopDrillQuestion {
  const pool = scenariosForCategory(category)
  const list = pool.length > 0 ? pool : PREFLOP_SCENARIOS
  const sc = list[(rng() * list.length) | 0]
  const cats = allHandCategories()
  const hand = cats[(rng() * cats.length) | 0]
  return {
    scenarioId: sc.id,
    scenarioLabel: sc.label,
    position: sc.position,
    hand,
    options: optionsFor(sc.id),
  }
}

export function judge(question: PreflopDrillQuestion, chosen: DrillAction): DrillJudgement {
  const all = actionFreqs(question.scenarioId, question.hand)
  const best = all.filter(a => a.freq >= MIXED_THRESHOLD)
  const chosenFreq = all.find(a => a.action === chosen)?.freq ?? 0
  return { correct: chosenFreq >= MIXED_THRESHOLD, chosen, best, all }
}
