import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HandReplay } from './HandReplay'
import type { ActionRecord } from '../../types/game'

function rec(over: Partial<ActionRecord>): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId: 'v1', actorPosition: 'CO',
    heroPosition: 'BTN', villainPositions: [], action: 'raise', amountBB: 2.5,
    potBB: 1.5, isIP: false, timestamp: 0, ...over,
  }
}

const actions: ActionRecord[] = [
  rec({ playerId: 'v1', actorPosition: 'CO', action: 'raise', amountBB: 2.5 }),
  rec({ playerId: 'hero', actorPosition: 'BTN', action: 'call', amountBB: 2.5 }),
  rec({ street: 'flop', playerId: 'hero', actorPosition: 'BTN', action: 'check', amountBB: 0 }),
]

describe('HandReplay', () => {
  it('shows actions with actor positions and labels the hero', () => {
    render(<HandReplay actions={actions} />)
    expect(screen.getByText('CO')).toBeInTheDocument()
    expect(screen.getAllByText('あなた').length).toBeGreaterThan(0)
    expect(screen.getByText('レイズ 2.5BB')).toBeInTheDocument()
  })

  it('switches streets via tabs', () => {
    render(<HandReplay actions={actions} />)
    fireEvent.click(screen.getByText('フロップ'))
    expect(screen.getByText('チェック')).toBeInTheDocument()
  })

  it('steps backward through actions', () => {
    render(<HandReplay actions={actions} />)
    // preflop は2アクション。1つ戻すと「コール 2.5BB」が消える
    fireEvent.click(screen.getByText(/戻る/))
    expect(screen.queryByText('コール 2.5BB')).toBeNull()
  })
})
