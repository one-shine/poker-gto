import { describe, it, expect } from 'vitest'
import { computeRangeEquity, BUCKET_COUNT, type WeightedCategory } from './rangeVsRange'
import { parseCards } from '../../engine/cards/Card'

const w = (...hands: string[]): WeightedCategory[] => hands.map(hand => ({ hand, weight: 1 }))

describe('computeRangeEquity', () => {
  it('AA crushes a weak range on a dry board (river, exact)', () => {
    // 7-high dry board, AA overpair vs KQ/JT-type air
    const board = parseCards('7h 2c 5d 9s 4d')
    const r = computeRangeEquity({
      rangeA: w('AA'),
      rangeB: w('KQo', 'JTo', 'T9o'),
      board,
      iterations: 1,
    })
    expect(r.a.avgEquity).toBeGreaterThan(0.95)
    expect(r.b.avgEquity).toBeLessThan(0.05)
    expect(r.a.nutShare).toBeGreaterThan(0.9)
  })

  it('avg equities of the two sides sum to ~1 (zero-sum)', () => {
    const board = parseCards('Ks 8d 3c Qh 2s')
    const r = computeRangeEquity({
      rangeA: w('AA', 'KK', 'AKs', 'QJs'),
      rangeB: w('TT', '99', 'AQo', 'KJs', '76s'),
      board,
      iterations: 1,
    })
    expect(r.a.avgEquity + r.b.avgEquity).toBeCloseTo(1, 1)
  })

  it('a set has a clear range + nut advantage over overpairs', () => {
    const board = parseCards('8h 8c 3d') // flop with sampled runouts
    const sets = computeRangeEquity({
      rangeA: w('AA', 'KK'),       // overpairs
      rangeB: w('AA', 'KK', '88'), // includes the set 88
      board,
      iterations: 400,
      seed: 7,
    })
    // 88 (quads) tilts B's average above 0.5 and gives it the nut share
    expect(sets.b.avgEquity).toBeGreaterThan(0.5)
    expect(sets.b.nutShare).toBeGreaterThan(sets.a.nutShare)
  })

  it('buckets are normalized to sum ~1 per side', () => {
    const board = parseCards('Jh Tc 4s')
    const r = computeRangeEquity({
      rangeA: w('AA', 'AKs', 'KQs', '76s'),
      rangeB: w('QQ', 'JTs', 'T9s', 'A5s'),
      board,
      iterations: 300,
      seed: 3,
    })
    expect(r.a.buckets).toHaveLength(BUCKET_COUNT)
    const sum = (arr: number[]) => arr.reduce((s, x) => s + x, 0)
    expect(sum(r.a.buckets)).toBeCloseTo(1, 5)
    expect(sum(r.b.buckets)).toBeCloseTo(1, 5)
  })

  it('is reproducible for a fixed seed on a flop', () => {
    const board = parseCards('Qd 7s 2h')
    const args = { rangeA: w('AA', 'KK', 'AQo'), rangeB: w('JJ', 'TT', 'KQs', '98s'), board, iterations: 200, seed: 42 }
    const r1 = computeRangeEquity(args)
    const r2 = computeRangeEquity(args)
    expect(r1.a.avgEquity).toBe(r2.a.avgEquity)
    expect(r1.b.buckets).toEqual(r2.b.buckets)
  })

  it('returns empty result when a range is empty or board malformed', () => {
    const board = parseCards('Ah Kh Qh')
    expect(computeRangeEquity({ rangeA: [], rangeB: w('AA'), board, iterations: 10 }).a.comboCount).toBe(0)
    // 2-card board is invalid
    expect(computeRangeEquity({ rangeA: w('AA'), rangeB: w('KK'), board: parseCards('Ah Kh'), iterations: 10 }).runouts).toBe(0)
  })
})
