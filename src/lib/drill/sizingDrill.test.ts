import { describe, it, expect } from 'vitest'
import {
  SIZING_SCENARIOS, generateSizingQuestion, judgeSizing, APPROACH_JP, type Approach,
} from './sizingDrill'

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STREET_LEN = { flop: 3, turn: 4, river: 5 } as const

describe('sizingDrill', () => {
  it('every scenario is well-formed (correct ∈ options, board length matches street, valid conceptId)', () => {
    for (const sc of SIZING_SCENARIOS) {
      expect(sc.options).toContain(sc.correct)
      expect(sc.options.length).toBeGreaterThanOrEqual(2)
      expect(new Set(sc.options).size).toBe(sc.options.length) // 重複なし
      expect(sc.board.trim().split(/\s+/)).toHaveLength(STREET_LEN[sc.street])
      expect(sc.hero.trim().split(/\s+/)).toHaveLength(2)
      // 盤面と手札でカードが重複しない。
      const all = [...sc.board.trim().split(/\s+/), ...sc.hero.trim().split(/\s+/)]
      expect(new Set(all).size).toBe(all.length)
      expect(sc.conceptId.length).toBeGreaterThan(0)
      expect(sc.explain.length).toBeGreaterThan(0)
      expect(APPROACH_JP[sc.correct]).toBeTruthy()
    }
  })

  it('covers all four approaches as correct answers (each is learnable)', () => {
    const covered = new Set<Approach>(SIZING_SCENARIOS.map(s => s.correct))
    for (const a of ['range_bet', 'polarize', 'thin_value', 'pot_control'] as Approach[]) {
      expect(covered.has(a)).toBe(true)
    }
  })

  it('generates a question with parsed board and shuffled options containing the correct one', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const q = generateSizingQuestion(mulberry32(seed))
      expect(q.board).toHaveLength(STREET_LEN[q.street])
      expect(q.heroCards).toHaveLength(2)
      expect(q.options).toContain(q.correct)
      // board は Card オブジェクト (rank/suit を持つ)。
      for (const c of q.board) {
        expect(c).toHaveProperty('rank')
        expect(c).toHaveProperty('suit')
      }
    }
  })

  it('judges the correct approach as correct and others as incorrect', () => {
    const q = generateSizingQuestion(mulberry32(3))
    expect(judgeSizing(q, q.correct).correct).toBe(true)
    const wrong = q.options.find(o => o !== q.correct)!
    const j = judgeSizing(q, wrong)
    expect(j.correct).toBe(false)
    expect(j.correctApproach).toBe(q.correct)
  })

  it('is deterministic for a given seed', () => {
    const a = generateSizingQuestion(mulberry32(42))
    const b = generateSizingQuestion(mulberry32(42))
    expect(a.id).toBe(b.id)
    expect(a.options).toEqual(b.options)
  })
})
