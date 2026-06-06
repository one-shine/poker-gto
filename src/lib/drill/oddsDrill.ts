// オッズ算術の学習ドリル (ソルバー不要の純計算)。GTO 頻度とは別の「オッズの暗算」練習。
// 3種: 必要勝率 / コール・フォールド判断 / アウツ→勝率(×2・×4 ルール)。
// 数値は理論 `pot-odds`(half25 / ⅔29 / pot33% ・アウツ×2/×4)に準拠。

export type OddsQuestionType = 'required-equity' | 'call-fold' | 'outs-equity'

export const ODDS_TYPE_JP: Record<OddsQuestionType, string> = {
  'required-equity': '必要勝率',
  'call-fold': 'コール判断',
  'outs-equity': 'アウツ→勝率',
}

export interface OddsOption { id: string; label: string }

export interface OddsQuestion {
  type: OddsQuestionType
  prompt: string
  options: OddsOption[]
  correctId: string
  explain: string
  // 検証/表示補助
  meta: { potBB?: number; betBB?: number; requiredPct?: number; equityPct?: number; outs?: number; mult?: number }
}

export interface OddsJudgement {
  correct: boolean
  chosen: string
  correctId: string
  correctLabel: string
  explain: string
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

// 必要勝率(0..1) = コール額 ÷ (現ポット + コール額)。
// ここで P=相手ベット前のポット、B=相手ベット → 現ポット=P+B、コール=B → B/((P+B)+B)=B/(P+2B)。
export function requiredEquity(potBB: number, betBB: number): number {
  return betBB / (potBB + 2 * betBB)
}

// 正解%を含む4択(紛らわしい近傍%を散らす)。
function pctOptions(correct: number, rng: () => number): OddsOption[] {
  const set = new Set<number>([correct])
  const deltas = [5, 7, 8, 10, 12, 15, -5, -7, -8, -10, -12, -15]
  // rng で順序を散らす(厳密なシャッフルでなくてよい)
  const order = deltas.map(d => ({ d, k: rng() })).sort((a, b) => a.k - b.k).map(x => x.d)
  for (const d of order) {
    if (set.size >= 4) break
    const v = correct + d
    if (v >= 3 && v <= 95) set.add(v)
  }
  let f = 5
  while (set.size < 4) { const v = Math.min(95, correct + f); if (!set.has(v)) set.add(v); f += 5 }
  return [...set].sort((a, b) => a - b).map(v => ({ id: `p${v}`, label: `${v}%` }))
}

const SIZES = [
  { label: '½ポット', frac: 0.5 },
  { label: '⅔ポット', frac: 2 / 3 },
  { label: '¾ポット', frac: 0.75 },
  { label: 'ポット', frac: 1 },
] as const

function genRequiredEquity(rng: () => number): OddsQuestion {
  const pot = pick([4, 5, 6, 8, 10, 12], rng)
  const { label, frac } = pick(SIZES, rng)
  const bet = +(pot * frac).toFixed(1)
  const requiredPct = Math.round(requiredEquity(pot, bet) * 100)
  return {
    type: 'required-equity',
    prompt: `ポット ${pot}BB に相手が ${bet}BB(${label})ベット。コールに必要な勝率は?`,
    options: pctOptions(requiredPct, rng),
    correctId: `p${requiredPct}`,
    explain: `必要勝率 = コール ${bet} ÷ (ポット ${(+(pot + bet).toFixed(1))} + コール ${bet}) = ${requiredPct}%。暗算目安: ½→25% / ⅔→29% / ポット→33%。`,
    meta: { potBB: pot, betBB: bet, requiredPct },
  }
}

function genCallFold(rng: () => number): OddsQuestion {
  const pot = pick([4, 6, 8, 10], rng)
  const { label, frac } = pick(SIZES.slice(0, 3), rng) // ½/⅔/pot (¾は省く)
  const bet = +(pot * frac).toFixed(1)
  const requiredPct = Math.round(requiredEquity(pot, bet) * 100)
  const offset = pick([8, 12, 18, -8, -12, -18], rng)
  const equityPct = Math.max(8, Math.min(88, requiredPct + offset))
  const shouldCall = equityPct >= requiredPct
  return {
    type: 'call-fold',
    prompt: `ポット ${pot}BB に相手が ${bet}BB(${label})ベット。あなたの勝率は ${equityPct}%。コール? フォールド?`,
    options: [{ id: 'call', label: 'コール' }, { id: 'fold', label: 'フォールド' }],
    correctId: shouldCall ? 'call' : 'fold',
    explain: `必要勝率 ${requiredPct}% に対し勝率 ${equityPct}% → ${shouldCall ? 'コール有利(オッズが足りる)' : 'フォールド寄り(オッズ不足)'}。`,
    meta: { potBB: pot, betBB: bet, requiredPct, equityPct },
  }
}

const DRAWS = [
  { outs: 9, name: 'フラッシュドロー' },
  { outs: 8, name: 'オープンエンドストレートドロー' },
  { outs: 4, name: 'ガットショット' },
  { outs: 6, name: 'オーバーカード2枚' },
  { outs: 12, name: 'フラッシュ+ガットショットのコンボ' },
] as const
const OUTS_MODES = [
  { label: 'フロップ', cards: '次のターン1枚', mult: 2, rule: 'アウツ×2(残り1枚)' },
  { label: 'フロップ', cards: 'リバーまでの2枚', mult: 4, rule: 'アウツ×4(残り2枚)' },
  { label: 'ターン', cards: 'リバー1枚', mult: 2, rule: 'アウツ×2(残り1枚)' },
] as const

function genOutsEquity(rng: () => number): OddsQuestion {
  const d = pick(DRAWS, rng)
  const m = pick(OUTS_MODES, rng)
  const equityPct = Math.min(95, d.outs * m.mult)
  return {
    type: 'outs-equity',
    prompt: `${m.label}で ${d.name}(${d.outs}アウツ)。${m.cards}で完成する勝率の目安は?`,
    options: pctOptions(equityPct, rng),
    correctId: `p${equityPct}`,
    explain: `${m.rule}: ${d.outs}×${m.mult} ≈ ${equityPct}%(あくまで暗算の概算)。`,
    meta: { outs: d.outs, mult: m.mult, equityPct },
  }
}

const TYPES: readonly OddsQuestionType[] = ['required-equity', 'call-fold', 'outs-equity']

export function generateOddsQuestion(rng: () => number = Math.random, type?: OddsQuestionType): OddsQuestion {
  const t = type ?? pick(TYPES, rng)
  return t === 'required-equity' ? genRequiredEquity(rng) : t === 'call-fold' ? genCallFold(rng) : genOutsEquity(rng)
}

export function judgeOdds(q: OddsQuestion, chosenId: string): OddsJudgement {
  return {
    correct: chosenId === q.correctId,
    chosen: chosenId,
    correctId: q.correctId,
    correctLabel: q.options.find(o => o.id === q.correctId)?.label ?? '',
    explain: q.explain,
  }
}
