import { describe, it, expect } from 'vitest'
import { CONCEPTS, conceptsForMistake, conceptById } from './concepts'
import { CATEGORY_JP } from '../mistakeLabels'
import type { MistakeCategory } from '../../types/stats'

const ALL_CATEGORIES = Object.keys(CATEGORY_JP) as MistakeCategory[]

describe('theory concepts', () => {
  // 弱点カード(AnalysisPage)が必ず関連理論へリンクできることを保証する。
  it('maps every MistakeCategory to at least one concept', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(conceptsForMistake(cat).length, `no concept for ${cat}`).toBeGreaterThan(0)
    }
  })

  it('has unique, resolvable ids', () => {
    const ids = CONCEPTS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(conceptById(id)?.id).toBe(id)
  })

  it('every relatedMistakes entry is a known category', () => {
    const known = new Set(ALL_CATEGORIES)
    for (const c of CONCEPTS) {
      for (const m of c.relatedMistakes) expect(known.has(m), `${c.id} → ${m}`).toBe(true)
    }
  })
})
