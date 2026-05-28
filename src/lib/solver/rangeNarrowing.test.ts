import { describe, it, expect } from 'vitest'
import type { Card, Rank, Suit } from '../../types/game'
import type { Combo } from './riverSolver'
import { capRange, narrowByRiverStrength, MAX_COMBOS, MIN_WEIGHT } from './rangeNarrowing'
import { comboKey } from './riverRanges'

const c = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })

describe('capRange (R15-A)', () => {
  it('drops combos below MIN_WEIGHT', () => {
    const combos: Combo[] = [
      { cards: [c('A', 'spades'), c('A', 'hearts')], weight: 1 },
      { cards: [c('K', 'spades'), c('K', 'hearts')], weight: 0.5 },
      { cards: [c('2', 'spades'), c('3', 'hearts')], weight: 0.01 }, // < MIN_WEIGHT
    ]
    const kept = capRange(combos)
    expect(kept.length).toBe(2)
    expect(kept.some(k => k.cards[0].rank === '2')).toBe(false)
    expect(MIN_WEIGHT).toBeGreaterThan(0)
  })

  it('respects MAX_COMBOS upper bound (top-N by weight)', () => {
    // generate MAX_COMBOS + 50 combos with weight 1.0 (all above threshold)
    const combos: Combo[] = []
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
    let cnt = 0
    for (let i = 0; i < ranks.length && cnt < MAX_COMBOS + 50; i++) {
      for (let j = i; j < ranks.length && cnt < MAX_COMBOS + 50; j++) {
        for (const s1 of suits) for (const s2 of suits) {
          if (i === j && s1 >= s2) continue
          if (cnt >= MAX_COMBOS + 50) break
          combos.push({ cards: [c(ranks[i], s1), c(ranks[j], s2)], weight: 1 })
          cnt++
        }
      }
    }
    expect(combos.length).toBeGreaterThan(MAX_COMBOS)
    const kept = capRange(combos)
    expect(kept.length).toBe(MAX_COMBOS)
  })

  it('always preserves must combo (hero hand) even when capping', () => {
    const heroCards: [Card, Card] = [c('7', 'diamonds'), c('2', 'clubs')]
    const heroK = comboKey(heroCards)
    // Build > MAX_COMBOS with hero at weight 0.06 (just above MIN_WEIGHT)
    const combos: Combo[] = [{ cards: heroCards, weight: 0.06 }]
    for (let i = 0; i < MAX_COMBOS + 50; i++) {
      // dummy combos with higher weight to outrank hero
      combos.push({ cards: [c('A', 'spades'), c('A', 'hearts')], weight: 1 })
    }
    const kept = capRange(combos, heroK)
    expect(kept.some(c => comboKey(c.cards) === heroK)).toBe(true)
  })

  it('pass-through when input is small', () => {
    const combos: Combo[] = [
      { cards: [c('A', 'spades'), c('K', 'hearts')], weight: 1 },
      { cards: [c('Q', 'spades'), c('J', 'hearts')], weight: 0.4 },
    ]
    expect(capRange(combos).length).toBe(2)
  })
})

describe('narrowByRiverStrength (R15-B)', () => {
  // river 板 A-K-7-3-2 rainbow
  const board: Card[] = [
    c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'),
    c('3', 'hearts'), c('2', 'spades'),
  ]

  it('drops bottom ~20% on river by raw rank value', () => {
    const combos: Combo[] = [
      // 強い手
      { cards: [c('A', 'hearts'), c('A', 'clubs')], weight: 1 },     // top set
      { cards: [c('K', 'hearts'), c('K', 'clubs')], weight: 1 },     // mid set
      { cards: [c('A', 'diamonds'), c('K', 'spades')], weight: 1 },  // top two
      { cards: [c('A', 'clubs'), c('Q', 'hearts')], weight: 1 },     // top pair
      { cards: [c('Q', 'spades'), c('J', 'hearts')], weight: 1 },    // air
      { cards: [c('T', 'spades'), c('9', 'hearts')], weight: 1 },    // air
      { cards: [c('8', 'spades'), c('6', 'hearts')], weight: 1 },    // worst air
      { cards: [c('5', 'spades'), c('4', 'hearts')], weight: 1 },    // worst air
      { cards: [c('Q', 'clubs'), c('5', 'diamonds')], weight: 1 },   // worst air
      { cards: [c('J', 'spades'), c('6', 'clubs')], weight: 1 },     // worst air
    ]
    const kept = narrowByRiverStrength(combos, board)
    // 20% drop → 10 * 0.8 = 8 kept
    expect(kept.length).toBe(8)
    // 強い手はすべて残る (rank ペアで判定; スートは個別性で区別する必要なし)
    const hasRanks = (a: Rank, b: Rank) =>
      kept.some(k => (k.cards[0].rank === a && k.cards[1].rank === b) ||
                     (k.cards[1].rank === a && k.cards[0].rank === b))
    expect(hasRanks('A', 'A')).toBe(true)
    expect(hasRanks('K', 'K')).toBe(true)
  })

  it('always preserves must combo (hero hand)', () => {
    const heroCards: [Card, Card] = [c('5', 'spades'), c('4', 'hearts')] // 弱い手
    const heroK = comboKey(heroCards)
    const combos: Combo[] = [heroCards, ...Array.from({ length: 30 }, (_, i) => {
      const r1 = (['A', 'K', 'Q', 'J', 'T'] as Rank[])[i % 5]
      const r2 = (['A', 'K', 'Q', 'J', 'T'] as Rank[])[(i + 1) % 5]
      const s1 = (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[])[i % 4]
      const s2 = (['hearts', 'clubs', 'spades', 'diamonds'] as Suit[])[i % 4]
      return [c(r1, s1), c(r2, s2)] as [Card, Card]
    }).map(cards => ({ cards, weight: 1 } as Combo))].map(x => 'cards' in x ? x : { cards: x, weight: 1 } as Combo)
    const kept = narrowByRiverStrength(combos as Combo[], board, heroK)
    expect(kept.some(k => comboKey(k.cards) === heroK)).toBe(true)
  })

  it('treats board-overlapping combos as lowest (drop priority)', () => {
    const combos: Combo[] = [
      { cards: [c('A', 'spades'), c('K', 'diamonds')], weight: 1 }, // 両方ボード→overlap
      { cards: [c('A', 'hearts'), c('A', 'clubs')], weight: 1 },     // top set
      { cards: [c('K', 'hearts'), c('K', 'clubs')], weight: 1 },     // mid set
      { cards: [c('Q', 'spades'), c('J', 'hearts')], weight: 1 },    // air
      { cards: [c('T', 'clubs'), c('9', 'diamonds')], weight: 1 },   // air
    ]
    const kept = narrowByRiverStrength(combos, board)
    // 5 * 0.8 = 4 kept → overlap が最下位扱いで落ちる
    expect(kept.length).toBe(4)
    expect(kept.some(k =>
      k.cards[0].rank === 'A' && k.cards[0].suit === 'spades' &&
      k.cards[1].rank === 'K' && k.cards[1].suit === 'diamonds',
    )).toBe(false)
  })

  it('no-op on non-river streets (flop/turn)', () => {
    const flop = board.slice(0, 3)
    const turn = board.slice(0, 4)
    const combos: Combo[] = [
      { cards: [c('A', 'hearts'), c('A', 'clubs')], weight: 1 },
      { cards: [c('Q', 'spades'), c('J', 'hearts')], weight: 1 },
    ]
    expect(narrowByRiverStrength(combos, flop).length).toBe(combos.length)
    expect(narrowByRiverStrength(combos, turn).length).toBe(combos.length)
  })

  it('no-op on tiny ranges (avoid degenerate solve)', () => {
    const combos: Combo[] = [
      { cards: [c('A', 'hearts'), c('A', 'clubs')], weight: 1 },
      { cards: [c('K', 'hearts'), c('K', 'clubs')], weight: 1 },
    ]
    expect(narrowByRiverStrength(combos, board).length).toBe(2)
  })
})
