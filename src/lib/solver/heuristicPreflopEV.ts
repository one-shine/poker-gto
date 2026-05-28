import { CATEGORIES, COMBO_COUNT } from './pushFold'

// ── 100BB open スポット用 ヒューリスティック preflop EV / 戦略求解 ──────────────
// 厳密ではない。「ポストフロップ EV ≈ (equity − 0.5) × POSTFLOP_FACTOR」で
// 近似し、opener と caller の単発レンジを fictitious play で収束させる。
//
// **適用範囲と精度**:
// - HU SRP のオープン vs ブラインド防御のみ (SB は折る前提 = BTN open vs BB)。
// - 3bet/4bet ノードは無視。BTN/CO/SB open vs BB のような単一ディフェンダー設定を想定。
// - postflop EV は equity だけで決まる粗い近似で、ポジション/スキルエッジは無視。
// - 厳密 GTO ではないため UI は `source: 'solver_live'` (簡易) として明示すること。
//
// **キャリブレーション** (POSTFLOP_FACTOR = 30):
// AA vs random ≈ 85% → 0.35 × 30 = +10.5BB postflop。公開 GTO ツールの目安と整合する範囲。
// 弱手 72o vs random ≈ 35% → -0.15 × 30 = -4.5BB postflop。

// 既存の availability 行列を再利用 (pushFold.ts と同一の blocker 期待値)。
// 私的: AVAIL は pushFold.ts 内部だったため小型版を再構築。
import { RANKS } from '../../engine/cards/Card'
import type { Rank } from '../../types/game'

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

export interface OpenParams {
  raiseSize: number      // 例: 2.5BB
  sbBlind?: number       // 既定 0.5
  bbBlind?: number       // 既定 1.0
  postflopFactor?: number // postflop EV 倍率 (既定 30)
  iterations?: number    // fictitious play 反復 (既定 500)
}

export interface OpenDecision {
  freq: number       // raise 採用頻度 (opener) / call 採用頻度 (caller) 0..1
  evAct: number      // raise / call の平均 EV(BB)
  evFold: number     // fold の EV(BB)
}

export interface OpenResult {
  opener: Record<string, OpenDecision>   // 各カテゴリの raise 頻度+EV
  caller: Record<string, OpenDecision>   // 各カテゴリの call 頻度+EV (BB が hero raise に直面)
  exploitability: number                  // 平均改善幅 (BB/hand, 小さいほど収束)
  params: Required<OpenParams>
}

// postflop EV ヒューリスティック: equity ベースの線形モデル。
// HU、両者がポストフロップで対等に打つ前提。
// (eq - 0.5) は equity advantage。POSTFLOP_FACTOR は実プールサイズの代理。
function postflopHero(heroEq: number, factor: number): number {
  return (heroEq - 0.5) * factor
}

export function solveOpenHeuristic(eq: number[][], params: OpenParams): OpenResult {
  const r = params.raiseSize
  const sb = params.sbBlind ?? 0.5
  const bb = params.bbBlind ?? 1.0
  const F = params.postflopFactor ?? 30
  const iters = params.iterations ?? 500

  // hero (opener) cat ci の EV(raise): BB の call/fold 戦略 callQ に対する応答。
  // ・BB fold: hero がポット (BB + SB = 1.5BB) を獲得 (opener が BTN で SB が常に fold する前提)。
  // ・BB call: postflop net = (eq[ci][cj] - 0.5) * F。
  // hero は raise 時 raiseSize を投入するが、fold 時の EV(=0, BTN 想定) との差分で BR を決めるので
  // 投資額は両方の選択に含めず net EV のみで比較する (BR ルールが「raise EV > 0」になる)。
  function evRaise(ci: number, callQ: Float64Array): number {
    const av = AVAIL[ci]
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj]
      if (a <= 0) continue
      const q = callQ[cj]
      // fold ぶん: hero raise (-r) → BB fold → ポット回収 (+r + sb + bb) = sb + bb の純益
      // call ぶん: hero raise (-r) → BB call → postflop net (heuristic) + 既投入合算
      const evFold = sb + bb
      const evCall = postflopHero(eq[ci][cj], F)
      num += a * ((1 - q) * evFold + q * evCall)
      den += a
    }
    return den > 0 ? num / den : sb + bb
  }

  // BB (caller) cat cj の EV(call): hero の raise 戦略 raiseP に対する応答。
  // BB の fold EV = -bb (ブラインドロス)。BR は「ev_call > -bb」。
  function evCall(cj: number, raiseP: Float64Array): number {
    let num = 0, den = 0
    for (let ci = 0; ci < NCAT; ci++) {
      const w = AVAIL[cj][ci] * raiseP[ci]
      if (w <= 0) continue
      // hero raise → BB call。BB net = -hero net (zero-sum HU)。
      // BB は r BB 追加投入 (既投 bb と合わせ r 投入)。postflop net は BB 視点で +/-。
      num += w * (-postflopHero(eq[ci][cj], F))
      den += w
    }
    return den > 0 ? num / den : -bb
  }

  const avgRaise = new Float64Array(NCAT).fill(0.5)
  const avgCall = new Float64Array(NCAT).fill(0.5)
  const brRaise = new Float64Array(NCAT)
  const brCall = new Float64Array(NCAT)

  for (let t = 1; t <= iters; t++) {
    for (let ci = 0; ci < NCAT; ci++) brRaise[ci] = evRaise(ci, avgCall) > 0 ? 1 : 0
    for (let cj = 0; cj < NCAT; cj++) brCall[cj] = evCall(cj, avgRaise) > -bb ? 1 : 0
    const w = 1 / (t + 1)
    for (let c = 0; c < NCAT; c++) {
      avgRaise[c] += (brRaise[c] - avgRaise[c]) * w
      avgCall[c] += (brCall[c] - avgCall[c]) * w
    }
  }

  const opener: Record<string, OpenDecision> = {}
  const caller: Record<string, OpenDecision> = {}
  for (let c = 0; c < NCAT; c++) {
    const eR = evRaise(c, avgCall)
    opener[CATEGORIES[c]] = { freq: +avgRaise[c].toFixed(4), evAct: +eR.toFixed(3), evFold: 0 }
    const eC = evCall(c, avgRaise)
    caller[CATEGORIES[c]] = { freq: +avgCall[c].toFixed(4), evAct: +eC.toFixed(3), evFold: -bb }
  }

  // exploitability: BR 改善幅平均 (コンボ加重・BB/hand)。
  let impHero = 0, impBB = 0, wSum = 0
  for (let c = 0; c < NCAT; c++) {
    const n = COMBO_COUNT[c]
    const eR = evRaise(c, avgCall)
    impHero += n * (Math.max(eR, 0) - (avgRaise[c] * eR))
    const eC = evCall(c, avgRaise)
    impBB += n * (Math.max(eC, -bb) - (avgCall[c] * eC + (1 - avgCall[c]) * -bb))
    wSum += n
  }
  const exploitability = +(((impHero + impBB) / 2 / wSum)).toFixed(4)

  return {
    opener, caller, exploitability,
    params: { raiseSize: r, sbBlind: sb, bbBlind: bb, postflopFactor: F, iterations: iters },
  }
}
