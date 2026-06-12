// Allocation-free 7-card hand evaluator for CFR equity matrix hot paths.
// Encoding: id = rankIndex * 4 + suitIndex, where rankIndex = rank-2 (0=2..12=A),
// suitIndex follows SUITS order: spades=0, hearts=1, diamonds=2, clubs=3.

import type { Card } from '../../types/game'
import { RANK_VALUES } from '../../engine/cards/Card'

const SUIT_INDEX: Record<string, number> = {
  spades: 0, hearts: 1, diamonds: 2, clubs: 3,
}

/** Encode a Card to a 0-51 integer. id = (rankValue-2)*4 + suitIndex */
export function fastCardId(card: Card): number {
  return (RANK_VALUES[card.rank] - 2) * 4 + SUIT_INDEX[card.suit]
}

// Module-scope scratch buffers — never allocated per call
const _rankCount = new Int32Array(13)   // index 0=2 .. 12=A
const _suitCount = new Int32Array(4)    // spades/hearts/diamonds/clubs
// per-suit rank bitmasks for flush detection
const _suitRankBits = new Int32Array(4) // bit i set if rank (i+2) present in that suit

// scoreToRankValue replicates HandEvaluator's encoding exactly:
// value = (10 - category) * 15^5 + t1*15^4 + t2*15^3 + t3*15^2 + t4*15 + t5
// Base powers precomputed
const P = [
  15 ** 5, // category slot
  15 ** 4,
  15 ** 3,
  15 ** 2,
  15 ** 1,
  15 ** 0,
]

function encodeScore(cat: number, t1: number, t2: number, t3: number, t4: number, t5: number): number {
  return Math.round((10 - cat) * P[0] + t1 * P[1] + t2 * P[2] + t3 * P[3] + t4 * P[4] + t5 * P[5])
}

/**
 * Extract the best straight high card from a rank bitmask (bit i = rankValue i+2 present).
 * Returns the high card of the best straight (5-14), or 0 if none.
 * Handles wheel (A-2-3-4-5) by adding ace as bit -1 → tested separately.
 */
function bestStraightHigh(rankBits: number): number {
  // Normal straights: test windows of 5 consecutive bits
  for (let high = 12; high >= 4; high--) {
    // rankBits bit index for rankValue v is (v-2)
    const mask = 0b11111 << (high - 4)
    if ((rankBits & mask) === mask) return high + 2 // rankValue = high+2
  }
  // Wheel: A(bit12) + 2(bit0) + 3(bit1) + 4(bit2) + 5(bit3)
  if ((rankBits & 0b1111) === 0b1111 && (rankBits & (1 << 12)) !== 0) return 5
  return 0
}

/**
 * Evaluate best 5-card hand from exactly 7 encoded card ids.
 * Returns an integer where higher = stronger hand, matching rankValue from evaluateBestHand.
 */
export function evaluate7(ids: ArrayLike<number>): number {
  // Reset scratch buffers
  _rankCount.fill(0)
  _suitCount.fill(0)
  _suitRankBits.fill(0)

  for (let i = 0; i < 7; i++) {
    const id = ids[i]
    const ri = (id >> 2)      // rank index 0-12
    const si = id & 3         // suit index 0-3
    _rankCount[ri]++
    _suitCount[si]++
    _suitRankBits[si] |= (1 << ri)
  }

  // Build rank bitmask across all suits (for straight detection)
  let allRankBits = 0
  for (let i = 0; i < 7; i++) {
    allRankBits |= (1 << (ids[i] >> 2))
  }

  // --- Flush check ---
  let flushSuit = -1
  for (let s = 0; s < 4; s++) {
    if (_suitCount[s] >= 5) { flushSuit = s; break }
  }

  if (flushSuit >= 0) {
    // Check for straight flush within the flush suit
    const sfHigh = bestStraightHigh(_suitRankBits[flushSuit])
    if (sfHigh > 0) {
      // cat=1, tiebreaker=straightHigh; matches [1, straightHigh]
      return encodeScore(1, sfHigh, 0, 0, 0, 0)
    }
    // Regular flush — pick top 5 ranks from flush suit
    const fbits = _suitRankBits[flushSuit]
    let f0 = 0, f1 = 0, f2 = 0, f3 = 0, f4 = 0
    let picked = 0
    for (let ri = 12; ri >= 0 && picked < 5; ri--) {
      if (fbits & (1 << ri)) {
        const rv = ri + 2
        if (picked === 0) f0 = rv
        else if (picked === 1) f1 = rv
        else if (picked === 2) f2 = rv
        else if (picked === 3) f3 = rv
        else f4 = rv
        picked++
      }
    }
    // cat=4, tiebreakers=[f0,f1,f2,f3,f4]; matches [4, ...vals(5)]
    return encodeScore(4, f0, f1, f2, f3, f4)
  }

  // --- Quads check ---
  // Find rank with count 4; pick highest kicker from remaining
  let quadRank = -1
  for (let ri = 12; ri >= 0; ri--) {
    if (_rankCount[ri] === 4) { quadRank = ri; break }
  }
  if (quadRank >= 0) {
    let kicker = -1
    for (let ri = 12; ri >= 0; ri--) {
      if (ri !== quadRank && _rankCount[ri] > 0) { kicker = ri; break }
    }
    // cat=2, [quad rankValue, kicker rankValue]; matches [2, quad, kicker]
    return encodeScore(2, quadRank + 2, kicker + 2, 0, 0, 0)
  }

  // --- Full house check ---
  // Find best trip + best pair (with 7 cards there may be trip+trip or trip+pair+pair)
  let tripRank = -1
  for (let ri = 12; ri >= 0; ri--) {
    if (_rankCount[ri] >= 3) { tripRank = ri; break }
  }
  if (tripRank >= 0) {
    // Look for best pair from remaining ranks (including a second trip treated as pair)
    let pairRank = -1
    for (let ri = 12; ri >= 0; ri--) {
      if (ri === tripRank) continue
      if (_rankCount[ri] >= 2) { pairRank = ri; break }
    }
    if (pairRank >= 0) {
      // cat=3, [trip rankValue, pair rankValue]; matches [3, trip, pair]
      return encodeScore(3, tripRank + 2, pairRank + 2, 0, 0, 0)
    }
  }

  // --- Straight check (no flush already returned) ---
  const straightHigh = bestStraightHigh(allRankBits)
  if (straightHigh > 0) {
    // cat=5, [straightHigh]; matches [5, straightHigh]
    return encodeScore(5, straightHigh, 0, 0, 0, 0)
  }

  // --- Three of a kind ---
  if (tripRank >= 0) {
    // Pick top 2 kickers not from trip rank
    let k0 = 0, k1 = 0
    let kpicked = 0
    for (let ri = 12; ri >= 0 && kpicked < 2; ri--) {
      if (ri !== tripRank && _rankCount[ri] > 0) {
        if (kpicked === 0) k0 = ri + 2
        else k1 = ri + 2
        kpicked++
      }
    }
    // cat=6, [trip, kicker0, kicker1]; matches [6, trip, ...kickers]
    return encodeScore(6, tripRank + 2, k0, k1, 0, 0)
  }

  // --- Two pair / One pair / High card ---
  // Collect all pairs (desc)
  let p0 = -1, p1 = -1
  for (let ri = 12; ri >= 0; ri--) {
    if (_rankCount[ri] >= 2) {
      if (p0 < 0) p0 = ri
      else if (p1 < 0) { p1 = ri; break }
    }
  }

  if (p0 >= 0 && p1 >= 0) {
    // Two pair — pick best kicker not from either pair rank
    let kicker = 0
    for (let ri = 12; ri >= 0; ri--) {
      if (ri !== p0 && ri !== p1 && _rankCount[ri] > 0) { kicker = ri + 2; break }
    }
    // cat=7, [pair0, pair1, kicker]; matches [7, ...pairs(desc), kicker]
    return encodeScore(7, p0 + 2, p1 + 2, kicker, 0, 0)
  }

  if (p0 >= 0) {
    // One pair — pick top 3 kickers not from pair rank
    let k0 = 0, k1 = 0, k2 = 0
    let kpicked = 0
    for (let ri = 12; ri >= 0 && kpicked < 3; ri--) {
      if (ri !== p0 && _rankCount[ri] > 0) {
        if (kpicked === 0) k0 = ri + 2
        else if (kpicked === 1) k1 = ri + 2
        else k2 = ri + 2
        kpicked++
      }
    }
    // cat=8, [pair, k0, k1, k2]; matches [8, pair, ...kickers]
    return encodeScore(8, p0 + 2, k0, k1, k2, 0)
  }

  // High card — top 5 ranks
  let h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0
  let hpicked = 0
  for (let ri = 12; ri >= 0 && hpicked < 5; ri--) {
    if (_rankCount[ri] > 0) {
      if (hpicked === 0) h0 = ri + 2
      else if (hpicked === 1) h1 = ri + 2
      else if (hpicked === 2) h2 = ri + 2
      else if (hpicked === 3) h3 = ri + 2
      else h4 = ri + 2
      hpicked++
    }
  }
  // cat=9, [h0..h4]; matches [9, ...vals(5)]
  return encodeScore(9, h0, h1, h2, h3, h4)
}
