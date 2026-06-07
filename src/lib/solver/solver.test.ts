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

  // R2: 非BB防御の単独オープン応答 (clean fold-around)。背後の未行動ブラインドは許容。
  const folded = (p: Player): Player => ({ ...p, isFolded: true })

  it('BTN facing single CO open (UTG/MP folded, blinds behind) → btn-vs-co', () => {
    const s = baseState({
      players: [
        player('hero', 'BTN', 0), player('sb', 'SB', 1), player('bb', 'BB', 2),
        folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)), player('co', 'CO', 5),
      ],
      actionHistory: [rec('utg', 'fold'), rec('mp', 'fold'), rec('co', 'raise')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'btn-vs-co', street: 'preflop' })
  })

  it('SB facing single CO open (3bet-or-fold spot) → sb-vs-co', () => {
    const s = baseState({
      players: [
        player('hero', 'SB', 1), folded(player('btn', 'BTN', 0)), player('bb', 'BB', 2),
        folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)), player('co', 'CO', 5),
      ],
      actionHistory: [rec('utg', 'fold'), rec('mp', 'fold'), rec('co', 'raise'), rec('btn', 'fold')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'sb-vs-co', street: 'preflop' })
  })

  it('CO facing single UTG open → co-vs-utg', () => {
    const s = baseState({
      players: [
        player('hero', 'CO', 5), player('btn', 'BTN', 0), player('sb', 'SB', 1),
        player('bb', 'BB', 2), player('utg', 'UTG', 3), folded(player('mp', 'MP', 4)),
      ],
      actionHistory: [rec('utg', 'raise'), rec('mp', 'fold')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'co-vs-utg', street: 'preflop' })
  })

  it('cold-caller before hero → null (not a clean HU response)', () => {
    // CO raises, BTN cold-calls, then hero=SB acts → 実質マルチウェイ
    const s = baseState({
      players: [
        player('hero', 'SB', 1), player('btn', 'BTN', 0), player('bb', 'BB', 2),
        folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)), player('co', 'CO', 5),
      ],
      actionHistory: [rec('utg', 'fold'), rec('mp', 'fold'), rec('co', 'raise'), rec('btn', 'call')],
    })
    expect(resolveSpotKey(s, 'hero')).toBeNull()
  })

  it('multiwayReference opt: cold-call(マルチウェイ)でも収録 HU レンジを参考値として解決 (ルール4)', () => {
    // CO raises, BTN cold-calls, hero=SB → 実質マルチウェイ
    const s = baseState({
      players: [
        player('hero', 'SB', 1), player('btn', 'BTN', 0), player('bb', 'BB', 2),
        folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)), player('co', 'CO', 5),
      ],
      actionHistory: [rec('utg', 'fold'), rec('mp', 'fold'), rec('co', 'raise'), rec('btn', 'call')],
    })
    // 既定 (精度・AI 経路): 従来どおり null = 除外を維持 (4a)。
    expect(resolveSpotKey(s, 'hero')).toBeNull()
    // 参考値モード (表示経路): sb-vs-co を multiway 付きで返す (4b)。
    expect(resolveSpotKey(s, 'hero', { multiwayReference: true })).toEqual({
      baseSpotId: 'sb-vs-co', street: 'preflop', multiway: true,
    })
  })

  it('multiwayReference opt: HU スポットは multiway を付けない (既存形のまま)', () => {
    const s = baseState({ actionHistory: ['p3', 'p4', 'p5'].map(id => rec(id, 'fold')) })
    expect(resolveSpotKey(s, 'hero', { multiwayReference: true })).toEqual({ baseSpotId: 'btn-open', street: 'preflop' })
  })

  it('getSolution tags a multiway spot as multiwayReference', async () => {
    const node = await getSolution({ baseSpotId: 'sb-vs-co', street: 'preflop', multiway: true })
    expect(node?.multiwayReference).toBe(true)
    const hu = await getSolution({ baseSpotId: 'sb-vs-co', street: 'preflop' })
    expect(hu?.multiwayReference).toBeUndefined()
  })

  // 2026-06-07: 単独オープン HU 防御の未収録 4 対を追加配線 (これまで「対象外」だった局面で答えが出る)。
  it('MP facing single UTG open → mp-vs-utg', () => {
    const s = baseState({
      players: [
        player('hero', 'MP', 4), player('utg', 'UTG', 3), player('co', 'CO', 5),
        player('btn', 'BTN', 0), player('sb', 'SB', 1), player('bb', 'BB', 2),
      ],
      actionHistory: [rec('utg', 'raise')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'mp-vs-utg', street: 'preflop' })
  })

  it('CO facing single MP open (UTG folded) → co-vs-mp', () => {
    const s = baseState({
      players: [
        player('hero', 'CO', 5), folded(player('utg', 'UTG', 3)), player('mp', 'MP', 4),
        player('btn', 'BTN', 0), player('sb', 'SB', 1), player('bb', 'BB', 2),
      ],
      actionHistory: [rec('utg', 'fold'), rec('mp', 'raise')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'co-vs-mp', street: 'preflop' })
  })

  it('SB facing single UTG open (3bet-or-fold) → sb-vs-utg', () => {
    const s = baseState({
      players: [
        player('hero', 'SB', 1), folded(player('btn', 'BTN', 0)), player('bb', 'BB', 2),
        player('utg', 'UTG', 3), folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('utg', 'raise'), rec('mp', 'fold'), rec('co', 'fold'), rec('btn', 'fold')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'sb-vs-utg', street: 'preflop' })
  })

  it('SB facing single MP open (3bet-or-fold) → sb-vs-mp', () => {
    const s = baseState({
      players: [
        player('hero', 'SB', 1), folded(player('btn', 'BTN', 0)), player('bb', 'BB', 2),
        folded(player('utg', 'UTG', 3)), player('mp', 'MP', 4), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [rec('utg', 'fold'), rec('mp', 'raise'), rec('co', 'fold'), rec('btn', 'fold')],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'sb-vs-mp', street: 'preflop' })
  })

  // R2: opener が 3bet に直面 (HU・4bet/call/fold)。
  it('BTN open faces a BB 3bet (HU) → btn-vs-bb-3bet', () => {
    const s = baseState({
      players: [
        player('hero', 'BTN', 0), folded(player('sb', 'SB', 1)), player('bb', 'BB', 2),
        folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)), folded(player('co', 'CO', 5)),
      ],
      actionHistory: [
        rec('utg', 'fold'), rec('mp', 'fold'), rec('co', 'fold'),
        rec('hero', 'raise'), rec('sb', 'fold'), rec('bb', 'raise'),
      ],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'btn-vs-bb-3bet', street: 'preflop' })
  })

  it('CO open faces a BTN 3bet (IP 3bettor) → co-vs-btn-3bet', () => {
    const s = baseState({
      players: [
        player('hero', 'CO', 5), player('btn', 'BTN', 0), folded(player('sb', 'SB', 1)),
        folded(player('bb', 'BB', 2)), folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)),
      ],
      actionHistory: [
        rec('utg', 'fold'), rec('mp', 'fold'), rec('hero', 'raise'),
        rec('btn', 'raise'), rec('sb', 'fold'), rec('bb', 'fold'),
      ],
    })
    expect(resolveSpotKey(s, 'hero')).toEqual({ baseSpotId: 'co-vs-btn-3bet', street: 'preflop' })
  })

  it('squeeze (cold-caller then 3bet) → null (not a clean HU 3bet pot)', () => {
    // hero=CO opens, BTN cold-calls, BB squeezes (3bet) → コールド参加で除外
    const s = baseState({
      players: [
        player('hero', 'CO', 5), player('btn', 'BTN', 0), folded(player('sb', 'SB', 1)),
        player('bb', 'BB', 2), folded(player('utg', 'UTG', 3)), folded(player('mp', 'MP', 4)),
      ],
      actionHistory: [
        rec('utg', 'fold'), rec('mp', 'fold'), rec('hero', 'raise'),
        rec('btn', 'call'), rec('sb', 'fold'), rec('bb', 'raise'),
      ],
    })
    expect(resolveSpotKey(s, 'hero')).toBeNull()
  })
})

describe('resolveSpotKey postflop (R16 ライブ配線)', () => {
  const hc: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')]
  const FLOP: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs')]
  const fold = (p: Player): Player => ({ ...p, isFolded: true })
  // 任意ストリート・任意額のアクション記録
  const act = (playerId: string, action: ActionRecord['action'], street: ActionRecord['street'], amountBB = 0): ActionRecord => ({
    handId: 'h1', street, playerId, heroPosition: 'BTN', villainPositions: [], action, amountBB, potBB: 5.5, isIP: true, timestamp: 0,
  })

  it('SRP BB defender, hero leads flop (villain未ベット) → bb-vs-btn lead node', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 5.5, sidePots: [] },
      players: [
        { ...player('hero', 'BB', 2), holeCards: hc }, { ...player('btn', 'BTN', 0) },
        fold(player('sb', 'SB', 1)), fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)), fold(player('co', 'CO', 5)),
      ],
      actionHistory: [act('btn', 'raise', 'preflop', 2.5), act('hero', 'call', 'preflop', 2.5)],
    })
    const r = resolveSpotKey(s, 'hero')
    expect(r?.baseSpotId).toBe('bb-vs-btn')
    expect(r?.street).toBe('flop')
    expect(r?.heroIsOOP).toBe(true)
    expect(r?.facingRaise).toBe(false)
    expect(r?.riverBetBB).toBeUndefined()
  })

  it('SRP IP opener: hero=BTN opened, BB called, BB checked flop → btn-open (旧来はnullだったバグを修正)', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 5.5, sidePots: [] },
      players: [
        { ...player('hero', 'BTN', 0), holeCards: hc }, fold(player('sb', 'SB', 1)), { ...player('bb', 'BB', 2) },
        fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)), fold(player('co', 'CO', 5)),
      ],
      actionHistory: [act('hero', 'raise', 'preflop', 2.5), act('bb', 'call', 'preflop', 2.5), act('bb', 'check', 'flop')],
    })
    const r = resolveSpotKey(s, 'hero')
    expect(r?.baseSpotId).toBe('btn-open')
    expect(r?.heroIsOOP).toBe(false)
    expect(r?.facingRaise).toBe(false)
  })

  it('SRP IP opener faces BB lead bet → btn-open 被ベット', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 5.5, sidePots: [] },
      players: [
        { ...player('hero', 'BTN', 0), holeCards: hc }, fold(player('sb', 'SB', 1)),
        { ...player('bb', 'BB', 2), currentBetBB: 3.6 },
        fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)), fold(player('co', 'CO', 5)),
      ],
      actionHistory: [act('hero', 'raise', 'preflop', 2.5), act('bb', 'call', 'preflop', 2.5), act('bb', 'raise', 'flop', 3.6)],
    })
    const r = resolveSpotKey(s, 'hero')
    expect(r?.baseSpotId).toBe('btn-open')
    expect(r?.facingRaise).toBe(false)
    expect(r?.riverBetBB).toBeCloseTo(3.6)
  })

  it('被レイズ深いノード: hero=BB led, BTN raised → facingRaise=true (riverBetBB=heroのリードベット)', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 5.5, sidePots: [] },
      players: [
        { ...player('hero', 'BB', 2), holeCards: hc, currentBetBB: 3.6 },
        { ...player('btn', 'BTN', 0), currentBetBB: 10 },
        fold(player('sb', 'SB', 1)), fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)), fold(player('co', 'CO', 5)),
      ],
      actionHistory: [
        act('btn', 'raise', 'preflop', 2.5), act('hero', 'call', 'preflop', 2.5),
        act('hero', 'raise', 'flop', 3.6), act('btn', 'raise', 'flop', 10),
      ],
    })
    const r = resolveSpotKey(s, 'hero')
    expect(r?.baseSpotId).toBe('bb-vs-btn')
    expect(r?.facingRaise).toBe(true)
    expect(r?.riverBetBB).toBeCloseTo(3.6)
  })

  it('3bet ポット: BB が BTN open を 3bet、BTN コール、hero=BB が flop リード → 3bp-bb-vs-btn', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 22.5, sidePots: [] },
      players: [
        { ...player('hero', 'BB', 2), holeCards: hc, stackBB: 89 }, { ...player('btn', 'BTN', 0), stackBB: 89 },
        fold(player('sb', 'SB', 1)), fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)), fold(player('co', 'CO', 5)),
      ],
      actionHistory: [act('btn', 'raise', 'preflop', 2.5), act('hero', 'raise', 'preflop', 11), act('btn', 'call', 'preflop', 11)],
    })
    const r = resolveSpotKey(s, 'hero')
    expect(r?.baseSpotId).toBe('3bp-bb-vs-btn')
    expect(r?.heroIsOOP).toBe(true)
    expect(r?.effStackBB).toBe(89)
  })

  it('3bet ポット caller視点: hero=BTN open→BB 3bet→hero call、flop で BB チェック → 3bp-btn-vs-bb (IP)', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 22.5, sidePots: [] },
      players: [
        { ...player('hero', 'BTN', 0), holeCards: hc, stackBB: 89 }, fold(player('sb', 'SB', 1)),
        { ...player('bb', 'BB', 2), stackBB: 89 },
        fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)), fold(player('co', 'CO', 5)),
      ],
      actionHistory: [
        act('hero', 'raise', 'preflop', 2.5), act('bb', 'raise', 'preflop', 11), act('hero', 'call', 'preflop', 11),
        act('bb', 'check', 'flop'),
      ],
    })
    const r = resolveSpotKey(s, 'hero')
    expect(r?.baseSpotId).toBe('3bp-btn-vs-bb')
    expect(r?.heroIsOOP).toBe(false)
  })

  it('SB 関与の SRP は除外 (盲対盲の IP/OOP 反転) → null', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 6, sidePots: [] },
      players: [
        { ...player('hero', 'SB', 1), holeCards: hc }, { ...player('bb', 'BB', 2) },
        fold(player('btn', 'BTN', 0)), fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)), fold(player('co', 'CO', 5)),
      ],
      actionHistory: [act('hero', 'raise', 'preflop', 3), act('bb', 'call', 'preflop', 3)],
    })
    expect(resolveSpotKey(s, 'hero')).toBeNull()
  })

  it('マルチウェイ (相手2人) → null', () => {
    const s = baseState({
      street: 'flop', board: FLOP, pot: { mainPotBB: 8, sidePots: [] },
      players: [
        { ...player('hero', 'BB', 2), holeCards: hc }, { ...player('btn', 'BTN', 0) }, { ...player('co', 'CO', 5) },
        fold(player('sb', 'SB', 1)), fold(player('utg', 'UTG', 3)), fold(player('mp', 'MP', 4)),
      ],
      actionHistory: [act('co', 'raise', 'preflop', 2.5), act('btn', 'call', 'preflop', 2.5), act('hero', 'call', 'preflop', 2.5)],
    })
    expect(resolveSpotKey(s, 'hero')).toBeNull()
  })
})

describe('getSolution', () => {
  it('returns approximate_with_ev preflop solution for opener spots (R4-B)', async () => {
    const node = await getSolution({ baseSpotId: 'btn-open', street: 'preflop' })
    expect(node?.spotId).toBe('btn-open')
    expect(node?.source).toBe('approximate_with_ev')
    // AA should have a positive heuristic EV attached
    const aa = node?.strategy['AA']?.find(a => a.action === 'raise')
    expect(aa?.ev).toBeGreaterThan(0)
  })

  it('supplies utg-open (added in Phase 4) as approximate_with_ev (R4-B precompute)', async () => {
    const node = await getSolution({ baseSpotId: 'utg-open', street: 'preflop' })
    expect(node?.source).toBe('approximate_with_ev')
  })

  it('serves approximate_with_ev for defender bb-vs-X spots (R4 defender 拡張)', async () => {
    const node = await getSolution({ baseSpotId: 'bb-vs-btn', street: 'preflop' })
    expect(node?.source).toBe('approximate_with_ev')
    // call EV が非ゼロでアタッチされている (純粋 fold 手は除外)
    const call99 = node?.strategy['99']?.find(a => a.action === 'call')
    expect(call99).toBeTruthy()
    expect(call99?.ev).not.toBe(0)
  })

  it('serves approximate_with_ev for non-BB defender sb-vs-btn (R4 16/21 拡張)', async () => {
    const node = await getSolution({ baseSpotId: 'sb-vs-btn', street: 'preflop' })
    expect(node?.spotId).toBe('sb-vs-btn')
    expect(node?.source).toBe('approximate_with_ev')
    // SB は 3bet-or-fold → fold EV は SB ブラインドロス -0.5。
    const fold = node?.strategy['99']?.find(a => a.action === 'fold')
    expect(fold?.ev).toBeCloseTo(-0.5)
  })

  it('serves approximate_with_ev for non-BB defender btn-vs-co with non-zero call EV (R4)', async () => {
    const node = await getSolution({ baseSpotId: 'btn-vs-co', street: 'preflop' })
    expect(node?.spotId).toBe('btn-vs-co')
    expect(node?.source).toBe('approximate_with_ev')
    const callTT = node?.strategy['TT']?.find(a => a.action === 'call')
    expect(callTT).toBeTruthy()
    expect(callTT?.ev).toBeGreaterThan(0)
  })

  it('returns null for an unknown spot id', async () => {
    expect(await getSolution({ baseSpotId: 'lj-vs-hj', street: 'preflop' })).toBeNull()
  })

  it('returns null when board is missing/insufficient', async () => {
    expect(await getSolution({ baseSpotId: 'bb-vs-btn', street: 'flop', board: [] })).toBeNull()
  })

  it('solves a TURN spot (4-card board) via 完全チャンスノード CFR (R14②) → solver_live + bettingAware', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')]
    const node = await getSolution(
      { baseSpotId: 'bb-vs-co', street: 'turn', board, heroCards, potBB: 8, effStackBB: 80 },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    expect(node?.street).toBe('turn')
    // R14②: turn は river ベッティングを織り込むチャンス CFR で解かれる(賭け未考慮の近似ではない)。
    expect(node?.bettingAware).toBe(true)
    expect(node?.runoutN).toBe(48) // 全 river 札を列挙 (サンプリング偏り回避)
    expect(node!.meta.sourceName).toContain('chance-node')
    expect(node!.strategy['AcAh'].length).toBeGreaterThan(0)
    expect(node!.strategy['AcAh'].every(a => Number.isFinite(a.ev))).toBe(true)
    // 収束: turn chance-CFR の目標は <10% pot (river の <5% より緩い)。
    expect(node!.exploitability).toBeLessThan(0.10)
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

  it('solves the river facing-bet node (call/fold/raise=check-raise) for hero OOP', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')] // トップセット → 被ベットでコール/レイズ
    const node = await getSolution(
      { baseSpotId: 'bb-vs-btn', street: 'river', board, heroCards, potBB: 12, effStackBB: 90, riverBetBB: 8 },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    const sols = node!.strategy['AcAh']
    // R16: 被ベットノードに raise(チェックレイズ)が加わる
    expect(sols.map(s => s.action).sort()).toEqual(['call', 'fold', 'raise'])
    expect(sols.every(s => Number.isFinite(s.ev))).toBe(true)
    // ナッツはほぼ降りない (コール+チェックレイズの合計が高頻度)
    const fold = sols.find(s => s.action === 'fold')!
    expect(fold.frequency).toBeLessThan(0.1)
    // 価値手はチェックレイズを選択肢に持つ (頻度>0)
    const raise = sols.find(s => s.action === 'raise')!
    expect(raise.frequency).toBeGreaterThan(0)
  })

  it('solves the river facing-bet node for hero=IP (offers fold/call/raise)', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')] // hero=BTN(IP), トップセット
    const node = await getSolution(
      // villain(BB=OOP) がリード → hero(IP) が fold/call/raise を選ぶノード
      { baseSpotId: 'btn-open', street: 'river', board, heroCards, potBB: 12, effStackBB: 90, riverBetBB: 8, heroIsOOP: false },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    const sols = node!.strategy['AcAh']
    expect(sols.map(s => s.action).sort()).toEqual(['call', 'fold', 'raise'])
    expect(sols.find(s => s.action === 'fold')!.frequency).toBeLessThan(0.1) // ナッツは降りない
  })

  it('solves the river facing-RAISE node for hero=OOP (hero led, villain raised → fold/call)', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')] // トップセット → 被レイズでも降りない
    const node = await getSolution(
      // riverBetBB = hero 自身のリードベット (betFrac の基準)。facingRaise で [1,2] ノードを狙う。
      { baseSpotId: 'bb-vs-btn', street: 'river', board, heroCards, potBB: 12, effStackBB: 90, riverBetBB: 8, facingRaise: true },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    expect(node!.spotId).toContain('-vsraise')
    const sols = node!.strategy['AcAh']
    // 被レイズノードは fold/call のみ (これ以上のレイズ無し)
    expect(sols.map(s => s.action).sort()).toEqual(['call', 'fold'])
    expect(sols.every(s => Number.isFinite(s.ev))).toBe(true)
    expect(sols.find(s => s.action === 'fold')!.frequency).toBeLessThan(0.1) // ナッツは降りない
  })

  it('solves the river facing-CHECK-RAISE node for hero=IP (OOP checked→hero bet→OOP XR → fold/call)', async () => {
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
    const heroCards: [Card, Card] = [c('A', 'hearts'), c('A', 'clubs')] // hero=BTN(IP) トップセット
    const node = await getSolution(
      { baseSpotId: 'btn-open', street: 'river', board, heroCards, potBB: 12, effStackBB: 90, riverBetBB: 8, facingRaise: true, heroIsOOP: false },
      { allowLiveSolve: true },
    )
    expect(node?.source).toBe('solver_live')
    const sols = node!.strategy['AcAh']
    expect(sols.map(s => s.action).sort()).toEqual(['call', 'fold'])
    expect(sols.find(s => s.action === 'fold')!.frequency).toBeLessThan(0.1)
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
