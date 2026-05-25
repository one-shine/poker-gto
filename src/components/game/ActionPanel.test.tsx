import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionPanel } from './ActionPanel'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import type { GameState, Player, PlayerAction } from '../../types/game'

function hero(over: Partial<Player> = {}): Player {
  return {
    id: 'hero', position: 'BTN', seatIndex: 0, stackBB: 100,
    holeCards: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }],
    isHero: true, agentType: 'human', isFolded: false, isAllIn: false, currentBetBB: 0,
    ...over,
  }
}

function pending(over: {
  street?: GameState['street']
  validActions?: PlayerAction[]
  callAmount?: number
  minRaiseToAmount?: number
  heroBet?: number
} = {}): ActionRequiredPayload {
  const state: GameState = {
    handId: 'h1', street: over.street ?? 'preflop',
    players: [hero({ currentBetBB: over.heroBet ?? 0 })],
    board: [], pot: { mainPotBB: 1.5, sidePots: [] }, actionHistory: [],
    currentActorId: 'hero', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false,
  }
  return {
    state, playerId: 'hero',
    validActions: over.validActions ?? ['call', 'fold', 'raise', 'allin'],
    callAmount: over.callAmount ?? 1,
    minRaiseToAmount: over.minRaiseToAmount ?? 2,
  }
}

describe('ActionPanel', () => {
  it('shows Fold / Call / Raise when facing a bet', () => {
    const onAction = vi.fn()
    render(<ActionPanel pending={pending()} onAction={onAction} />)
    expect(screen.getByLabelText(/フォールド/)).toBeInTheDocument()
    expect(screen.getByLabelText(/コール 1BB/)).toBeInTheDocument()
    expect(screen.getByLabelText(/レイズ/)).toBeInTheDocument()
  })

  it('shows Check / Bet (not Call / Raise) when no bet to face', () => {
    const onAction = vi.fn()
    render(<ActionPanel pending={pending({ street: 'flop', validActions: ['check', 'raise', 'allin'], callAmount: 0, minRaiseToAmount: 1 })} onAction={onAction} />)
    expect(screen.getByLabelText('チェック (c)')).toBeInTheDocument()
    expect(screen.queryByLabelText(/フォールド/)).toBeNull()
    expect(screen.getByLabelText(/ベット 1BB \(r\)/)).toBeInTheDocument()
  })

  it('fires fold/call on click', () => {
    const onAction = vi.fn()
    render(<ActionPanel pending={pending()} onAction={onAction} />)
    fireEvent.click(screen.getByLabelText(/フォールド/))
    fireEvent.click(screen.getByLabelText(/コール 1BB/))
    expect(onAction).toHaveBeenNthCalledWith(1, 'fold')
    expect(onAction).toHaveBeenNthCalledWith(2, 'call')
  })

  it('applies a preset then raises to that amount', () => {
    const onAction = vi.fn()
    render(<ActionPanel pending={pending()} onAction={onAction} />)
    fireEvent.click(screen.getByLabelText('3BB (3BB)'))
    fireEvent.click(screen.getByLabelText(/レイズ 3BB/))
    expect(onAction).toHaveBeenCalledWith('raise', 3)
  })

  it('keyboard f folds', () => {
    const onAction = vi.fn()
    render(<ActionPanel pending={pending()} onAction={onAction} />)
    fireEvent.keyDown(window, { key: 'f' })
    expect(onAction).toHaveBeenCalledWith('fold')
  })
})
