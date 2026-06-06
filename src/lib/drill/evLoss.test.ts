import { describe, it, expect } from 'vitest'
import { evLossFrom } from './evLoss'

describe('evLossFrom', () => {
  it('returns best EV minus chosen EV (>= 0)', () => {
    const all = [{ action: 'bet', ev: 1.0 }, { action: 'check', ev: 0.4 }]
    expect(evLossFrom(all, 'check')).toBeCloseTo(0.6)
    expect(evLossFrom(all, 'bet')).toBe(0)
  })

  it('returns null when the chosen action has no finite EV', () => {
    const all = [{ action: 'push', ev: 0.5 }, { action: 'fold', ev: NaN }]
    expect(evLossFrom(all, 'fold')).toBeNull()
  })

  it('returns null when no action has a finite EV (e.g. preflop approx)', () => {
    const all = [{ action: 'raise', ev: NaN }, { action: 'fold', ev: NaN }]
    expect(evLossFrom(all, 'raise')).toBeNull()
  })
})
