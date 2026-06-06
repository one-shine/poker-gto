import { describe, it, expect } from 'vitest'
import { getPosition, isHeroIP, getPreflopActionOrder, getPostflopActionOrder } from './PositionManager'
import type { Player } from '../../types/game'

const seats = (ids: number[]): number[] => ids

describe('getPosition (button-relative)', () => {
  it('maps seat offsets to positions for any button seat', () => {
    expect(getPosition(0, 0)).toBe('BTN')
    expect(getPosition(1, 0)).toBe('SB')
    expect(getPosition(2, 0)).toBe('BB')
    // 同じ相対関係は button が回っても保たれる: button=3 のとき seat3=BTN, seat4=SB
    expect(getPosition(3, 3)).toBe('BTN')
    expect(getPosition(4, 3)).toBe('SB')
    expect(getPosition(2, 3)).toBe('CO') // offset (2-3+6)%6 = 5 = CO
  })
})

// 設計ルール3: IP = ポストフロップで最後に行動できる(= button に最も近い後ろ)。
// シート判定が button 回転に対して正しいことを網羅的に確認する。
describe('isHeroIP (rule 3 — seat-based, button-relative)', () => {
  it('BTN is always IP heads-up regardless of button seat', () => {
    for (let btn = 0; btn < 6; btn++) {
      const btnSeat = btn
      const sbSeat = (btn + 1) % 6
      expect(isHeroIP(btnSeat, btn, seats([btnSeat, sbSeat]))).toBe(true)  // BTN = IP
      expect(isHeroIP(sbSeat, btn, seats([btnSeat, sbSeat]))).toBe(false) // SB = OOP
    }
  })

  it('among 3 actives, the one closest to the button (postflop-last) is IP', () => {
    // button=2 → BTN=seat2, SB=seat3, BB=seat4. actives {3,4,2}. seat2(BTN) = IP.
    const btn = 2
    expect(isHeroIP(2, btn, seats([3, 4, 2]))).toBe(true)
    expect(isHeroIP(3, btn, seats([3, 4, 2]))).toBe(false)
    expect(isHeroIP(4, btn, seats([3, 4, 2]))).toBe(false)
  })

  it('when BTN folded, the next-closest active becomes IP', () => {
    // button=0 → BTN=0,SB=1,BB=2,UTG=3,MP=4,CO=5. BTN(0) folded → actives {1,2,5}. CO(5) = IP.
    const btn = 0
    expect(isHeroIP(5, btn, seats([1, 2, 5]))).toBe(true)  // CO acts last
    expect(isHeroIP(1, btn, seats([1, 2, 5]))).toBe(false) // SB
    expect(isHeroIP(2, btn, seats([1, 2, 5]))).toBe(false) // BB
  })
})

function p(seatIndex: number): Player {
  return {
    id: `s${seatIndex}`, position: 'BTN', seatIndex, stackBB: 100, holeCards: null,
    isHero: false, agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB: 0,
  }
}

describe('action order (button-relative)', () => {
  it('preflop order starts at UTG (offset 3) and ends at BB', () => {
    const order = getPreflopActionOrder([0, 1, 2, 3, 4, 5].map(p), 0).map(x => x.seatIndex)
    expect(order).toEqual([3, 4, 5, 0, 1, 2]) // UTG,MP,CO,BTN,SB,BB
  })
  it('postflop order starts at SB and ends at BTN', () => {
    const order = getPostflopActionOrder([0, 1, 2, 3, 4, 5].map(p), 0).map(x => x.seatIndex)
    expect(order).toEqual([1, 2, 3, 4, 5, 0]) // SB,BB,UTG,MP,CO,BTN
  })
})
