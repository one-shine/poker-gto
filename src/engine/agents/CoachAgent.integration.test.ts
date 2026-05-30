import { describe, it, expect } from 'vitest'
import { AgentBus } from './AgentBus'
import { CoachAgent, evaluateHeroDecision } from './CoachAgent'
import type { ActionRecord, Card, GameState, Player } from '../../types/game'
import type { CoachFeedback } from '../../types/coach'

function fold(id: string): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId: id, heroPosition: 'BTN',
    villainPositions: [], action: 'fold', amountBB: 0, potBB: 1.5, isIP: true, timestamp: 0,
  }
}

// BTN にフォールドが回ってきたオープンスポット (btn-open にマッチ)。
function btnOpenState(heroCards: Card[]): GameState {
  const p = (id: string, position: Player['position'], seatIndex: number, isHero = false): Player => ({
    id, position, seatIndex, stackBB: 100,
    holeCards: isHero ? heroCards : null,
    isHero, agentType: isHero ? 'human' : 'fish_ai',
    isFolded: ['v3', 'v4', 'v5'].includes(id), isAllIn: false, currentBetBB: 0,
  })
  return {
    handId: 'h1', street: 'preflop',
    players: [
      p('hero', 'BTN', 0, true), p('v1', 'SB', 1), p('v2', 'BB', 2),
      p('v3', 'UTG', 3), p('v4', 'MP', 4), p('v5', 'CO', 5),
    ],
    board: [], pot: { mainPotBB: 1.5, sidePots: [] },
    actionHistory: [fold('v3'), fold('v4'), fold('v5')],
    currentActorId: 'hero', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false,
  }
}

// ACTION_REQUIRED → PLAYER_ACTION を流し、FEEDBACK_READY を待つ。
function runDecision(heroCards: Card[], action: 'raise' | 'fold', amount = 2.5): Promise<CoachFeedback | null> {
  const bus = new AgentBus()
  new CoachAgent(bus, 'hero', false)
  const state = btnOpenState(heroCards)
  return new Promise(resolve => {
    let got = false
    bus.on('FEEDBACK_READY', ({ feedback }) => { got = true; resolve(feedback) })
    bus.emit('ACTION_REQUIRED', { state, playerId: 'hero', validActions: ['fold', 'raise'], callAmount: 1, minRaiseToAmount: 2 })
    bus.emit('PLAYER_ACTION', { playerId: 'hero', action, amount })
    // 非同期 getSolution が解決しなければ null (スキップ) とみなす
    setTimeout(() => { if (!got) resolve(null) }, 50)
  })
}

describe('CoachAgent wiring (bus → FEEDBACK_READY)', () => {
  it('emits a mistake feedback when raising a trash hand as an opener', async () => {
    const fb = await runDecision([{ rank: '7', suit: 'spades' }, { rank: '2', suit: 'hearts' }], 'raise')
    expect(fb?.kind).toBe('mistake')
    expect(fb?.category).toBe('preflop_too_wide')
  })

  it('emits correct feedback when raising AA as an opener', async () => {
    const fb = await runDecision([{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }], 'raise')
    expect(fb?.kind).toBe('correct')
  })

  it('captures the decision-time state via ACTION_REQUIRED before PLAYER_ACTION', async () => {
    const fb = await runDecision([{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }], 'raise')
    expect(fb?.handKey).toBe('AKs')
    expect(fb?.spotId).toBe('btn-open')
  })
})

// ── R1/R3: リバーの自前ソルバーで実EVコーチングが動く (postflop) ───────────────
function c(rank: Card['rank'], suit: Card['suit']): Card { return { rank, suit } }

// HU リバー: hero=BB(OOP, seat2) vs BTN(villain, seat0)。BTN open→BB call→river hero先頭。
function riverState(heroCards: [Card, Card]): GameState {
  const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
  const p = (id: string, position: Player['position'], seat: number, folded: boolean, hero = false): Player => ({
    id, position, seatIndex: seat, stackBB: 90,
    holeCards: hero ? heroCards : null,
    isHero: hero, agentType: hero ? 'human' : 'fish_ai', isFolded: folded, isAllIn: false, currentBetBB: 0,
  })
  return {
    handId: 'h9', street: 'river',
    players: [
      p('villain', 'BTN', 0, false), p('p1', 'SB', 1, true), p('hero', 'BB', 2, false, true),
      p('p3', 'UTG', 3, true), p('p4', 'MP', 4, true), p('p5', 'CO', 5, true),
    ],
    board,
    pot: { mainPotBB: 12, sidePots: [] },
    actionHistory: [
      { handId: 'h9', street: 'preflop', playerId: 'villain', actorPosition: 'BTN', heroPosition: 'BB', villainPositions: ['BTN'], action: 'raise', amountBB: 2.5, potBB: 1.5, isIP: false, timestamp: 0 },
      { handId: 'h9', street: 'preflop', playerId: 'hero', actorPosition: 'BB', heroPosition: 'BB', villainPositions: ['BTN'], action: 'call', amountBB: 2.5, potBB: 4, isIP: false, timestamp: 0 },
    ],
    currentActorId: 'hero', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 9, isHandComplete: false,
  }
}

describe('CoachAgent postflop (river self-solver = R1/R3)', () => {
  it('produces real-EV feedback on the river (solver_live, showEv) for a BB-defense OOP lead', async () => {
    const bus = new AgentBus()
    new CoachAgent(bus, 'hero', true) // study = allowLiveSolve
    const state = riverState([c('A', 'hearts'), c('A', 'clubs')]) // セットのA
    const fb = await new Promise<CoachFeedback | null>(resolve => {
      let got = false
      bus.on('FEEDBACK_READY', ({ feedback }) => { got = true; resolve(feedback) })
      bus.emit('ACTION_REQUIRED', { state, playerId: 'hero', validActions: ['check', 'raise'], callAmount: 0, minRaiseToAmount: 2 })
      bus.emit('PLAYER_ACTION', { playerId: 'hero', action: 'raise', amount: 8 })
      setTimeout(() => { if (!got) resolve(null) }, 3000)
    })
    expect(fb).not.toBeNull()
    expect(fb!.source).toBe('solver_live')
    expect(fb!.showEv).toBe(true) // 実EV が表示される (R3)
    expect(fb!.strategy.length).toBeGreaterThan(0)
  })
})

// ── play モードのハンド後 postflop 復習が使う共有評価関数 ──────────────────────────
// 注: allowLiveSolve=false でも solveCache に解があれば配給される (cold spot のみ null)。
// play 中はライブ「求解の起動」をしないだけ → 未キャッシュの postflop はこの復習に回す。
describe('evaluateHeroDecision (post-hand review の共有関数)', () => {
  it('allowLiveSolve=true で実ボードを live solve し solver_live フィードバックを返す (復習の経路)', async () => {
    const state = riverState([c('A', 'hearts'), c('A', 'clubs')])
    const fb = await evaluateHeroDecision(state, 'hero', 'raise', 8, true)
    expect(fb).not.toBeNull()
    expect(fb!.source).toBe('solver_live')
    expect(fb!.showEv).toBe(true)
    expect(fb!.street).toBe('river')
  }, 15000)
})
