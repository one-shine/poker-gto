import { describe, it, expect } from 'vitest'
import { generateOddsQuestion, judgeOdds, requiredEquity, type OddsQuestionType } from './oddsDrill'

// 決定的な疑似乱数(seeded)
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

describe('oddsDrill', () => {
  it('requiredEquity matches the standard heuristics (half25 / two-thirds29 / pot33)', () => {
    expect(Math.round(requiredEquity(6, 3) * 100)).toBe(25) // ½ pot
    expect(Math.round(requiredEquity(6, 4) * 100)).toBe(29) // ⅔ pot
    expect(Math.round(requiredEquity(6, 6) * 100)).toBe(33) // pot
  })

  it('every generated question includes its correct option', () => {
    const rng = seeded(42)
    const types: OddsQuestionType[] = ['required-equity', 'call-fold', 'outs-equity']
    for (let i = 0; i < 60; i++) {
      const q = generateOddsQuestion(rng, types[i % 3])
      expect(q.options.some(o => o.id === q.correctId), `${q.type}: ${q.prompt}`).toBe(true)
      expect(q.options.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('required-equity: correct option equals B/(P+2B)', () => {
    const rng = seeded(7)
    for (let i = 0; i < 30; i++) {
      const q = generateOddsQuestion(rng, 'required-equity')
      const expected = Math.round(requiredEquity(q.meta.potBB!, q.meta.betBB!) * 100)
      expect(q.correctId).toBe(`p${expected}`)
      expect(q.meta.requiredPct).toBe(expected)
    }
  })

  it('call-fold: correct is call iff equity >= required equity', () => {
    const rng = seeded(99)
    for (let i = 0; i < 40; i++) {
      const q = generateOddsQuestion(rng, 'call-fold')
      const shouldCall = q.meta.equityPct! >= q.meta.requiredPct!
      expect(q.correctId).toBe(shouldCall ? 'call' : 'fold')
      expect(q.options.map(o => o.id).sort()).toEqual(['call', 'fold'])
    }
  })

  it('outs-equity: correct equals outs × multiplier (capped at 95)', () => {
    const rng = seeded(123)
    for (let i = 0; i < 30; i++) {
      const q = generateOddsQuestion(rng, 'outs-equity')
      const expected = Math.min(95, q.meta.outs! * q.meta.mult!)
      expect(q.correctId).toBe(`p${expected}`)
    }
  })

  it('judgeOdds compares the chosen option to the correct one', () => {
    const q = generateOddsQuestion(seeded(1), 'required-equity')
    expect(judgeOdds(q, q.correctId).correct).toBe(true)
    const wrong = q.options.find(o => o.id !== q.correctId)!
    expect(judgeOdds(q, wrong.id).correct).toBe(false)
    expect(judgeOdds(q, q.correctId).correctLabel).toBe(q.options.find(o => o.id === q.correctId)!.label)
  })
})
