import { describe, it, expect } from 'vitest'
import type { GameState, Player, ActionRecord, Position } from '../../types/game'
import { resolveOpponentRanges } from './opponentRange'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

function player(id: string, position: Position, seatIndex: number, over: Partial<Player> = {}): Player {
  return {
    id, position, seatIndex, stackBB: 100, holeCards: null, isHero: id === 'hero',
    agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB: 0, ...over,
  }
}
const folded = (p: Player): Player => ({ ...p, isFolded: true })

function rec(playerId: string, action: ActionRecord['action']): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId, heroPosition: 'BTN', villainPositions: [],
    action, amountBB: action === 'raise' ? 2.5 : action === 'call' ? 2.5 : 0,
    potBB: 1.5, isIP: true, timestamp: 0,
  }
}

function state(over: Partial<GameState> = {}): GameState {
  return {
    handId: 'h1', street: 'preflop', players: [], board: [],
    pot: { mainPotBB: 1.5, sidePots: [] }, actionHistory: [],
    currentActorId: null, buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false, ...over,
  }
}

// シナリオの指定アクション頻度を満たすカテゴリ集合 (期待値構築の補助)。
function hands(id: string, pick: (raise: number, call: number) => boolean): string[] {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
  return Object.entries(sc.cells).filter(([, c]) => pick(c.raise, c.call)).map(([h]) => h)
}

describe('resolveOpponentRanges (action-sequence-aware)', () => {
  it('villain as SRP opener → that position open (raise) range', () => {
    // hero=BB defends, villain=BTN opened (single raise). HU.
    const s = state({
      players: [
        player('hero', 'BB', 2), player('btn', 'BTN', 0),
        folded(player('sb', 'SB', 1)), folded(player('utg', 'UTG', 3)),
        folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('btn', 'raise')],
    })
    const ranges = resolveOpponentRanges(s, 'hero')
    expect(ranges).not.toBeNull()
    expect(ranges![0].sort()).toEqual(hands('btn-open', r => r > 0).sort())
  })

  it('villain as BB defender → bb-vs-{opener} continue (raise+call) range', () => {
    // hero=BTN opened, villain=BB defends. HU.
    const s = state({
      players: [
        player('hero', 'BTN', 0), player('bb', 'BB', 2),
        folded(player('sb', 'SB', 1)), folded(player('utg', 'UTG', 3)),
        folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('hero', 'raise')],
    })
    const ranges = resolveOpponentRanges(s, 'hero')
    expect(ranges).not.toBeNull()
    expect(ranges![0].sort()).toEqual(hands('bb-vs-btn', (r, c) => r > 0 || c > 0).sort())
  })

  it('villain cold-called as BTN vs CO open → btn-vs-co call range', () => {
    // hero=BB (overcall after BTN cold-calls is excluded by HU; here BB still in vs CO+BTN... so make HU)
    // Set hero=CO opener, villain=BTN cold-caller, everyone else folded. HU.
    const s = state({
      players: [
        player('hero', 'CO', 5), player('btn', 'BTN', 0),
        folded(player('sb', 'SB', 1)), folded(player('bb', 'BB', 2)),
        folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)),
      ],
      actionHistory: [rec('hero', 'raise'), rec('btn', 'call')],
    })
    const ranges = resolveOpponentRanges(s, 'hero')
    expect(ranges).not.toBeNull()
    expect(ranges![0].sort()).toEqual(hands('btn-vs-co', (_r, c) => c > 0).sort())
  })

  it('villain 3bet as SB vs BTN → sb-vs-btn raise (3bet) range, TIGHTER than a flat open', () => {
    // hero=BTN opens, villain=SB 3bets, everyone else folded. HU 3bet pot.
    const s = state({
      players: [
        player('hero', 'BTN', 0), player('sb', 'SB', 1),
        folded(player('bb', 'BB', 2)), folded(player('utg', 'UTG', 3)),
        folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('hero', 'raise'), rec('sb', 'raise')],
    })
    const ranges = resolveOpponentRanges(s, 'hero')
    expect(ranges).not.toBeNull()
    const threeBet = ranges![0]
    // 3bet レンジは {3better}-vs-{opener} の raise (4bet 応答シナリオ *-3bet では断じてない)。
    expect(threeBet.sort()).toEqual(hands('sb-vs-btn', r => r > 0).sort())
    // 強いバリュー (AA/KK) を含む。
    expect(threeBet).toContain('AA')
    expect(threeBet).toContain('KK')
    // 旧来のフラット open レンジより明確にタイト & 別物。
    const flatOpen = hands('btn-open', r => r > 0)
    expect(threeBet.length).toBeLessThan(flatOpen.length)
    expect(threeBet.sort()).not.toEqual(flatOpen.sort())
    // フラット open に含まれる弱いオフスート (ATo) は 3bet レンジから除外される。
    expect(flatOpen).toContain('ATo')
    expect(threeBet).not.toContain('ATo')
  })

  it('villain opened then called a 3bet → opener vs-3bet call range', () => {
    // villain=BTN opens, hero=SB 3bets, villain=BTN calls. HU 3bet pot.
    const s = state({
      players: [
        player('hero', 'SB', 1), player('btn', 'BTN', 0),
        folded(player('bb', 'BB', 2)), folded(player('utg', 'UTG', 3)),
        folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('btn', 'raise'), rec('hero', 'raise'), rec('btn', 'call')],
    })
    const ranges = resolveOpponentRanges(s, 'hero')
    expect(ranges).not.toBeNull()
    expect(ranges![0].sort()).toEqual(hands('btn-vs-sb-3bet', (_r, c) => c > 0).sort())
  })

  it('limped pot (0 preflop raises) → null', () => {
    const s = state({
      players: [
        player('hero', 'BB', 2), player('btn', 'BTN', 0),
        folded(player('sb', 'SB', 1)), folded(player('utg', 'UTG', 3)),
        folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('btn', 'call')],
    })
    expect(resolveOpponentRanges(s, 'hero')).toBeNull()
  })

  it('multiway (2 active villains) → null', () => {
    const s = state({
      players: [
        player('hero', 'BTN', 0), player('co', 'CO', 5), player('bb', 'BB', 2),
        folded(player('sb', 'SB', 1)), folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)),
      ],
      actionHistory: [rec('co', 'raise'), rec('hero', 'call')],
    })
    expect(resolveOpponentRanges(s, 'hero')).toBeNull()
  })

  it('4bet+ pot (3 preflop raises) → null', () => {
    const s = state({
      players: [
        player('hero', 'BTN', 0), player('sb', 'SB', 1),
        folded(player('bb', 'BB', 2)), folded(player('utg', 'UTG', 3)),
        folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('hero', 'raise'), rec('sb', 'raise'), rec('hero', 'raise')],
    })
    expect(resolveOpponentRanges(s, 'hero')).toBeNull()
  })

  it('villain 3bet in an uncovered THREE_BET pairing → null (no fabricated range)', () => {
    // hero=UTG opens, villain=MP 3bets. MP-vs-UTG is NOT a covered 3bet pot → null.
    const s = state({
      players: [
        player('hero', 'UTG', 3), player('mp', 'MP', 4),
        folded(player('co', 'CO', 5)), folded(player('btn', 'BTN', 0)),
        folded(player('sb', 'SB', 1)), folded(player('bb', 'BB', 2)),
      ],
      actionHistory: [rec('hero', 'raise'), rec('mp', 'raise')],
    })
    expect(resolveOpponentRanges(s, 'hero')).toBeNull()
  })

  it('unknown / unsupported defender scenario id → null', () => {
    // villain=MP cold-calls a UTG open. MP-vs-UTG defender scenario is not collected → null.
    const s = state({
      players: [
        player('hero', 'UTG', 3), player('mp', 'MP', 4),
        folded(player('co', 'CO', 5)), folded(player('btn', 'BTN', 0)),
        folded(player('sb', 'SB', 1)), folded(player('bb', 'BB', 2)),
      ],
      actionHistory: [rec('hero', 'raise'), rec('mp', 'call')],
    })
    expect(resolveOpponentRanges(s, 'hero')).toBeNull()
  })

  it('no hero in state → null', () => {
    const s = state({ players: [player('btn', 'BTN', 0)], actionHistory: [rec('btn', 'raise')] })
    expect(resolveOpponentRanges(s, 'hero')).toBeNull()
  })
})
