import { describe, it, expect } from 'vitest'
import { actionFreqs, judge, generateQuestion, allHandCategories, type PreflopDrillQuestion } from './preflopDrill'

const q = (scenarioId: string, hand: string): PreflopDrillQuestion => ({
  scenarioId, scenarioLabel: '', position: '', hand, options: [],
})

describe('preflop drill', () => {
  it('enumerates all 169 categories', () => {
    expect(allHandCategories()).toHaveLength(169)
  })

  it('AA is a raise (correct) and a fold (mistake) for BTN open', () => {
    expect(judge(q('btn-open', 'AA'), 'raise').correct).toBe(true)
    expect(judge(q('btn-open', 'AA'), 'fold').correct).toBe(false)
  })

  it('72o is a fold (correct) and a raise (mistake) for UTG open', () => {
    expect(judge(q('utg-open', '72o'), 'fold').correct).toBe(true)
    expect(judge(q('utg-open', '72o'), 'raise').correct).toBe(false)
  })

  it('actionFreqs of an out-of-range hand is fold 100%', () => {
    const f = actionFreqs('utg-open', '72o')
    expect(f.find(a => a.action === 'fold')?.freq).toBe(1)
  })

  it('generates questions with deterministic rng', () => {
    const question = generateQuestion(() => 0)
    expect(question.hand).toBeTruthy()
    expect(question.options.length).toBeGreaterThanOrEqual(2)
  })
})
