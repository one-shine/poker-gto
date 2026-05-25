import { describe, it, expect } from 'vitest'
import { sampleStrategyAction, mapToValid } from './GTOPlayerAgent'
import type { ActionSolution } from '../../types/solver'
import type { GameState, Player, PlayerAction } from '../../types/game'

const sols: ActionSolution[] = [
  { action: 'raise', sizeBB: 2.5, frequency: 0.7, ev: 0 },
  { action: 'fold', frequency: 0.3, ev: 0 },
]

function payload(over: { callAmount?: number; validActions?: PlayerAction[] } = {}) {
  const me: Player = {
    id: 'v1', position: 'BTN', seatIndex: 0, stackBB: 100, holeCards: null,
    isHero: false, agentType: 'gto_ai', isFolded: false, isAllIn: false, currentBetBB: 0,
  }
  const state = { players: [me] } as unknown as GameState
  return {
    state,
    playerId: 'v1',
    validActions: over.validActions ?? (['fold', 'call', 'raise'] as PlayerAction[]),
    callAmount: over.callAmount ?? 1,
    minRaiseToAmount: 2,
  }
}

describe('GTOPlayerAgent sampling', () => {
  it('samples by frequency weight (rng at start picks first)', () => {
    expect(sampleStrategyAction(sols, () => 0.0).action).toBe('raise')
  })

  it('samples the low-frequency action when rng lands in its band', () => {
    // total=1.0, raise covers [0,0.7), fold covers [0.7,1.0)
    expect(sampleStrategyAction(sols, () => 0.9).action).toBe('fold')
  })
})

describe('GTOPlayerAgent mapToValid', () => {
  it('maps a sampled raise to a clamped raise-to amount', () => {
    const d = mapToValid({ action: 'raise', sizeBB: 2.5, frequency: 1, ev: 0 }, payload())
    expect(d.action).toBe('raise')
    expect(d.amount).toBe(2.5)
  })

  it('falls back to call when raise is not valid', () => {
    const d = mapToValid({ action: 'raise', sizeBB: 2.5, frequency: 1, ev: 0 }, payload({ validActions: ['fold', 'call'] }))
    expect(d.action).toBe('call')
  })

  it('maps a sampled call with no bet to check', () => {
    const d = mapToValid({ action: 'call', frequency: 1, ev: 0 }, payload({ callAmount: 0, validActions: ['check', 'raise'] }))
    expect(d.action).toBe('check')
  })

  it('maps fold to check when checking is free', () => {
    const d = mapToValid({ action: 'fold', frequency: 1, ev: 0 }, payload({ callAmount: 0, validActions: ['check', 'raise'] }))
    expect(d.action).toBe('check')
  })
})
