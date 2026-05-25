import { describe, it, expect } from 'vitest'
import { pairEquity, mulberry32 } from './preflopEquity'

describe('preflopEquity', () => {
  it('AA dominates 72o (~0.87 all-in)', () => {
    const e = pairEquity('AA', '72o', 20000, mulberry32(1))
    expect(e).toBeGreaterThan(0.82)
    expect(e).toBeLessThan(0.92)
  })

  it('AA vs KK is roughly 0.80', () => {
    const e = pairEquity('AA', 'KK', 20000, mulberry32(7))
    expect(e).toBeGreaterThan(0.76)
    expect(e).toBeLessThan(0.86)
  })

  it('a coin-flip-ish race (AKs vs 22) sits near 0.5', () => {
    const e = pairEquity('AKs', '22', 20000, mulberry32(3))
    expect(e).toBeGreaterThan(0.42)
    expect(e).toBeLessThan(0.58)
  })

  it('is symmetric: eq(A,B) + eq(B,A) ≈ 1', () => {
    const ab = pairEquity('QJs', 'A5o', 15000, mulberry32(11))
    const ba = pairEquity('A5o', 'QJs', 15000, mulberry32(11))
    expect(ab + ba).toBeGreaterThan(0.97)
    expect(ab + ba).toBeLessThan(1.03)
  })

  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(42), b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
