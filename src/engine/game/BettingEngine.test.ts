import { describe, it, expect } from 'vitest'
import type { GameState, ActionRecord, Player } from '../../types/game'
import { getMinRaiseToAmount } from './BettingEngine'

// 最小レイズ額の回帰テスト。旧バグ: ActionRecord.amountBB(to-amount)をレイズ「幅」扱いして
// 3bet 以降の最小レイズを過大に算出していた(例: open2.5 への最小3betが 5.0 と誤算)。
function player(currentBetBB: number): Player {
  return {
    id: 'p', position: 'BTN', seatIndex: 0, stackBB: 100, holeCards: null,
    isHero: false, agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB,
  }
}
function raiseRec(amountBB: number, street: GameState['street']): ActionRecord {
  return {
    handId: 'h', street, playerId: 'x', heroPosition: 'BTN', villainPositions: [],
    action: 'raise', amountBB, potBB: 0, isIP: false, timestamp: 0,
  }
}
function state(street: GameState['street'], maxBet: number, raiseTos: number[]): GameState {
  return {
    handId: 'h', street, players: [player(maxBet)], board: [],
    pot: { mainPotBB: 0, sidePots: [] }, actionHistory: raiseTos.map(r => raiseRec(r, street)),
    currentActorId: null, buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false,
  }
}

describe('getMinRaiseToAmount', () => {
  it('preflop unraised → min open = 2BB (BB + BB)', () => {
    expect(getMinRaiseToAmount(state('preflop', 1, []))).toBe(2)
  })
  it('preflop facing an open to 2.5 → min 3bet = 4.0 (raise size 1.5, not 2.5)', () => {
    expect(getMinRaiseToAmount(state('preflop', 2.5, [2.5]))).toBe(4)
  })
  it('preflop facing a 3bet to 7 (after open 2.5) → min 4bet = 11.5 (raise size 4.5)', () => {
    expect(getMinRaiseToAmount(state('preflop', 7, [2.5, 7]))).toBe(11.5)
  })
  it('postflop facing a bet to 3 (over 0) → min raise = 6 (double the bet)', () => {
    expect(getMinRaiseToAmount(state('flop', 3, [3]))).toBe(6)
  })
  it('postflop facing a raise to 9 (after bet 3) → min reraise = 15 (raise size 6)', () => {
    expect(getMinRaiseToAmount(state('turn', 9, [3, 9]))).toBe(15)
  })
})
