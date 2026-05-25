import type { Rank } from '../../types/game'
import { RANKS } from '../../engine/cards/Card'

// ── HU プッシュ/フォールド Nash 厳密求解 ────────────────────────────────────────
// ショートスタックの HU では、SB が push(オールイン)/fold、BB が call/fold するだけの
// 単純ゲーム。スタックがプリフロップで全て入るため、ショーダウン勝敗 = オールイン勝率が
// **真の値**であり、ポストフロップ近似が不要 → 厳密 GTO(solver_precomputed)になる。
//
// 求解はカテゴリレベルの fictitious play。カードリムーバル(ブロッカー)は、コンボ展開で
// 「相手カテゴリの利用可能コンボ数(自分の手で消えるぶんを除く)」を期待値で事前計算した
// availability 行列として厳密に織り込む(カテゴリ別頻度の報告にはこの期待値が正しい量)。
// 依存方向: engine ← solver。

// 169 カテゴリ ("AA"/"AKs"/"AKo") を高→低ランクで列挙 (グリッド上段=suited)。
export const CATEGORIES: string[] = (() => {
  const ranks = [...RANKS].reverse() // A..2
  const out: string[] = []
  for (let i = 0; i < ranks.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
      if (i === j) out.push(ranks[i] + ranks[i])         // ペア
      else if (i < j) out.push(ranks[i] + ranks[j] + 's') // スーテッド
      else out.push(ranks[j] + ranks[i] + 'o')            // オフスート
    }
  }
  return out
})()

const NCAT = CATEGORIES.length
const RANK_TO_I = new Map(RANKS.map((r, i) => [r, i]))

// カード id: rankIndex(0=2..12=A)*4 + suitIndex(0..3)。
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
export const COMBO_COUNT: number[] = COMBOS_BY_CAT.map(c => c.length) // 6/4/12

// availability[ci][cj] = ci の 1 コンボを引いたとき、cj に残る(衝突しない)コンボの平均数。
// カードリムーバルを厳密に期待値化する。スタック非依存なので一度だけ構築・再利用。
const AVAIL: Float64Array[] = (() => {
  const mat = CATEGORIES.map(() => new Float64Array(NCAT))
  for (let ci = 0; ci < NCAT; ci++) {
    const aCombos = COMBOS_BY_CAT[ci]
    for (let cj = 0; cj < NCAT; cj++) {
      const bCombos = COMBOS_BY_CAT[cj]
      let total = 0
      for (const a of aCombos) {
        for (const b of bCombos) {
          if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) total++
        }
      }
      mat[ci][cj] = total / aCombos.length
    }
  }
  return mat
})()

export interface PushFoldParams {
  effStackBB: number
  sbBlind?: number    // 既定 0.5
  bbBlind?: number    // 既定 1.0
  iterations?: number // fictitious play 反復 (既定 2000)
}

export interface CategoryDecision {
  freq: number  // 採用頻度 (push or call) 0..1
  evAct: number // そのアクションの平均 EV(BB)
  evFold: number
}

export interface PushFoldResult {
  effStackBB: number
  sbPush: Record<string, CategoryDecision> // SB の push 戦略 (カテゴリ別)
  bbCall: Record<string, CategoryDecision> // BB の call 戦略 (push に直面)
  exploitability: number // 両者の BR 改善幅平均 (BB単位)。Nash で ≈ 0
}

// eq[i][j] = カテゴリ i が j に対して持つオールイン勝率 (タイ込み, eq[i][j]+eq[j][i]=1)。
export function solvePushFold(eq: number[][], params: PushFoldParams): PushFoldResult {
  const S = params.effStackBB
  const sb = params.sbBlind ?? 0.5
  const bb = params.bbBlind ?? 1.0
  const iters = params.iterations ?? 2000

  // ショーダウン純益: SB が cat ci で push し BB が cat cj で call (pot=2S, 勝率 eq)。SB net = S(2e-1)。
  const sdSB = (ci: number, cj: number) => S * (2 * eq[ci][cj] - 1)

  // SB cat ci の EV(push): BB の call 頻度 qCat に対する応答 (availability で blocker 厳密)。
  // EV = Σ_cj avail[ci][cj]·[ q·sdSB + (1-q)·(+bb) ] / Σ_cj avail[ci][cj]
  function evPush(ci: number, qCat: Float64Array): number {
    const av = AVAIL[ci]
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj]
      if (a <= 0) continue
      const q = qCat[cj]
      num += a * (q * sdSB(ci, cj) + (1 - q) * bb)
      den += a
    }
    return den > 0 ? num / den : bb
  }

  // BB cat cj の EV(call): SB の push 集合(pCat 加重・availability)に対する応答。BB net = -sdSB。
  function evCall(cj: number, pCat: Float64Array): number {
    let num = 0, den = 0
    for (let ci = 0; ci < NCAT; ci++) {
      const w = AVAIL[cj][ci] * pCat[ci]
      if (w <= 0) continue
      num += w * (-sdSB(ci, cj))
      den += w
    }
    return den > 0 ? num / den : -bb
  }

  const avgPush = new Float64Array(NCAT).fill(0.5)
  const avgCall = new Float64Array(NCAT).fill(0.5)
  const brPush = new Float64Array(NCAT)
  const brCall = new Float64Array(NCAT)

  for (let t = 1; t <= iters; t++) {
    for (let ci = 0; ci < NCAT; ci++) brPush[ci] = evPush(ci, avgCall) > -sb ? 1 : 0
    for (let cj = 0; cj < NCAT; cj++) brCall[cj] = evCall(cj, avgPush) > -bb ? 1 : 0
    const w = 1 / (t + 1)
    for (let c = 0; c < NCAT; c++) {
      avgPush[c] += (brPush[c] - avgPush[c]) * w
      avgCall[c] += (brCall[c] - avgCall[c]) * w
    }
  }

  const toRecord = (
    freq: Float64Array,
    evFn: (c: number) => number,
    foldEv: number,
  ): Record<string, CategoryDecision> => {
    const out: Record<string, CategoryDecision> = {}
    for (let c = 0; c < NCAT; c++) {
      out[CATEGORIES[c]] = { freq: +freq[c].toFixed(4), evAct: +evFn(c).toFixed(3), evFold: foldEv }
    }
    return out
  }
  const sbPush = toRecord(avgPush, c => evPush(c, avgCall), -sb)
  const bbCall = toRecord(avgCall, c => evCall(c, avgPush), -bb)

  // exploitability: 平均戦略に最適応答したときの EV 改善 (コンボ数加重・BB/ハンド)。
  let impSB = 0, impBB = 0, wSum = 0
  for (let c = 0; c < NCAT; c++) {
    const n = COMBO_COUNT[c]
    const eP = evPush(c, avgCall)
    impSB += n * (Math.max(eP, -sb) - (avgPush[c] * eP + (1 - avgPush[c]) * -sb))
    const eC = evCall(c, avgPush)
    impBB += n * (Math.max(eC, -bb) - (avgCall[c] * eC + (1 - avgCall[c]) * -bb))
    wSum += n
  }
  const exploitability = +(((impSB + impBB) / 2 / wSum)).toFixed(4)

  return { effStackBB: S, sbPush, bbCall, exploitability }
}
