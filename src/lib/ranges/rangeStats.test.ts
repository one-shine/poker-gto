import { describe, it, expect } from 'vitest'
import type { RangeScenario } from '../../types/ranges'
import { rangeStats, combosForHand, TOTAL_COMBOS } from './rangeStats'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

function makeScenario(cells: Record<string, { raise: number; call: number; fold?: number }>): RangeScenario {
  const normalized: RangeScenario['cells'] = {}
  for (const [h, c] of Object.entries(cells)) {
    normalized[h] = { hand: h, raise: c.raise, call: c.call, fold: c.fold ?? Math.max(0, 1 - c.raise - c.call) }
  }
  return { id: 'test', label: 'Test', position: 'BTN', raiseSize: 2.5, cells: normalized }
}

describe('combosForHand', () => {
  it('returns 6 for pairs', () => {
    expect(combosForHand('AA')).toBe(6)
    expect(combosForHand('22')).toBe(6)
  })
  it('returns 4 for suited', () => {
    expect(combosForHand('AKs')).toBe(4)
    expect(combosForHand('T9s')).toBe(4)
  })
  it('returns 12 for offsuit', () => {
    expect(combosForHand('AKo')).toBe(12)
    expect(combosForHand('T9o')).toBe(12)
  })
})

describe('rangeStats (R22-B)', () => {
  it('empty range → all zero', () => {
    const s = rangeStats(makeScenario({}))
    expect(s).toEqual({ combos: 0, raiseCombos: 0, callCombos: 0, pair: 0, suited: 0, offsuit: 0, widthPct: 0 })
  })

  it('AA 100% raise → combos=6, raiseCombos=6, pair=6, others=0', () => {
    const s = rangeStats(makeScenario({ AA: { raise: 1, call: 0 } }))
    expect(s.combos).toBe(6)
    expect(s.raiseCombos).toBe(6)
    expect(s.callCombos).toBe(0)
    expect(s.pair).toBe(6)
    expect(s.suited).toBe(0)
    expect(s.offsuit).toBe(0)
    expect(s.widthPct).toBeCloseTo(6 / TOTAL_COMBOS)
  })

  it('AKs 50% raise + 50% call → combos=4 (3.0+1.0 broken down)', () => {
    // AKs: 4 combos × (raise=0.5 + call=0.5) = 4 combos × 1.0 freq = 4
    const s = rangeStats(makeScenario({ AKs: { raise: 0.5, call: 0.5 } }))
    expect(s.combos).toBe(4)
    expect(s.raiseCombos).toBeCloseTo(2)
    expect(s.callCombos).toBeCloseTo(2)
    expect(s.suited).toBe(4)
    expect(s.pair).toBe(0)
    expect(s.offsuit).toBe(0)
  })

  it('mix of all three categories sums correctly', () => {
    const s = rangeStats(makeScenario({
      KK: { raise: 1, call: 0 },     // 6 pair
      QJs: { raise: 1, call: 0 },    // 4 suited
      ATo: { raise: 0.5, call: 0.5 }, // 12 offsuit × 1.0 = 12
    }))
    expect(s.pair).toBe(6)
    expect(s.suited).toBe(4)
    expect(s.offsuit).toBe(12)
    expect(s.combos).toBe(22)
    expect(s.raiseCombos).toBeCloseTo(6 + 4 + 6) // KK + QJs + ATo×0.5
    expect(s.callCombos).toBeCloseTo(6) // ATo×0.5
    expect(s.widthPct).toBeCloseTo(22 / TOTAL_COMBOS)
  })

  it('skips hands with raise+call == 0 (pure fold)', () => {
    const s = rangeStats(makeScenario({
      AA: { raise: 1, call: 0 },
      // 72o は pure fold (raise=0, call=0) → 集計に入らない
      '72o': { raise: 0, call: 0 },
    }))
    expect(s.combos).toBe(6)
    expect(s.offsuit).toBe(0)
  })

  // 実シナリオでの sanity (BTN open は ~45-55% のレンジ幅が標準)
  it('btn-open range width is in the 30-60% band (sanity)', () => {
    const btn = PREFLOP_SCENARIOS.find(s => s.id === 'btn-open')!
    const s = rangeStats(btn)
    expect(s.widthPct).toBeGreaterThan(0.3)
    expect(s.widthPct).toBeLessThan(0.6)
  })

  it('utg-open is tighter than btn-open (positional discipline)', () => {
    const utg = rangeStats(PREFLOP_SCENARIOS.find(s => s.id === 'utg-open')!)
    const btn = rangeStats(PREFLOP_SCENARIOS.find(s => s.id === 'btn-open')!)
    expect(utg.widthPct).toBeLessThan(btn.widthPct)
  })
})
