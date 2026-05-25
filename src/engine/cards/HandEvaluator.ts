import type { Card, HandEvalResult, HandRank } from '../../types/game'
import { RANK_VALUES } from './Card'

// Score a 5-card hand. Returns an array used for lexicographic comparison.
// First element: category (1=best/straight_flush, 9=worst/high_card).
// Remaining elements: tiebreaker rank values (higher = better).
// To compare two hands: lower first element wins; on tie, compare subsequent elements.

type ScoreVector = number[]

function getCounts(cards: Card[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const c of cards) {
    const v = RANK_VALUES[c.rank]
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return map
}

function scoreHand(cards: Card[]): ScoreVector {
  const vals = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a)
  const counts = getCounts(cards)
  const flush = cards.every(c => c.suit === cards[0].suit)

  // Check straight (including wheel A-2-3-4-5)
  let straightHigh = 0
  const uniqueVals = [...new Set(vals)].sort((a, b) => b - a)
  if (uniqueVals.length === 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) {
      straightHigh = uniqueVals[0]
    } else if (uniqueVals[0] === 14 && uniqueVals[1] === 5 && uniqueVals[2] === 4 && uniqueVals[3] === 3 && uniqueVals[4] === 2) {
      straightHigh = 5 // wheel
    }
  }
  const isStraight = straightHigh > 0

  if (flush && isStraight) return [1, straightHigh]

  // Group by frequency then by rank (descending)
  const freqGroups: [number, number][] = [...counts.entries()]
    .map(([rank, freq]) => [freq, rank] as [number, number])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1])

  const freqs = freqGroups.map(([f]) => f)

  if (freqs[0] === 4) {
    const quad = freqGroups[0][1]
    const kicker = freqGroups[1][1]
    return [2, quad, kicker]
  }
  if (freqs[0] === 3 && freqs[1] === 2) {
    const trip = freqGroups[0][1]
    const pair = freqGroups[1][1]
    return [3, trip, pair]
  }
  if (flush) return [4, ...vals]
  if (isStraight) return [5, straightHigh]
  if (freqs[0] === 3) {
    const trip = freqGroups[0][1]
    const kickers = freqGroups.slice(1).map(([, r]) => r).sort((a, b) => b - a)
    return [6, trip, ...kickers]
  }
  if (freqs[0] === 2 && freqs[1] === 2) {
    const pairs = freqGroups.filter(([f]) => f === 2).map(([, r]) => r).sort((a, b) => b - a)
    const kicker = freqGroups.find(([f]) => f === 1)![1]
    return [7, ...pairs, kicker]
  }
  if (freqs[0] === 2) {
    const pair = freqGroups[0][1]
    const kickers = freqGroups.slice(1).map(([, r]) => r).sort((a, b) => b - a)
    return [8, pair, ...kickers]
  }
  return [9, ...vals]
}

function compareScores(a: ScoreVector, b: ScoreVector): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (i === 0) {
      // Category: lower = better (1=str.flush, 9=high card)
      if (av < bv) return -1
      if (av > bv) return 1
    } else {
      // Tiebreakers: higher rank value = better
      if (av > bv) return -1
      if (av < bv) return 1
    }
  }
  return 0
}

// Encode score vector as a single number: higher = better hand
// Category is inverted (10 - cat) so straight flush → 9, high card → 1
function scoreToRankValue(score: ScoreVector): number {
  let value = 0
  const base = 15
  // First element: invert category (1→9, 9→1)
  value += (10 - score[0]) * Math.pow(base, 5)
  for (let i = 1; i < score.length && i <= 5; i++) {
    value += score[i] * Math.pow(base, 5 - i)
  }
  return Math.round(value)
}

const CATEGORY_TO_RANK: Record<number, HandRank> = {
  1: 'straight_flush',
  2: 'four_of_a_kind',
  3: 'full_house',
  4: 'flush',
  5: 'straight',
  6: 'three_of_a_kind',
  7: 'two_pair',
  8: 'one_pair',
  9: 'high_card',
}

const RANK_DESCRIPTIONS: Record<HandRank, string> = {
  royal_flush: 'ロイヤルフラッシュ',
  straight_flush: 'ストレートフラッシュ',
  four_of_a_kind: 'フォーカード',
  full_house: 'フルハウス',
  flush: 'フラッシュ',
  straight: 'ストレート',
  three_of_a_kind: 'スリーカード',
  two_pair: 'ツーペア',
  one_pair: 'ワンペア',
  high_card: 'ハイカード',
}

function combinations(cards: Card[], k: number): Card[][] {
  if (k === 0) return [[]]
  if (cards.length < k) return []
  const [first, ...rest] = cards
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ]
}

export function evaluateBestHand(cards: Card[]): HandEvalResult {
  if (cards.length < 5) throw new Error('Need at least 5 cards')
  const combos = combinations(cards, 5)

  let bestScore: ScoreVector | null = null
  for (const combo of combos) {
    const score = scoreHand(combo)
    if (bestScore === null || compareScores(score, bestScore) < 0) {
      bestScore = score
    }
  }

  const score = bestScore!
  let rank: HandRank = CATEGORY_TO_RANK[score[0]]
  // Royal flush: straight flush with high card = Ace (14)
  if (score[0] === 1 && score[1] === 14) rank = 'royal_flush'

  return {
    rank,
    rankValue: scoreToRankValue(score),
    description: RANK_DESCRIPTIONS[rank],
  }
}

// Returns negative if a wins, positive if b wins, 0 for tie (higher rankValue = stronger hand)
export function compareHands(a: HandEvalResult, b: HandEvalResult): number {
  if (a.rankValue > b.rankValue) return -1
  if (a.rankValue < b.rankValue) return 1
  return 0
}
