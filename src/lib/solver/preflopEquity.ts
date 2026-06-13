import type { Card, Rank } from '../../types/game'
import { RANKS, SUITS } from '../../engine/cards/Card'
import { evaluateBestHand, compareHands } from '../../engine/cards/HandEvaluator'
import { CATEGORIES } from './pushFold'

// ── プリフロップ オールイン勝率行列 (カテゴリ別) ──────────────────────────────────
// 169 カテゴリ間の「両者オールインで全ボードを回したときの勝率」を seeded Monte Carlo で
// 推定する。push/fold ではスタックがプリフロップで入るため、この勝率がショーダウンの真値。
// 完全列挙(C(48,5))は重いため MC。seed 固定で再現可能 → 同じ行列を決定的に得る。

// 再現可能な PRNG (mulberry32)。
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// カード id 0..51 = rankIndex(0=2..12=A)*4 + suitIndex(0..3)。
const CARD_BY_ID: Card[] = RANKS.flatMap(r => SUITS.map(s => ({ rank: r, suit: s })))

// カテゴリをカード id 対へ展開。
function expandIds(cat: string): [number, number][] {
  const r1 = RANKS.indexOf(cat[0] as Rank)
  const r2 = RANKS.indexOf(cat[1] as Rank)
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

// カテゴリ catA vs catB のオールイン勝率 (A 視点, タイ=0.5)。
// ホットループはアロケーションを避ける (card id + 使用済みフラグ + 再利用配列)。
export function pairEquity(catA: string, catB: string, iterations: number, rng: () => number): number {
  const aCombos = expandIds(catA)
  const bCombos = expandIds(catB)
  const used = new Uint8Array(52)
  const h7: Card[] = new Array(7)
  const v7: Card[] = new Array(7)
  let won = 0, samples = 0
  for (let it = 0; it < iterations; it++) {
    const a = aCombos[(rng() * aCombos.length) | 0]
    const b = bCombos[(rng() * bCombos.length) | 0]
    if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue // 衝突
    used.fill(0)
    used[a[0]] = used[a[1]] = used[b[0]] = used[b[1]] = 1
    h7[0] = CARD_BY_ID[a[0]]; h7[1] = CARD_BY_ID[a[1]]
    v7[0] = CARD_BY_ID[b[0]]; v7[1] = CARD_BY_ID[b[1]]
    // 5 枚のボードをリジェクションサンプリング (dead は 4 枚のみ → 棄却率低い)
    for (let k = 0; k < 5; k++) {
      let id: number
      do { id = (rng() * 52) | 0 } while (used[id])
      used[id] = 1
      const c = CARD_BY_ID[id]
      h7[2 + k] = c; v7[2 + k] = c
    }
    const cmp = compareHands(evaluateBestHand(h7), evaluateBestHand(v7))
    // compareHands: 負 = 第1引数(A)の勝ち / 正 = A の負け / 0 = タイ (HandEvaluator)
    if (cmp < 0) won += 1
    else if (cmp === 0) won += 0.5
    samples++
  }
  return samples === 0 ? 0.5 : won / samples
}

// ── N-way オールイン エクイティ (Phase C2) ──────────────────────────────────────
// N 人がプリフロップでオールインしたときの各プレイヤーの「ポット取り分」(= 勝ち1.0・
// N人タイは 1/N 分配)。Σ shares = 1。HU(N=2)は pairEquity と MC 誤差内で一致する。
// マルチウェイの真値はペア勝率の積では出ない(hero vs フィールドは非分離)ため、N 枚同時に
// 配って showdown=max を取る。カードリムーバルは衝突サンプルを棄却して厳密に織り込む。
// 依存方向: engine ← solver。木の allin 終端で使う。
export function nWayEquity(cats: string[], iterations: number, rng: () => number): number[] {
  const n = cats.length
  const combosByPlayer = cats.map(expandIds)
  const shares = new Array<number>(n).fill(0)
  const used = new Uint8Array(52)
  const hole: number[] = new Array(2 * n)
  const hands: Card[][] = Array.from({ length: n }, () => new Array<Card>(7))
  let samples = 0
  outer: for (let it = 0; it < iterations; it++) {
    used.fill(0)
    for (let p = 0; p < n; p++) {
      const combos = combosByPlayer[p]
      const c = combos[(rng() * combos.length) | 0]
      if (used[c[0]] || used[c[1]]) continue outer // 他プレイヤーと衝突 → サンプル棄却
      used[c[0]] = 1; used[c[1]] = 1
      hole[2 * p] = c[0]; hole[2 * p + 1] = c[1]
      hands[p][0] = CARD_BY_ID[c[0]]; hands[p][1] = CARD_BY_ID[c[1]]
    }
    for (let k = 0; k < 5; k++) {
      let id: number
      do { id = (rng() * 52) | 0 } while (used[id])
      used[id] = 1
      const card = CARD_BY_ID[id]
      for (let p = 0; p < n; p++) hands[p][2 + k] = card
    }
    // 最強を求め、タイ数で 1.0 を分配。
    let best = evaluateBestHand(hands[0])
    let winners = 1
    const evals = [best]
    for (let p = 1; p < n; p++) {
      const e = evaluateBestHand(hands[p])
      evals.push(e)
      const cmp = compareHands(e, best) // 負 = e が強い
      if (cmp < 0) { best = e; winners = 1 }
      else if (cmp === 0) winners++
    }
    const split = 1 / winners
    for (let p = 0; p < n; p++) if (compareHands(evals[p], best) === 0) shares[p] += split
    samples++
  }
  if (samples === 0) return new Array<number>(n).fill(1 / n)
  for (let p = 0; p < n; p++) shares[p] /= samples
  return shares
}

// 169×169 の勝率行列を構築。eq[i][j]+eq[j][i]=1, 対角=0.5 (上三角のみ計算)。
export function buildEquityMatrix(
  iterations: number,
  seed = 1,
  onProgress?: (done: number, total: number) => void,
): number[][] {
  const n = CATEGORIES.length
  const eq = CATEGORIES.map(() => new Array(n).fill(0.5))
  const rng = mulberry32(seed)
  const total = (n * (n - 1)) / 2
  let done = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const e = pairEquity(CATEGORIES[i], CATEGORIES[j], iterations, rng)
      eq[i][j] = e
      eq[j][i] = 1 - e
      if (onProgress && ++done % 500 === 0) onProgress(done, total)
    }
  }
  return eq
}
