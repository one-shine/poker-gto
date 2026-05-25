import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayerSeat } from './PlayerSeat'
import type { Player } from '../../types/game'

function make(over: Partial<Player> = {}): Player {
  return {
    id: 'p', position: 'BTN', seatIndex: 0, stackBB: 100,
    holeCards: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
    isHero: false, agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB: 0,
    ...over,
  }
}

describe('PlayerSeat', () => {
  it('shows hero hole cards face up', () => {
    render(<PlayerSeat player={make({ isHero: true })} />)
    expect(screen.getByRole('img', { name: 'A スペード' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'K ハート' })).toBeInTheDocument()
  })

  it('hides opponent cards unless revealed', () => {
    const { rerender } = render(<PlayerSeat player={make()} />)
    expect(screen.getAllByRole('img', { name: '裏向きのカード' })).toHaveLength(2)
    rerender(<PlayerSeat player={make()} revealCards />)
    expect(screen.getByRole('img', { name: 'A スペード' })).toBeInTheDocument()
  })

  it('renders position and stack label', () => {
    render(<PlayerSeat player={make({ position: 'CO', stackBB: 99.5 })} />)
    expect(screen.getByLabelText('CO 99.5BB')).toBeInTheDocument()
  })

  it('shows last action and acting indicator', () => {
    render(<PlayerSeat player={make()} isActing lastAction={{ action: 'raise', amountBB: 2.5 }} />)
    expect(screen.getByText('手番中')).toBeInTheDocument()
    expect(screen.getByText('レイズ 2.5BB')).toBeInTheDocument()
  })

  it('shows all-in label', () => {
    render(<PlayerSeat player={make({ isAllIn: true })} />)
    expect(screen.getByText('オールイン')).toBeInTheDocument()
  })
})
