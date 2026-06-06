import { describe, it, expect } from 'vitest'
import type { GameState, Player, Card } from '../../types/game'
import { parseCards } from '../cards/Card'
import { determineWinners } from './Showdown'

function player(id: string, hole: string | null, over: Partial<Player> = {}): Player {
  const cards = hole ? parseCards(hole) : null
  return {
    id, position: 'BTN', seatIndex: 0, stackBB: 100,
    holeCards: cards ? [cards[0], cards[1]] as [Card, Card] : null,
    isHero: false, agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB: 0, ...over,
  }
}
function state(players: Player[], board: string, pot: GameState['pot']): GameState {
  return {
    handId: 'h', street: 'showdown', players, board: parseCards(board),
    pot, actionHistory: [], currentActorId: null, buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: true,
  }
}

describe('determineWinners', () => {
  it('single unfolded player wins the whole pot', () => {
    const s = state(
      [player('a', 'As Ah'), player('b', null, { isFolded: true })],
      '2c 7d 9s Tc 3h', { mainPotBB: 10, sidePots: [] },
    )
    const r = determineWinners(s)
    expect(r).toHaveLength(1)
    expect(r[0].winnerId).toBe('a')
    expect(r[0].amountWonBB).toBe(10)
  })

  it('higher pair takes the main pot', () => {
    const s = state(
      [player('a', 'As Ah'), player('b', 'Ks Kh')],
      '2c 7d 9s Tc 3h', { mainPotBB: 10, sidePots: [] },
    )
    const r = determineWinners(s)
    expect(r).toHaveLength(1)
    expect(r[0].winnerId).toBe('a')
    expect(r[0].amountWonBB).toBe(10)
  })

  it('ties split the main pot evenly (board plays equally)', () => {
    const s = state(
      [player('a', 'As Ad'), player('b', 'Ac Ah')],
      '2c 7d 9s Tc 3h', { mainPotBB: 10, sidePots: [] },
    )
    const r = determineWinners(s)
    expect(r).toHaveLength(2)
    expect(r.every(x => x.amountWonBB === 5)).toBe(true)
    expect(new Set(r.map(x => x.winnerId))).toEqual(new Set(['a', 'b']))
  })

  it('side pot: short all-in wins only the main pot; bigger stack takes the side pot', () => {
    const s = state(
      [player('a', 'As Ah'), player('b', 'Ks Kh'), player('c', 'Qs Jh')],
      '2c 7d 9s Tc 3d',
      { mainPotBB: 9, sidePots: [{ amountBB: 6, eligiblePlayerIds: ['b', 'c'] }] },
    )
    const r = determineWinners(s)
    const a = r.find(x => x.winnerId === 'a')!
    const b = r.find(x => x.winnerId === 'b')!
    expect(a.amountWonBB).toBe(9) // best hand (AA) → main pot
    expect(b.amountWonBB).toBe(6) // best among side-eligible (KK > QJ) → side pot
    expect(r.find(x => x.winnerId === 'c')).toBeUndefined()
  })
})
