import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardSelector } from './CardSelector'
import type { Card } from '../../types/game'

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit })

describe('CardSelector', () => {
  it('picks a tapped card into the active (hero) field', () => {
    const onHero = vi.fn()
    render(<CardSelector boardNeed={0} heroCards={[]} boardCards={[]} onHero={onHero} onBoard={() => {}} />)
    fireEvent.click(screen.getByLabelText('Aスペードを選択'))
    expect(onHero).toHaveBeenCalledWith([c('A', 'spades')])
  })

  it('disables cards already in use (dedup across hero + board)', () => {
    render(<CardSelector boardNeed={3} heroCards={[c('A', 'spades')]} boardCards={[c('K', 'hearts')]} onHero={() => {}} onBoard={() => {}} />)
    expect(screen.getByLabelText('Aスペードを選択')).toBeDisabled()
    expect(screen.getByLabelText('Kハートを選択')).toBeDisabled()
    expect(screen.getByLabelText('Qスペードを選択')).not.toBeDisabled()
  })

  it('removes a card by tapping its slot (frees it again)', () => {
    const onHero = vi.fn()
    render(<CardSelector boardNeed={0} heroCards={[c('A', 'spades'), c('K', 'spades')]} boardCards={[]} onHero={onHero} onBoard={() => {}} />)
    fireEvent.click(screen.getByLabelText('Aスペードを外す'))
    expect(onHero).toHaveBeenCalledWith([c('K', 'spades')])
  })

  it('auto-advances to the board once hero is full', () => {
    const onBoard = vi.fn()
    render(<CardSelector boardNeed={3} heroCards={[c('A', 'spades'), c('K', 'spades')]} boardCards={[]} onHero={() => {}} onBoard={onBoard} />)
    fireEvent.click(screen.getByLabelText('Qハートを選択'))
    expect(onBoard).toHaveBeenCalledWith([c('Q', 'hearts')])
  })

  it('hides the board field when boardNeed is 0 (preflop)', () => {
    render(<CardSelector boardNeed={0} heroCards={[]} boardCards={[]} onHero={() => {}} onBoard={() => {}} />)
    expect(screen.queryByText(/盤面/)).toBeNull()
  })
})
