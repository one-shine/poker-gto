import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveStrategyPanel } from './LiveStrategyPanel'
import { useSessionStore } from '../../stores/sessionStore'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import type { ActionRecord, GameState, Player } from '../../types/game'

function fold(id: string): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId: id, heroPosition: 'BTN',
    villainPositions: [], action: 'fold', amountBB: 0, potBB: 1.5, isIP: true, timestamp: 0,
  }
}

function pending(callAmount = 1): ActionRequiredPayload {
  const p = (id: string, position: Player['position'], seatIndex: number, isHero = false): Player => ({
    id, position, seatIndex, stackBB: 100,
    holeCards: isHero ? [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }] : null,
    isHero, agentType: isHero ? 'human' : 'fish_ai',
    isFolded: ['v3', 'v4', 'v5'].includes(id), isAllIn: false,
    currentBetBB: id === 'v2' ? callAmount : 0,
  })
  const state: GameState = {
    handId: 'h1', street: 'preflop',
    players: [
      p('hero', 'BTN', 0, true), p('v1', 'SB', 1), p('v2', 'BB', 2),
      p('v3', 'UTG', 3), p('v4', 'MP', 4), p('v5', 'CO', 5),
    ],
    board: [], pot: { mainPotBB: 1.5, sidePots: [] },
    actionHistory: [fold('v3'), fold('v4'), fold('v5')],
    currentActorId: 'hero', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false,
  }
  return { state, playerId: 'hero', validActions: ['call', 'fold', 'raise'], callAmount, minRaiseToAmount: 2 }
}

describe('LiveStrategyPanel', () => {
  beforeEach(() => useSessionStore.getState().clearSession())

  it('renders the GTO strategy bars for the current hand', async () => {
    render(<LiveStrategyPanel pending={pending()} allowLiveSolve showPotOdds={false} />)
    expect(await screen.findByText(/AKs @ btn-open/)).toBeInTheDocument()
    // AKs は btn-open で 100% レイズ
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('excludes the shown hand from the accuracy sample (markHinted)', async () => {
    render(<LiveStrategyPanel pending={pending()} allowLiveSolve showPotOdds={false} />)
    await screen.findByText(/AKs @ btn-open/)
    expect(useSessionStore.getState().hintedHandIds.has('h1')).toBe(true)
  })

  it('shows pot odds and required equity when enabled (A2)', async () => {
    render(<LiveStrategyPanel pending={pending(1)} allowLiveSolve showPotOdds />)
    await screen.findByText(/AKs @ btn-open/)
    expect(screen.getByText(/ポットオッズ/)).toBeInTheDocument()
    expect(screen.getByText(/必要勝率/)).toBeInTheDocument()
  })

  it('hides pot odds when showPotOdds is false', async () => {
    render(<LiveStrategyPanel pending={pending(1)} allowLiveSolve showPotOdds={false} />)
    await screen.findByText(/AKs @ btn-open/)
    expect(screen.queryByText(/ポットオッズ/)).toBeNull()
  })
})
