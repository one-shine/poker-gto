import { describe, it, expect } from 'vitest'
import type { GameState, Player, ActionRecord, Card, Rank, Suit } from '../../types/game'
import { getSolution } from './getSolution'
import { resolveSpotKey } from './spotKey'
import { fromRangeScenario } from './fromRangeScenario'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

function player(id: string, position: Player['position'], seatIndex: number): Player {
  return {
    id, position, seatIndex, stackBB: 100, holeCards: null, isHero: id === 'hero',
    agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB: 0,
  }
}

const c = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })

// 6-max btn=seat0: BTN,SB,BB,UTG,MP,CO
function baseState(over: Partial<GameState> = {}): GameState {
  return {
    handId: 'h1', street: 'preflop',
    players: [
      player('hero', 'BTN', 0), player('p1', 'SB', 1), player('p2', 'BB', 2),
      player('p3', 'UTG', 3), player('p4', 'MP', 4), player('p5', 'CO', 5),
    ],
    board: [], pot: { mainPotBB: 1.5, sidePots: [] }, actionHistory: [],
    currentActorId: 'hero', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false, ...over,
  }
}

function rec(playerId: string, action: ActionRecord['action']): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId, heroPosition: 'BTN', villainPositions: [],
    action, amountBB: action === 'raise' ? 2.5 : 0, potBB: 1.5, isIP: true, timestamp: 0,
  }
}

describe('fromRangeScenario', () => {
  it('converts a hand-built range into an approximate NodeSolution', () => {
    const btn = PREFLOP_SCENARIOS.find(s => s.id === 'btn-open')!
    const node = fromRangeScenario(btn)
    expect(node.source).toBe('approximate')
    expect(node.street).toBe('preflop')
    // AA は 100% raise
    const aa = node.strategy['AA']
    expect(aa).toEqual([{ action: 'raise', sizeBB: 2.5, frequency: 1, ev: 0 }])
  })
})

describe('resolveSpotKey', () => {
  it('folded-around BTN → btn-open', () => {
    const s = baseState({
      actionHistory: ['p3', 'p4', 'p5'].map(id => rec(id, 'fold')),
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'btn-open', street: 'preflop' })
  })

  it('limper before hero → null (RFI前提が崩れる)', () => {
    const s = baseState({ actionHistory: [rec('p3', 'fold'), rec('p4', 'call')] })
    expect(resolveSpotKey(s, 'hero')).toBeNull()
  })

  it('BB facing single BTN raise (HU) → bb-vs-btn', () => {
    const folded = (p: Player): Player => ({ ...p, isFolded: true })
    const s = baseState({
      players: [
        player('hero', 'BB', 2),
        player('btn', 'BTN', 0),
        folded(player('sb', 'SB', 1)),
        folded(player('utg', 'UTG', 3)),
        folded(player('mp', 'MP', 4)),
        folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('btn', 'raise')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'bb-vs-btn', street: 'preflop' })
  })

  it('multiway facing raise → null', () => {
    // p3 raises, p4/p5/SB/BB all still active → 3+ active opponents
    const s = baseState({ actionHistory: [rec('p3', 'raise')] })
    expect(resolveSpotKey(s, 'hero')).toBeNull()
  })
})

describe('getSolution', () => {
  it('returns approximate preflop solution for a known spot', async () => {
    const node = await getSolution({ baseSpotId: 'btn-open', street: 'preflop' })
    expect(node?.spotId).toBe('btn-open')
    expect(node?.source).toBe('approximate')
  })

  it('supplies utg-open (added in Phase 4) as an approximate solution', async () => {
    const node = await getSolution({ baseSpotId: 'utg-open', street: 'preflop' })
    expect(node?.source).toBe('approximate')
  })

  it('returns null for an unknown spot id', async () => {
    expect(await getSolution({ baseSpotId: 'co-vs-utg', street: 'preflop' })).toBeNull()
  })

  it('returns null when board is missing/insufficient', async () => {
    expect(await getSolution({ baseSpotId: 'bb-vs-btn', street: 'flop', board: [] })).toBeNull()
  })

  it('solves a TURN spot (4-card board) via self CFR (equity-approximated) → solver_live', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')]
    const node = await getSolution(
      { baseSpotId: 'bb-vs-co', street: 'turn', board, heroCards, potBB: 8, effStackBB: 80 },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    expect(node?.street).toBe('turn')
    expect(node!.strategy['AcAh'].length).toBeGreaterThan(0)
    expect(node!.strategy['AcAh'].every(a => Number.isFinite(a.ev))).toBe(true)
  })

  it('solves a river spot (bb-vs-btn) via self CFR → solver_live with hero strategy + EV', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')]
    const node = await getSolution(
      { baseSpotId: 'bb-vs-btn', street: 'river', board, heroCards, potBB: 12, effStackBB: 90 },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    const key = 'AcAh' // comboKey はソート済み (Ac < Ah)
    expect(node?.strategy[key]).toBeDefined()
    expect(node!.strategy[key].length).toBeGreaterThan(0)
    expect(node!.strategy[key].every(a => Number.isFinite(a.ev))).toBe(true)
  })

  it('solves the river facing-bet node (call/fold) for hero OOP', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')] // トップセット → 被ベットでほぼコール
    const node = await getSolution(
      { baseSpotId: 'bb-vs-btn', street: 'river', board, heroCards, potBB: 12, effStackBB: 90, riverBetBB: 8 },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    const sols = node!.strategy['AcAh']
    expect(sols.map(s => s.action).sort()).toEqual(['call', 'fold'])
    const call = sols.find(s => s.action === 'call')!
    expect(call.frequency).toBeGreaterThan(0.8) // ナッツはほぼコール
  })

  it('solves a river spot for hero=IP (btn-open base, villain checked) → check/bet strategy', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')] // hero=BTN(opener=IP), トップセット
    const node = await getSolution(
      // villain(BB=OOP) がチェック → hero(IP) が check/bet を選ぶノード (riverBetBB 未設定)
      { baseSpotId: 'btn-open', street: 'river', board, heroCards, potBB: 12, effStackBB: 90, heroIsOOP: false },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    const sols = node!.strategy['AcAh']
    expect(sols.map(s => s.action).sort()).toEqual(['check', 'raise']) // IP: チェック or ベット(=raise)
    expect(sols.every(s => Number.isFinite(s.ev))).toBe(true)
  })

  it('skips river live solve when allowLiveSolve is false and not cached (play/trainer)', async () => {
    // テスト1とは別スポット (未キャッシュ) → live solve 不許可なら null
    const board: Card[] = [c('Q', 'spades'), c('J', 'diamonds'), c('8', 'clubs'), c('4', 'hearts'), c('5', 'spades')]
    const heroCards: [Card, Card] = [c('K', 'hearts'), c('K', 'clubs')]
    const node = await getSolution(
      { baseSpotId: 'bb-vs-co', street: 'river', board, heroCards, potBB: 12, effStackBB: 90 },
      { allowLiveSolve: false },
    )
    expect(node).toBeNull()
  })
})

describe('push/fold precomputed solutions (R4)', () => {
  it('serves the self-generated push/fold Nash solution for HU 10BB SB as solver_precomputed', async () => {
    const node = await getSolution({ baseSpotId: 'hu-pf-10bb-sb', street: 'preflop' })
    expect(node).not.toBeNull()
    expect(node!.source).toBe('solver_precomputed')
    expect(node!.meta.license).toBe('self-generated')
    // AA は 100% push (オールイン raise)
    const aa = node!.strategy['AA']
    const push = aa.find(a => a.action === 'raise')
    expect(push).toBeTruthy()
    expect(push!.frequency).toBeGreaterThan(0.99)
    // 72o は push しない
    const trash = node!.strategy['72o']
    expect(trash.find(a => a.action === 'raise')?.frequency ?? 0).toBeLessThan(0.5)
  })

  it('serves the BB-vs-push calling solution', async () => {
    const node = await getSolution({ baseSpotId: 'hu-pf-10bb-bb', street: 'preflop' })
    expect(node!.source).toBe('solver_precomputed')
    const aa = node!.strategy['AA']
    expect(aa.find(a => a.action === 'call')?.frequency ?? 0).toBeGreaterThan(0.99)
  })
})
