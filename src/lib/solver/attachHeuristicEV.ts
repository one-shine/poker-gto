import type { ActionSolution, NodeSolution } from '../../types/solver'
import type { RangeScenario } from '../../types/ranges'
import { CATEGORIES } from './pushFold'
import { RANKS } from '../../engine/cards/Card'
import type { Rank } from '../../types/game'

// ── opener spot のヒューリスティック EV を既存の手作り戦略に被せる ──────────────
// R4-A の (equity-0.5)×POSTFLOP_FACTOR モデルを使い、固定の villain caller レンジ
// (= bb-vs-{opener} の call 頻度) に対して per-category EV(raise) を算出する。
// 結果は同じ戦略(頻度は手作りのまま)に EV を付与した NodeSolution。
// source = 'approximate_with_ev' とし UI で「ヒューリスティック EV」と明示する。
//
// 適用範囲:
// - opener spot (X-open): action=raise/fold、villain=BB (固定範囲、3bet 無視)
// - defender / 3bet 対応は未サポート (混合戦略・連鎖が複雑)
//
// 入力スカラ: postflopFactor (既定 30 → AA vs random ≈ +10.5BB)

const NCAT = CATEGORIES.length
const RANK_TO_I = new Map(RANKS.map((r, i) => [r, i]))

function expandCombos(cat: string): [number, number][] {
  const r1 = RANK_TO_I.get(cat[0] as Rank)!
  const r2 = RANK_TO_I.get(cat[1] as Rank)!
  const out: [number, number][] = []
  if (cat.length === 2) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([r1 * 4 + a, r1 * 4 + b])
  } else if (cat[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([r1 * 4 + s, r2 * 4 + s])
  } else {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) out.push([r1 * 4 + a, r2 * 4 + b])
  }
  return out
}

const COMBOS_BY_CAT: [number, number][][] = CATEGORIES.map(expandCombos)
const CAT_INDEX = new Map(CATEGORIES.map((c, i) => [c, i]))

// 1コンボあたり相手カテゴリに残るコンボ平均数 (ブロッカー期待値)。
const AVAIL: Float64Array[] = (() => {
  const mat = CATEGORIES.map(() => new Float64Array(NCAT))
  for (let ci = 0; ci < NCAT; ci++) {
    const aCombos = COMBOS_BY_CAT[ci]
    for (let cj = 0; cj < NCAT; cj++) {
      const bCombos = COMBOS_BY_CAT[cj]
      let total = 0
      for (const a of aCombos) for (const b of bCombos) {
        if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) total++
      }
      mat[ci][cj] = total / aCombos.length
    }
  }
  return mat
})()

export interface HeuristicEVOptions {
  postflopFactor?: number // 既定 30
  sbBlind?: number        // 既定 0.5
  bbBlind?: number        // 既定 1.0
}

// villain (BB) の call 頻度ベクトル (149 cat) を bb-vs-{X} scenario から作る。
// bb-vs-X の cells に 'call' 頻度があれば採用、無ければ 0。
export function buildCallerCallFreq(callerScenario: RangeScenario): Float64Array {
  const q = new Float64Array(NCAT)
  for (let i = 0; i < NCAT; i++) {
    const cell = callerScenario.cells[CATEGORIES[i]]
    if (cell) q[i] = cell.call
  }
  return q
}

// opener (X-open) の raise 頻度ベクトル。defender (bb-vs-X) の EV 計算に使う。
export function buildOpenerRaiseFreq(openerScenario: RangeScenario): Float64Array {
  const q = new Float64Array(NCAT)
  for (let i = 0; i < NCAT; i++) {
    const cell = openerScenario.cells[CATEGORIES[i]]
    if (cell) q[i] = cell.raise
  }
  return q
}

// per-category EV を計算する。
// EV(raise hero=ci) = Σ_cj avail[ci][cj] · [ (1-q[cj])·(sb+bb) + q[cj]·(eq[ci][cj]-0.5)·F ] / Σ_cj avail[ci][cj]
// EV(fold) = 0 (BTN/CO/MP/UTG は ブラインド未投入)。
// SB open の場合は EV(fold) = -sb (sb 既投入) としたいが、approximate_with_ev の評価は
// 「raise/fold の相対 EV 差」が evLoss に使われるので、両方に同じオフセットを足しても
// 等価。簡単のため fold=0 で固定 (相対値だけ意味がある)。
export function computeHeuristicEV(
  hero: RangeScenario,
  eq: number[][],
  callerCallFreq: Float64Array,
  opts: HeuristicEVOptions = {},
): NodeSolution {
  const sb = opts.sbBlind ?? 0.5
  const bb = opts.bbBlind ?? 1.0
  const F = opts.postflopFactor ?? 30

  const evRaiseAll = new Float64Array(NCAT)
  for (let ci = 0; ci < NCAT; ci++) {
    const av = AVAIL[ci]
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj]
      if (a <= 0) continue
      const q = callerCallFreq[cj]
      const evFold = sb + bb
      const evCall = (eq[ci][cj] - 0.5) * F
      num += a * ((1 - q) * evFold + q * evCall)
      den += a
    }
    evRaiseAll[ci] = den > 0 ? num / den : sb + bb
  }

  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(hero.cells)) {
    const ci = CAT_INDEX.get(hand)
    if (ci == null) continue
    const acts: ActionSolution[] = []
    const evR = +evRaiseAll[ci].toFixed(3)
    if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: hero.raiseSize, frequency: cell.raise, ev: evR })
    if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: 0 })
    if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: 0 })
    strategy[hand] = acts
  }
  return {
    street: 'preflop',
    spotId: hero.id,
    strategy,
    potBB: 1.5,
    source: 'approximate_with_ev',
    meta: {
      sourceName: `hand-built strategy + heuristic postflop EV (factor=${F})`,
      license: 'original',
      version: '1',
    },
  }
}

// ── defender bb-vs-X 用 ヒューリスティック EV ───────────────────────────────────
// hero=BB が opener X の raise に直面したスポット。
// アクション: fold / call / raise(3bet)。
// EV 設計:
//   EV(call) = Σ_cj avail[ci][cj] · raiseFreq[cj] · (eq[ci][cj]-0.5)·F  / Σ avail·raiseFreq
//            (BB 視点での postflop net。opener の raise レンジ加重)
//   EV(fold) = -bb            (ブラインドロス)
//   EV(raise) = 0 (TODO: 3bet → opener の 4bet/call/fold の遷移が複雑なので未実装)
//
// raise の EV は 0 で固定なので、その手の evLoss は計算上控えめになる。
// UI で「3bet の EV は概算外」と明示するか、approximate_with_ev のバッジで
// ユーザーに伝える (今回はバッジで対応)。
export function computeDefenderHeuristicEV(
  defender: RangeScenario,            // bb-vs-X
  openerRaiseFreq: Float64Array,      // X-open の raise 頻度 (per-category)
  eq: number[][],
  opts: HeuristicEVOptions = {},
): NodeSolution {
  const bb = opts.bbBlind ?? 1.0
  const F = opts.postflopFactor ?? 30

  // EV(call) per-category (hero=BB が cat ci のとき)
  const evCallAll = new Float64Array(NCAT)
  for (let ci = 0; ci < NCAT; ci++) {
    const av = AVAIL[ci]
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj]
      const w = openerRaiseFreq[cj]
      if (a <= 0 || w <= 0) continue
      num += a * w * (eq[ci][cj] - 0.5) * F
      den += a * w
    }
    evCallAll[ci] = den > 0 ? num / den : 0
  }

  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(defender.cells)) {
    const ci = CAT_INDEX.get(hand)
    if (ci == null) continue
    const acts: ActionSolution[] = []
    const evCall = +evCallAll[ci].toFixed(3)
    if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: defender.raiseSize, frequency: cell.raise, ev: 0 })
    if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: evCall })
    if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: -bb })
    strategy[hand] = acts
  }
  return {
    street: 'preflop',
    spotId: defender.id,
    strategy,
    potBB: 1.5,
    source: 'approximate_with_ev',
    meta: {
      sourceName: `hand-built defender strategy + heuristic call EV (factor=${F}, 3bet EV未計上)`,
      license: 'original',
      version: '1',
    },
  }
}
