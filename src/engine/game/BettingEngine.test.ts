import { describe, it, expect } from 'vitest'
import type { GameState, ActionRecord, Player, Card, Rank, Suit } from '../../types/game'
import { getMinRaiseToAmount, applyAction, collectBetsIntoPot, getTotalPot } from './BettingEngine'
import { determineWinners } from './Showdown'

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

// 回帰: raise 到達額が持ち分 (currentBetBB + stackBB) を超える指定は all-in にキャップする。
// 旧バグ: currentBetBB=target をそのまま設定し持ち分超の「幽霊チップ」を生成
//   → 相手がコールできない超過分が単独 eligible のサイドポットになり、ショーダウンで2人勝者
//      (例: 弱い手が high_card で +51BB を「勝つ」) + チップ保存則違反。
describe('applyAction raise cap (uncalled-overbet 幽霊チップ防止)', () => {
  const C = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })
  function P(id: string, seat: number, hole: [Card, Card]): Player {
    return {
      id, position: seat === 0 ? 'BTN' : 'SB', seatIndex: seat, stackBB: 100, holeCards: hole,
      isHero: id === 'hero', agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB: 0,
    }
  }
  function huRiver(): GameState {
    return {
      handId: 'h', street: 'river',
      players: [
        P('hero', 0, [C('A', 'spades'), C('7', 'hearts')]), // two pair (AA77)
        P('sb', 1, [C('Q', 'diamonds'), C('2', 'clubs')]),  // high card
      ],
      board: [C('A', 'clubs'), C('7', 'diamonds'), C('5', 'spades'), C('3', 'hearts'), C('9', 'clubs')],
      pot: { mainPotBB: 0, sidePots: [] }, actionHistory: [],
      currentActorId: 'sb', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
      handNumber: 1, isHandComplete: false,
    }
  }

  it('raise to more than the actor can afford → capped at all-in (stack 0, no phantom chips)', () => {
    const s = applyAction(huRiver(), 'sb', 'raise', 151) // 持ち分100超を指定
    const sb = s.players.find(p => p.id === 'sb')!
    expect(sb.currentBetBB).toBe(100) // 151 ではなく持ち分でキャップ
    expect(sb.stackBB).toBe(0)
    expect(sb.isAllIn).toBe(true)
  })

  it('over-raise then call → single winner, no spurious side pot, chips conserved', () => {
    let s = huRiver()
    s = applyAction(s, 'sb', 'raise', 151)
    s = applyAction(s, 'hero', 'call')
    s = collectBetsIntoPot(s)
    expect(s.pot.sidePots).toEqual([]) // 単独 eligible の幽霊サイドポットが出ない
    expect(getTotalPot(s)).toBe(200)
    const winners = determineWinners(s)
    expect(winners).toHaveLength(1) // 2人勝者にならない
    expect(winners[0].winnerId).toBe('hero')
    expect(winners[0].handRank).toBe('two_pair')
    // チップ保存則: 拠出 = 配当
    const committed = 200 - s.players[0].stackBB - s.players[1].stackBB
    expect(winners.reduce((a, w) => a + w.amountWonBB, 0)).toBe(committed)
  })
})
