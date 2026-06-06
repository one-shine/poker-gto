import type { MistakeCategory } from '../../types/stats'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { handTier, preflopPrinciple } from '../coach/coachConcepts'
import { MIXED_STRATEGY_THRESHOLD as MIXED_THRESHOLD } from '../../types/gtoRules'

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

// シナリオが取りうる選択肢。レイズの呼称はスポット種別で変える (オープン/3bet/4bet)。
function optionsFor(scenarioId: string): DrillOption[] {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  const hasCall = sc ? Object.values(sc.cells).some(c => c.call > 0) : false
  // 対3bet スポット(opener応答)では raise=4bet。それ以外で call を含む=defenderの3bet。
  const raiseLabel = scenarioId.endsWith('-3bet') ? '4Bet' : hasCall ? '3Bet' : 'レイズ'
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

// ポジションごとの目安オープン頻度 (一般理論・近似)。後ろの席ほど広く開ける根拠の数値。
// heuristic: not GTO-exact — 監修済みの代表値であり、ソルバー厳密値ではない。
const POSITION_OPEN_FREQ: Record<string, string> = {
  UTG: 'UTGは約13%', MP: 'MPは約17%', LJ: 'LJは約20%', HJ: 'HJは約23%',
  CO: 'COは約27%', BTN: 'BTNは約44%', SB: 'SBは約35%',
}

// 推奨頻度のスケール感を1文で (近似レンジには実EVが無いので頻度ギャップで代替する)。
function freqContext(judgement: DrillJudgement, chosen: DrillAction): string {
  const chosenFreq = judgement.all.find(a => a.action === chosen)?.freq ?? 0
  const top = [...judgement.best].sort((a, b) => b.freq - a.freq)[0]
  if (!top) return ''
  const pct = (f: number) => `${Math.round(f * 100)}%`
  if (chosenFreq < MIXED_THRESHOLD) {
    return `推奨頻度との差: ${pct(top.freq)} vs あなた ${pct(chosenFreq)}。`
  }
  return ''
}

// 短い説明文 (なぜこの推奨か)。スポット種別 + ポジション頻度 + ハンド階層で一般原則を述べる。
// approximate レンジのため実EVは無く、定性的な指針 + 頻度スケールに留める (GTO厳密と称さない)。
export function explainPreflop(question: PreflopDrillQuestion, judgement: DrillJudgement): string {
  const hasCall = question.options.some(o => o.action === 'call')
  const is3bet = question.scenarioId.endsWith('-3bet')
  const primary = [...judgement.best].sort((a, b) => b.freq - a.freq)[0]?.action
  const mixed = judgement.best.length > 1 ? 'ミックス: ' : ''
  const tier = handTier(question.hand)
  // coachConcepts の一般原則を1文目に据え、文脈 (オッズ/位置) を足して2〜3文にする。
  const principle = preflopPrinciple(question.hand, question.position, primary ?? 'fold')
  const posFreq = POSITION_OPEN_FREQ[question.position]
  const ctx = freqContext(judgement, judgement.chosen)

  if (!primary || primary === 'fold') {
    const lead = hasCall
      ? `${tier.label}。このディフェンスレンジには入らずフォールド。`
      : `${tier.label}。${question.position} のオープンレンジ外でフォールド。`
    const why = hasCall
      ? '勝率でオッズを満たしても、ポジション不利でエクイティ実現が下がる手は無理に続けない。'
      : posFreq
        ? `後ろの席ほど広く開ける (${posFreq}・BTNは約44%) ため、前ポジションでは強い手に絞る。`
        : '後に行動される不利を考え、弱い手は降りる。'
    return [lead, why, ctx].filter(Boolean).join(' ')
  }
  if (primary === 'call') {
    return [`${mixed}${principle}`, 'プリフロップのコールはポットオッズと、フロップ以降のプレイアビリティで判断する。', ctx]
      .filter(Boolean).join(' ')
  }
  // raise
  const role = is3bet
    ? 'バリューとブロッカー (Aを持つ手など) を混ぜた4bet候補。レイズし返して主導権を握る。'
    : hasCall
      ? 'バリュー/ブロッカーで3betし、相手のオープンに圧力をかける。'
      : posFreq
        ? `${question.position} のオープンレンジに入る強さ (${posFreq})。受動的に入らずレイズで主導権を取る。`
        : 'オープンレンジに入る強さ。受動的に入らずレイズ。'
  return [`${mixed}${principle}`, role, ctx].filter(Boolean).join(' ')
}

export function judge(question: PreflopDrillQuestion, chosen: DrillAction): DrillJudgement {
  const all = actionFreqs(question.scenarioId, question.hand)
  const best = all.filter(a => a.freq >= MIXED_THRESHOLD)
  const chosenFreq = all.find(a => a.action === chosen)?.freq ?? 0
  return { correct: chosenFreq >= MIXED_THRESHOLD, chosen, best, all }
}
