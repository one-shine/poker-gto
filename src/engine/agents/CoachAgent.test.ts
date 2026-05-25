import { describe, it, expect } from 'vitest'
import { evaluateAction } from './CoachAgent'
import { fromRangeScenario } from '../../lib/solver/fromRangeScenario'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

const btn = fromRangeScenario(PREFLOP_SCENARIOS.find(s => s.id === 'btn-open')!)
const co = fromRangeScenario(PREFLOP_SCENARIOS.find(s => s.id === 'co-open')!)

describe('CoachAgent.evaluateAction (approximate / 頻度ベース)', () => {
  it('treats a 100% raise hand played as raise as correct', () => {
    const fb = evaluateAction(btn, 'AA', 'raise', 'BTN', 2.5)
    expect(fb?.kind).toBe('correct')
    expect(fb?.evLoss).toBe(0)
  })

  it('flags folding a pure-raise hand as a tight mistake (critical)', () => {
    const fb = evaluateAction(btn, 'AA', 'fold', 'BTN')
    expect(fb?.kind).toBe('mistake')
    expect(fb?.category).toBe('preflop_too_tight')
    expect(fb?.severity).toBe('critical')
  })

  it('treats a hand outside the range as implicit fold — playing it is too wide', () => {
    // 72o は btn-open レンジ外 → fold 100% とみなす
    const raise = evaluateAction(btn, '72o', 'raise', 'BTN', 2.5)
    expect(raise?.kind).toBe('mistake')
    expect(raise?.category).toBe('preflop_too_wide')
    const fold = evaluateAction(btn, '72o', 'fold', 'BTN')
    expect(fold?.kind).toBe('correct')
  })

  it('treats a mixed hand as a learning opportunity (either action correct)', () => {
    // A7s @ co-open: raise 0.7 / fold 0.3 — どちらも 10% 以上
    const raise = evaluateAction(co, 'A7s', 'raise', 'CO', 2.5)
    expect(raise?.kind).toBe('mixed')
    const fold = evaluateAction(co, 'A7s', 'fold', 'CO')
    expect(fold?.kind).toBe('mixed')
  })

  it('does not show EV numbers for approximate solutions', () => {
    const fb = evaluateAction(btn, 'AA', 'fold', 'BTN')
    expect(fb?.showEv).toBe(false)
    expect(fb?.evLoss).toBe(0)
  })

  it('returns a strategy array for the hand (for UI frequency bars)', () => {
    const fb = evaluateAction(btn, 'AKs', 'raise', 'BTN', 2.5)
    expect(fb?.strategy.some(s => s.action === 'raise')).toBe(true)
  })
})
