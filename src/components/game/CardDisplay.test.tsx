import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardDisplay } from './CardDisplay'
import type { Card } from '../../types/game'

describe('CardDisplay', () => {
  it('renders rank and suit symbol with an accessible label', () => {
    const card: Card = { rank: 'A', suit: 'spades' }
    render(<CardDisplay card={card} />)
    const el = screen.getByRole('img', { name: 'A スペード' })
    expect(el.textContent).toContain('A')
    expect(el.textContent).toContain('♠')
  })

  it('renders T as 10', () => {
    render(<CardDisplay card={{ rank: 'T', suit: 'hearts' }} />)
    expect(screen.getByRole('img', { name: '10 ハート' }).textContent).toContain('10')
  })

  it('shows a face-down card when faceDown', () => {
    render(<CardDisplay card={{ rank: 'A', suit: 'spades' }} faceDown />)
    expect(screen.getByRole('img', { name: '裏向きのカード' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /スペード/ })).toBeNull()
  })

  it('renders a face-down card when no card is provided', () => {
    render(<CardDisplay />)
    expect(screen.getByRole('img', { name: '裏向きのカード' })).toBeInTheDocument()
  })
})
