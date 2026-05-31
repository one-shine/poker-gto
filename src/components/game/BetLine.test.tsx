import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BetLine } from './BetLine'
import { HERO_ID } from '../../stores/gameStore'
import type { ActionRecord, GameState, PlayerAction, Position, Street } from '../../types/game'

function rec(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId: 'p', actorPosition: 'UTG',
    heroPosition: 'BTN', villainPositions: [], action: 'fold', amountBB: 0,
    potBB: 1.5, isIP: false, timestamp: 0,
    ...over,
  }
}

function state(actionHistory: ActionRecord[]): GameState {
  return {
    handId: 'h1', street: 'preflop', players: [], board: [],
    pot: { mainPotBB: 1.5, sidePots: [] }, actionHistory,
    currentActorId: null, buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false,
  }
}

function mk(actor: Position | typeof HERO_ID, action: PlayerAction, amountBB: number, street: Street = 'preflop'): ActionRecord {
  const isHero = actor === HERO_ID
  return rec({
    street, action, amountBB,
    playerId: isHero ? HERO_ID : actor,
    actorPosition: isHero ? 'BTN' : (actor as Position),
  })
}

describe('BetLine', () => {
  it('renders nothing when history is empty', () => {
    const { container } = render(<BetLine state={state([])} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the position + japanese action + BB amount for each action', () => {
    render(<BetLine state={state([
      mk('UTG', 'raise', 2.5),
      mk('MP', 'call', 2.5),
      mk('BB', 'fold', 0),
    ])} />)
    expect(screen.getByText('UTG')).toBeInTheDocument()
    expect(screen.getByText('レイズ 2.5BB')).toBeInTheDocument()
    expect(screen.getByText('コール 2.5BB')).toBeInTheDocument()
    expect(screen.getByText('フォールド')).toBeInTheDocument()
  })

  it('labels the hero action as あなた', () => {
    render(<BetLine state={state([mk(HERO_ID, 'raise', 3)])} />)
    expect(screen.getByText('あなた')).toBeInTheDocument()
    expect(screen.getByText('レイズ 3BB')).toBeInTheDocument()
  })

  it('groups actions under street labels', () => {
    render(<BetLine state={state([
      mk('UTG', 'raise', 2.5, 'preflop'),
      mk('BB', 'call', 2.5, 'preflop'),
      mk('BB', 'check', 0, 'flop'),
    ])} />)
    expect(screen.getByText('プリフロップ')).toBeInTheDocument()
    expect(screen.getByText('フロップ')).toBeInTheDocument()
    expect(screen.getByText('チェック')).toBeInTheDocument()
  })

  it('shows all-in with its label', () => {
    render(<BetLine state={state([mk('BTN', 'allin', 100)])} />)
    expect(screen.getByText('オールイン 100BB')).toBeInTheDocument()
  })

  it('exposes an action-history landmark label', () => {
    render(<BetLine state={state([mk('UTG', 'raise', 2.5)])} />)
    expect(screen.getByLabelText('アクション履歴')).toBeInTheDocument()
  })
})
