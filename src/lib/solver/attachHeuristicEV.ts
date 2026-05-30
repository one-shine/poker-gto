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
// 3better の 3bet レンジ (= {3better}-vs-{opener} の raise 列) にも流用する。
export function buildOpenerRaiseFreq(openerScenario: RangeScenario): Float64Array {
  const q = new Float64Array(NCAT)
  for (let i = 0; i < NCAT; i++) {
    const cell = openerScenario.cells[CATEGORIES[i]]
    if (cell) q[i] = cell.raise
  }
  return q
}

// opener が 3bet に直面したときの応答 (fold / call / 4bet)。
// {opener}-vs-{3better}-3bet シナリオの cell から読む (cell.raise=4bet, cell.call=call, cell.fold=fold)。
// レンジに無い手 = その手をオープンしていても 3bet に 100% フォールド扱い (oFold=1)。
export interface OpenerResponse { oFold: Float64Array; oCall: Float64Array; o4bet: Float64Array }
export function buildOpenerResponseFreqs(facing3betScenario: RangeScenario): OpenerResponse {
  const oFold = new Float64Array(NCAT)
  const oCall = new Float64Array(NCAT)
  const o4bet = new Float64Array(NCAT)
  for (let i = 0; i < NCAT; i++) {
    const cell = facing3betScenario.cells[CATEGORIES[i]]
    if (cell) { oFold[i] = cell.fold; oCall[i] = cell.call; o4bet[i] = cell.raise }
    else { oFold[i] = 1 } // 未掲載 = 3bet に全フォールド
  }
  return { oFold, oCall, o4bet }
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

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
// hero=3better が opener X の raise に直面したスポット。アクション: fold / call / raise(3bet)。
// EV 設計:
//   EV(call)  = Σ_cj avail·raiseFreq · (eq-0.5)·F_srp / Σ   (SRP ポット postflop net)
//   EV(fold)  = -foldCost                                   (ブラインドロス。BB=-1.0/SB=-0.5/cold=0)
//   EV(3bet)  = Σ_cj avail·openerOpenFreq · [ oFold·DEAD + oCall·(eq-0.5)·F3 + o4bet·G4bet ] / Σ
//      DEAD  = open + (他者の死にブラインド) = openBB + (1.5 - heroBlindPosted)   (相手フォールド時の獲得死に金)
//      G4bet = cont·(eq-0.5)·F4 - (1-cont)·COST3,  cont=clamp((eqVs4bet-0.36)/0.16,0,1)  (4bet被弾: 強い手は続行)
//      COST3 = threeBetBB - heroBlindPosted   (4bet に降りた時の損失)
//      opener 応答 (oFold/oCall/o4bet) は実データ {opener}-vs-{3better}-3bet シナリオから。無ければ EV(3bet)=0。
//
// heuristic: not GTO-exact。F3=45/F4=60 は 3bet/4bet ポット用の概算倍率 (SRP F=30 とは別、線形スケールしない)。
// fold-equity 項 (DEAD) がブラフ3bet を fold より良く評価する核心。node は固定レンジへのベストレスポンス近似。
export interface DefenderEVOptions extends HeuristicEVOptions {
  openerResponse?: OpenerResponse  // opener の 3bet 応答 (実データ)。無ければ 3bet EV=0
  openerOpenFreq?: Float64Array    // w[cj] = opener の総オープン頻度 (= buildOpenerRaiseFreq(opener-open))
  openBB?: number                  // o, opener のオープン額 (既定 2.5)
  threeBetBB?: number              // t, hero の 3bet 額 (既定 11)
  heroBlindPosted?: number         // hero が既に投入したブラインド (BB=1.0/SB=0.5/cold=0)。DEAD/COST3 に使う
  threeBetFactor?: number          // F3 (既定 45)
  fourBetFactor?: number           // F4 (既定 60)
}
export function computeDefenderHeuristicEV(
  defender: RangeScenario,            // bb-vs-X (3better のレンジ)
  openerRaiseFreq: Float64Array,      // X-open の raise 頻度 (per-category)
  eq: number[][],
  opts: DefenderEVOptions = {},
): NodeSolution {
  const bb = opts.bbBlind ?? 1.0      // = foldCost (EV(fold) の絶対値)
  const F = opts.postflopFactor ?? 30 // SRP factor

  // EV(call) per-category (hero=3better が cat ci のとき)
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

  // EV(3bet) per-category — opener 応答データがある時のみ。無ければ 0 のまま。
  const ev3All = new Float64Array(NCAT)
  const hasThreeBet = !!(opts.openerResponse && opts.openerOpenFreq)
  if (opts.openerResponse && opts.openerOpenFreq) {
    const { oFold, oCall, o4bet } = opts.openerResponse
    const w = opts.openerOpenFreq
    const o = opts.openBB ?? 2.5
    const t = opts.threeBetBB ?? 11
    const heroBlind = opts.heroBlindPosted ?? 0
    const F3 = opts.threeBetFactor ?? 45
    const F4 = opts.fourBetFactor ?? 60
    const DEAD = o + (1.5 - heroBlind)
    const COST3 = t - heroBlind
    for (let ci = 0; ci < NCAT; ci++) {
      const av = AVAIL[ci]
      // hero の対 opener-4bet レンジ equity → cont (4bet 被弾で続行する度合い)
      let n4 = 0, d4 = 0
      for (let cj = 0; cj < NCAT; cj++) {
        const a = av[cj], wo = o4bet[cj]
        if (a <= 0 || wo <= 0) continue
        n4 += a * wo * eq[ci][cj]; d4 += a * wo
      }
      const cont = d4 > 0 ? clamp((n4 / d4 - 0.36) / 0.16, 0, 1) : 0
      let num = 0, den = 0
      for (let cj = 0; cj < NCAT; cj++) {
        const ww = av[cj] * w[cj]
        if (ww <= 0) continue
        const edge = eq[ci][cj] - 0.5
        const g4 = cont * edge * F4 - (1 - cont) * COST3
        num += ww * (oFold[cj] * DEAD + oCall[cj] * edge * F3 + o4bet[cj] * g4)
        den += ww
      }
      ev3All[ci] = den > 0 ? num / den : 0
    }
  }

  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(defender.cells)) {
    const ci = CAT_INDEX.get(hand)
    if (ci == null) continue
    const acts: ActionSolution[] = []
    if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: defender.raiseSize, frequency: cell.raise, ev: hasThreeBet ? +ev3All[ci].toFixed(3) : 0 })
    if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: +evCallAll[ci].toFixed(3) })
    if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: -bb })
    strategy[hand] = acts
  }
  const F3 = opts.threeBetFactor ?? 45
  return {
    street: 'preflop',
    spotId: defender.id,
    strategy,
    potBB: 1.5,
    source: 'approximate_with_ev',
    meta: {
      sourceName: hasThreeBet
        ? `hand-built defender strategy + heuristic call+3bet EV (SRP factor=${F}, 3bet factor=${F3}, opener応答=手作りレンジ推定)`
        : `hand-built defender strategy + heuristic call EV (factor=${F}, 3bet EV未計上=opener応答データ無し)`,
      license: 'original',
      version: '1',
    },
  }
}

// ── opener が 3bet に直面 (facing-3bet) 用 ヒューリスティック EV ────────────────────
// hero=opener (BTN/CO) が 3better Y の 3bet に直面。アクション: fold / call / raise(4bet)。
// EV 設計 (hero 視点・決定時点からの純益):
//   EV(fold) = -(openBB)                                  (オープンを放棄。BTN/CO はブラインド未投入)
//   EV(call) = Σ avail·villain3betFreq · (eq-0.5)·F3 / Σ  (3bet ポットを call して postflop)
//   EV(4bet) = FT4·DEAD4 + (1-FT4)·avgEdge·F4
//      DEAD4 = threeBetBB + (1.5 - threeBetterBlind)      (3better が 4bet に降りた時の獲得死に金)
//      FT4   = 3better の対4bet フォールド率 (既定 0.55・データ無し=定数推定)
//      avgEdge = Σ avail·villain3betFreq·(eq-0.5)/Σ       (3better レンジへの equity advantage)
//
// heuristic: not GTO-exact。villain の 3bet レンジは実データ ({3better}-vs-{opener} の raise 列)、
// fold-to-4bet は定数推定。F3=45/F4=60。
export interface OpenerFacing3betOptions {
  openBB?: number          // o, hero(opener) のオープン額 (既定 2.5)
  threeBetBB?: number      // t, villain の 3bet 額 (既定 11)
  fourBetBB?: number       // f, hero の 4bet 表示額 (既定 24)
  openerBlind?: number     // hero(opener) が投入したブラインド (BTN/CO=0)。既定 0
  threeBetterBlind?: number // 3better が投入したブラインド (BB=1.0/SB=0.5/BTN=0)。DEAD4 に使う。既定 0
  threeBetFactor?: number  // F3 (既定 45)
  fourBetFactor?: number   // F4 (既定 60)
  foldToFourBet?: number   // FT4 (既定 0.55)
}
export function computeOpenerFacing3betEV(
  facing: RangeScenario,            // {opener}-vs-{3better}-3bet (hero=opener の戦略: raise=4bet/call/fold)
  villain3betFreq: Float64Array,    // 3better の 3bet レンジ (= buildOpenerRaiseFreq({3better}-vs-{opener}))
  eq: number[][],
  opts: OpenerFacing3betOptions = {},
): NodeSolution {
  const o = opts.openBB ?? 2.5
  const t = opts.threeBetBB ?? 11
  const f = opts.fourBetBB ?? 24
  const openerBlind = opts.openerBlind ?? 0
  const tbBlind = opts.threeBetterBlind ?? 0
  const F3 = opts.threeBetFactor ?? 45
  const F4 = opts.fourBetFactor ?? 60
  const FT4 = opts.foldToFourBet ?? 0.55
  const DEAD4 = t + (1.5 - tbBlind)
  const foldEV = -(o - openerBlind)

  const evCallAll = new Float64Array(NCAT)
  const ev4betAll = new Float64Array(NCAT)
  for (let ci = 0; ci < NCAT; ci++) {
    const av = AVAIL[ci]
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj], w = villain3betFreq[cj]
      if (a <= 0 || w <= 0) continue
      num += a * w * (eq[ci][cj] - 0.5); den += a * w
    }
    const avgEdge = den > 0 ? num / den : 0
    evCallAll[ci] = avgEdge * F3
    ev4betAll[ci] = FT4 * DEAD4 + (1 - FT4) * avgEdge * F4
  }

  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(facing.cells)) {
    const ci = CAT_INDEX.get(hand)
    if (ci == null) continue
    const acts: ActionSolution[] = []
    if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: f, frequency: cell.raise, ev: +ev4betAll[ci].toFixed(3) }) // 4bet
    if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: +evCallAll[ci].toFixed(3) })
    if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: +foldEV.toFixed(3) })
    strategy[hand] = acts
  }
  return {
    street: 'preflop',
    spotId: facing.id,
    strategy,
    potBB: +(o + t + (1.5 - tbBlind)).toFixed(2),
    source: 'approximate_with_ev',
    meta: {
      sourceName: `hand-built opener strategy + heuristic call/4bet EV (3bet factor=${F3}, 4bet factor=${F4}, fold-to-4bet=${FT4} 推定)`,
      license: 'original',
      version: '1',
    },
  }
}
