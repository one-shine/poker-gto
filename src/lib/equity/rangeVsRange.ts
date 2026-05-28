import type { Card } from '../../types/game'
import { RANKS, SUITS, RANK_VALUES } from '../../engine/cards/Card'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import { expandCategory } from './monteCarlo'

// レンジ vs レンジのボード上エクイティ分布を求める (GTO Wizard 流のレンジ優位/ナッツ優位)。
// hero 1枚ずつのコンボごとに「相手レンジ全体に対するエクイティ」を出し、分布(ヒストグラム)・
// 平均エクイティ(=レンジ優位)・ナッツ比率(=ナッツ優位)に集計する。
// river(5枚)は厳密、flop/turn は seeded MC でランナウトをサンプリング(再現可能)。

export interface WeightedCategory {
  hand: string   // '169' カテゴリ表記 (AA / AKs / AKo)
  weight: number // そのハンドがレンジに入る頻度 (raise+call)。0 は除外。
}

export interface RangeEquityInput {
  rangeA: WeightedCategory[]
  rangeB: WeightedCategory[]
  board: Card[]      // 3 / 4 / 5 枚
  iterations: number // flop/turn のランナウト試行数 (river では無視)
  seed?: number
}

export interface SideDistribution {
  avgEquity: number   // レンジ全体の重み付き平均エクイティ (0..1)。0.5 超 = レンジ優位
  nutShare: number    // エクイティ >= NUT_THRESHOLD のコンボ比率 (ナッツ優位の指標)
  weakShare: number   // エクイティ <= WEAK_THRESHOLD のコンボ比率 (弱い/エアの比率)
  buckets: number[]   // BUCKET_COUNT 個。各エクイティ帯のコンボ比率 (合計1)
  comboCount: number  // ボード衝突除外後の具体コンボ数
}

export interface RangeEquityResult {
  a: SideDistribution
  b: SideDistribution
  runouts: number       // 実際に使ったランナウト数 (river=1)
  bucketCount: number
  nutThreshold: number
}

export const BUCKET_COUNT = 10
const NUT_THRESHOLD = 0.8
const WEAK_THRESHOLD = 0.2

// 0..51 のカードインデックス (ランク*4 + スート)。ブロッカー判定用。
function cardIndex(c: Card): number {
  return (RANK_VALUES[c.rank] - 2) * 4 + SUITS.indexOf(c.suit)
}

interface Combo {
  cards: [Card, Card]
  i0: number
  i1: number
  weight: number
}

function expand(range: WeightedCategory[], boardIdx: Set<number>): Combo[] {
  const out: Combo[] = []
  for (const { hand, weight } of range) {
    if (weight <= 0) continue
    for (const [c0, c1] of expandCategory(hand)) {
      const i0 = cardIndex(c0)
      const i1 = cardIndex(c1)
      if (boardIdx.has(i0) || boardIdx.has(i1)) continue
      out.push({ cards: [c0, c1], i0, i1, weight })
    }
  }
  return out
}

// 決定的シード付き RNG (preflopEquity と同方式)。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fullDeck(): Card[] {
  const d: Card[] = []
  for (const r of RANKS) for (const s of SUITS) d.push({ rank: r, suit: s })
  return d
}

const emptySide = (): SideDistribution => ({
  avgEquity: 0, nutShare: 0, weakShare: 0,
  buckets: new Array(BUCKET_COUNT).fill(0), comboCount: 0,
})

function aggregate(combos: Combo[], sumEq: Float64Array, cnt: Int32Array): SideDistribution {
  const buckets = new Array<number>(BUCKET_COUNT).fill(0)
  let totalW = 0, eqW = 0, nutW = 0, weakW = 0
  for (let i = 0; i < combos.length; i++) {
    if (cnt[i] === 0) continue
    const eq = sumEq[i] / cnt[i]
    const w = combos[i].weight
    totalW += w
    eqW += eq * w
    const bk = Math.min(BUCKET_COUNT - 1, Math.floor(eq * BUCKET_COUNT))
    buckets[bk] += w
    if (eq >= NUT_THRESHOLD) nutW += w
    if (eq <= WEAK_THRESHOLD) weakW += w
  }
  if (totalW <= 0) return { ...emptySide(), comboCount: combos.length }
  for (let i = 0; i < BUCKET_COUNT; i++) buckets[i] /= totalW
  return {
    avgEquity: eqW / totalW,
    nutShare: nutW / totalW,
    weakShare: weakW / totalW,
    buckets,
    comboCount: combos.length,
  }
}

export function computeRangeEquity(input: RangeEquityInput): RangeEquityResult {
  const { rangeA, rangeB, board, iterations, seed = 1 } = input
  const empty: RangeEquityResult = {
    a: emptySide(), b: emptySide(), runouts: 0, bucketCount: BUCKET_COUNT, nutThreshold: NUT_THRESHOLD,
  }
  if (board.length < 3 || board.length > 5) return empty

  const boardIdx = new Set(board.map(cardIndex))
  const A = expand(rangeA, boardIdx)
  const B = expand(rangeB, boardIdx)
  if (A.length === 0 || B.length === 0) return empty

  const need = 5 - board.length
  const runouts = need === 0 ? 1 : Math.max(1, iterations)
  const rng = mulberry32(seed)

  const deck = fullDeck().filter(c => !boardIdx.has(cardIndex(c)))

  const sumEqA = new Float64Array(A.length), cntA = new Int32Array(A.length)
  const sumEqB = new Float64Array(B.length), cntB = new Int32Array(B.length)

  // ランナウトごとの一時集計 (再利用)
  const rankA = new Float64Array(A.length), validA = new Uint8Array(A.length)
  const rankB = new Float64Array(B.length), validB = new Uint8Array(B.length)
  const numA = new Float64Array(A.length), denA = new Float64Array(A.length)
  const numB = new Float64Array(B.length), denB = new Float64Array(B.length)

  for (let r = 0; r < runouts; r++) {
    const extra: Card[] = []
    const used = new Set<number>(boardIdx)
    if (need > 0) {
      // 残りデッキから need 枚を部分 Fisher-Yates で抽出
      const pool = deck.slice()
      for (let i = 0; i < need; i++) {
        const j = i + ((rng() * (pool.length - i)) | 0)
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
        extra.push(pool[i])
        used.add(cardIndex(pool[i]))
      }
    }
    const finalBoard = need > 0 ? [...board, ...extra] : board

    for (let i = 0; i < A.length; i++) {
      if (used.has(A[i].i0) || used.has(A[i].i1)) { validA[i] = 0; continue }
      validA[i] = 1
      rankA[i] = evaluateBestHand([...A[i].cards, ...finalBoard]).rankValue
      numA[i] = 0; denA[i] = 0
    }
    for (let j = 0; j < B.length; j++) {
      if (used.has(B[j].i0) || used.has(B[j].i1)) { validB[j] = 0; continue }
      validB[j] = 1
      rankB[j] = evaluateBestHand([...B[j].cards, ...finalBoard]).rankValue
      numB[j] = 0; denB[j] = 0
    }

    // 全 (a,b) 対戦を1回ずつ評価し、両側の num/den に同時加算
    for (let i = 0; i < A.length; i++) {
      if (!validA[i]) continue
      const a = A[i]
      const ra = rankA[i]
      for (let j = 0; j < B.length; j++) {
        if (!validB[j]) continue
        const b = B[j]
        if (b.i0 === a.i0 || b.i0 === a.i1 || b.i1 === a.i0 || b.i1 === a.i1) continue
        const wa = a.weight, wb = b.weight
        denA[i] += wb
        denB[j] += wa
        if (ra > rankB[j]) { numA[i] += wb }            // a 勝ち
        else if (ra === rankB[j]) { numA[i] += wb * 0.5; numB[j] += wa * 0.5 } // 分け
        else { numB[j] += wa }                          // b 勝ち
      }
    }

    for (let i = 0; i < A.length; i++) {
      if (validA[i] && denA[i] > 0) { sumEqA[i] += numA[i] / denA[i]; cntA[i]++ }
    }
    for (let j = 0; j < B.length; j++) {
      if (validB[j] && denB[j] > 0) { sumEqB[j] += numB[j] / denB[j]; cntB[j]++ }
    }
  }

  return {
    a: aggregate(A, sumEqA, cntA),
    b: aggregate(B, sumEqB, cntB),
    runouts,
    bucketCount: BUCKET_COUNT,
    nutThreshold: NUT_THRESHOLD,
  }
}
