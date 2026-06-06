import { describe, it, expect } from 'vitest'
import { PREFLOP_SCENARIOS, scenarioKind, scenarioOpponent, scenariosOfKind } from './preflop'

describe('preflop scenario helpers', () => {
  it('classifies every scenario id into open/defense/3bet (5/11/11)', () => {
    const counts = { open: 0, defense: 0, '3bet': 0 }
    for (const s of PREFLOP_SCENARIOS) counts[scenarioKind(s.id)]++
    expect(counts).toEqual({ open: 5, defense: 11, '3bet': 11 })
    expect(PREFLOP_SCENARIOS).toHaveLength(27)
  })

  it('scenarioKind reads the id pattern', () => {
    expect(scenarioKind('btn-open')).toBe('open')
    expect(scenarioKind('bb-vs-btn')).toBe('defense')
    expect(scenarioKind('btn-vs-sb-3bet')).toBe('3bet')
  })

  it('scenarioOpponent extracts the opener/3bettor, null for open', () => {
    expect(scenarioOpponent('btn-open')).toBeNull()
    expect(scenarioOpponent('bb-vs-btn')).toBe('btn')
    expect(scenarioOpponent('btn-vs-sb-3bet')).toBe('sb')
    expect(scenarioOpponent('co-vs-utg')).toBe('utg')
  })

  it('scenariosOfKind returns members sorted by hero position order', () => {
    const opens = scenariosOfKind('open')
    expect(opens.map(s => s.position)).toEqual(['UTG', 'MP', 'CO', 'BTN', 'SB'])
    // すべての kind を合算すると全シナリオを過不足なく覆う
    const total = (['open', 'defense', '3bet'] as const).reduce((n, k) => n + scenariosOfKind(k).length, 0)
    expect(total).toBe(PREFLOP_SCENARIOS.length)
  })
})
