import { describe, it, expect, beforeEach } from 'vitest'
import { useProgressStore, levelFromXP, computeUIComplexity } from './progressStore'

describe('progressStore', () => {
  beforeEach(() => useProgressStore.getState().resetProgress())

  it('derives skill level from XP thresholds', () => {
    expect(levelFromXP(0)).toBe('beginner')
    expect(levelFromXP(499)).toBe('beginner')
    expect(levelFromXP(500)).toBe('intermediate')
    expect(levelFromXP(2000)).toBe('advanced')
    expect(levelFromXP(8000)).toBe('pro')
  })

  it('opens UI complexity progressively by level', () => {
    expect(computeUIComplexity('beginner').showPotOdds).toBe(false)
    expect(computeUIComplexity('intermediate').showPotOdds).toBe(true)
    expect(computeUIComplexity('advanced').showRangeAdvantage).toBe(true)
    expect(computeUIComplexity('pro').showMixedStrategies).toBe(true)
  })

  it('levels up and updates UI complexity when XP crosses a threshold', () => {
    useProgressStore.getState().addXP(500)
    expect(useProgressStore.getState().progress.level).toBe('intermediate')
    expect(useProgressStore.getState().uiComplexity.showPotOdds).toBe(true)
  })

  it('accumulates mistakes by category', () => {
    useProgressStore.getState().recordMistake('preflop_too_tight')
    useProgressStore.getState().recordMistake('preflop_too_tight')
    expect(useProgressStore.getState().progress.mistakesByCategory.preflop_too_tight).toBe(2)
  })
})
