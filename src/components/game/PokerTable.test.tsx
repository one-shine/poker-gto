import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PokerTable } from './PokerTable'
import type { GameState, Player } from '../../types/game'

function player(id: string, position: Player['position'], seatIndex: number, isHero = false): Player {
  return {
    id, position, seatIndex, stackBB: 100,
    holeCards: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
    isHero, agentType: isHero ? 'human' : 'fish_ai',
    isFolded: false, isAllIn: false, currentBetBB: 0,
  }
}

function state(over: Partial<GameState> = {}): GameState {
  return {
    handId: 'h1', street: 'flop',
    players: [
      player('hero', 'BTN', 0, true), player('v1', 'SB', 1), player('v2', 'BB', 2),
      player('v3', 'UTG', 3), player('v4', 'MP', 4), player('v5', 'CO', 5),
    ],
    board: [{ rank: 'Q', suit: 'diamonds' }, { rank: 'J', suit: 'clubs' }, { rank: '2', suit: 'spades' }],
    pot: { mainPotBB: 7.5, sidePots: [] }, actionHistory: [],
    currentActorId: 'v1', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false, ...over,
  }
}

describe('PokerTable', () => {
  it('renders the pot and board community cards', () => {
    render(<PokerTable state={state()} />)
    expect(screen.getByText('ポット 7.5BB')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Q ダイヤ' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'J クラブ' })).toBeInTheDocument()
  })

  it('places the dealer button on the button seat', () => {
    render(<PokerTable state={state()} />)
    expect(screen.getByLabelText('ディーラーボタン')).toBeInTheDocument()
  })

  it('marks the current actor', () => {
    render(<PokerTable state={state({ currentActorId: 'v1' })} />)
    expect(screen.getByText('手番中')).toBeInTheDocument()
  })

  it('reveals all hole cards at showdown', () => {
    render(<PokerTable state={state({ street: 'showdown', isHandComplete: true })} />)
    // hero + 5 opponents すべて表向き → 'A スペード' が6枚 (各プレイヤー同じ手札のテストデータ)
    expect(screen.getAllByRole('img', { name: 'A スペード' }).length).toBe(6)
  })
})
