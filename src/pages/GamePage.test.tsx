import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GamePage } from './GamePage'

describe('GamePage', () => {
  it('shows the New Hand entry point and the assumptions footer before a hand starts', () => {
    render(<GamePage />)
    expect(screen.getByRole('button', { name: /New Hand/ })).toBeInTheDocument()
    // GameFooter は常時表示 (前提条件)
    expect(screen.getByText(/ノーレーク/)).toBeInTheDocument()
    expect(screen.getByText(/ICM非考慮/)).toBeInTheDocument()
  })
})
