import { describe, it, expect } from 'vitest'
import { pairEquity, mulberry32, nWayEquity } from './preflopEquity'

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

  describe('nWayEquity (Phase C2)', () => {
    it('N=2 matches pairEquity within MC error (AA vs KK ≈ 0.82)', () => {
      const [aa] = nWayEquity(['AA', 'KK'], 30000, mulberry32(7))
      expect(aa).toBeGreaterThan(0.78)
      expect(aa).toBeLessThan(0.86)
    })

    it('shares always sum to 1 (pot is fully distributed)', () => {
      for (const cats of [['AA', 'KK', 'QQ'], ['AKs', 'QJs', '55', 'T9o'], ['AA', 'AKs', 'QQ', 'JTs', '99', '76s']]) {
        const sum = nWayEquity(cats, 20000, mulberry32(5)).reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(1, 5)
      }
    })

    it('3-way AA/KK/QQ is strength-ordered near 0.67/0.18/0.15', () => {
      const [aa, kk, qq] = nWayEquity(['AA', 'KK', 'QQ'], 60000, mulberry32(1))
      expect(aa).toBeGreaterThan(kk)
      expect(kk).toBeGreaterThan(qq)
      expect(aa).toBeGreaterThan(0.63)
      expect(aa).toBeLessThan(0.71)
    })

    it('multiway re-evaluates hands: a suited connector beats a big offsuit ace 6-way', () => {
      // 76s makes straights/flushes that win family pots; AKo is high-card-dependent.
      const cats = ['AA', 'KK', '76s', 'AKo', 'QQ', 'JJ']
      const e = nWayEquity(cats, 80000, mulberry32(9))
      const sc = e[cats.indexOf('76s')]
      const ako = e[cats.indexOf('AKo')]
      expect(sc).toBeGreaterThan(ako)
    })
  })
})
