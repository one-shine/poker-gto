import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveStrategyPanel } from './LiveStrategyPanel'
import { useSessionStore } from '../../stores/sessionStore'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import type { ActionRecord, GameState, Player } from '../../types/game'

function fold(id: string): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId: id, heroPosition: 'BTN',
    villainPositions: [], action: 'fold', amountBB: 0, potBB: 1.5, isIP: true, timestamp: 0,
  }
}

function pending(callAmount = 1): ActionRequiredPayload {
  const p = (id: string, position: Player['position'], seatIndex: number, isHero = false): Player => ({
    id, position, seatIndex, stackBB: 100,
    holeCards: isHero ? [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }] : null,
    isHero, agentType: isHero ? 'human' : 'fish_ai',
    isFolded: ['v3', 'v4', 'v5'].includes(id), isAllIn: false,
    currentBetBB: id === 'v2' ? callAmount : 0,
  })
  const state: GameState = {
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
  return { state, playerId: 'hero', validActions: ['call', 'fold', 'raise'], callAmount, minRaiseToAmount: 2 }
}

function rec(id: string, action: ActionRecord['action']): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId: id, heroPosition: 'SB', villainPositions: [],
    action, amountBB: action === 'raise' ? 2.5 : 0, potBB: 1.5, isIP: false, timestamp: 0,
  }
}

// CO raise + BTN cold-call → hero=SB が応答 = 実質マルチウェイ (sb-vs-co の参考値スポット)。
function multiwayPending(): ActionRequiredPayload {
  const p = (id: string, position: Player['position'], seatIndex: number, folded: boolean, isHero = false): Player => ({
    id, position, seatIndex, stackBB: 100,
    holeCards: isHero ? [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }] : null,
    isHero, agentType: isHero ? 'human' : 'fish_ai', isFolded: folded, isAllIn: false,
    currentBetBB: id === 'co' || id === 'btn' ? 2.5 : 0,
  })
  const state: GameState = {
    handId: 'h1', street: 'preflop',
    players: [
      p('btn', 'BTN', 0, false), p('hero', 'SB', 1, false, true), p('bb', 'BB', 2, false),
      p('utg', 'UTG', 3, true), p('mp', 'MP', 4, true), p('co', 'CO', 5, false),
    ],
    board: [], pot: { mainPotBB: 4.5, sidePots: [] },
    actionHistory: [rec('utg', 'fold'), rec('mp', 'fold'), rec('co', 'raise'), rec('btn', 'call')],
    currentActorId: 'hero', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5, handNumber: 1, isHandComplete: false,
  }
  return { state, playerId: 'hero', validActions: ['call', 'fold', 'raise'], callAmount: 2, minRaiseToAmount: 5 }
}

describe('LiveStrategyPanel', () => {
  beforeEach(() => useSessionStore.getState().clearSession())

  it('renders the GTO strategy bars for the current hand', async () => {
    render(<LiveStrategyPanel pending={pending()} allowLiveSolve />)
    expect(await screen.findByText(/AKs @ btn-open/)).toBeInTheDocument()
    // AKs は btn-open で 100% レイズ
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('excludes the shown hand from the accuracy sample (markHinted)', async () => {
    render(<LiveStrategyPanel pending={pending()} allowLiveSolve />)
    await screen.findByText(/AKs @ btn-open/)
    expect(useSessionStore.getState().hintedHandIds.has('h1')).toBe(true)
  })

  it('always shows the odds guide (pot odds / required equity) alongside GTO for a call-facing spot (U18)', async () => {
    render(<LiveStrategyPanel pending={pending(1)} allowLiveSolve />)
    await screen.findByText(/AKs @ btn-open/)
    // 用語チップ(TermChips)も「ポットオッズ/必要勝率」を出すので getAllByText で存在を確認
    expect(screen.getByText(/オッズ目安/)).toBeInTheDocument()
    expect(screen.getAllByText(/ポットオッズ/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/必要勝率/).length).toBeGreaterThan(0)
    expect(screen.getByText(/: 1/)).toBeInTheDocument() // ポットオッズの比 (x : 1)
  })

  it('shows an equity-strength hint (not the pot-odds ratio) for a no-bet spot (U18)', async () => {
    render(<LiveStrategyPanel pending={pending(0)} allowLiveSolve />)
    await screen.findByText(/AKs @ btn-open/)
    expect(screen.getByText(/オッズ目安/)).toBeInTheDocument()
    expect(screen.getByText(/あなたの勝率/)).toBeInTheDocument()
    expect(screen.queryByText(/: 1/)).toBeNull() // コール無しなのでポットオッズの比は出さない
  })

  it('links the odds guide to the pot-odds theory (オッズ学習の導線)', async () => {
    render(<LiveStrategyPanel pending={pending(1)} allowLiveSolve />)
    await screen.findByText(/AKs @ btn-open/)
    expect(screen.getByText(/オッズの理論/)).toBeInTheDocument()
  })

  it('shows the HU range as a multiway reference (rule 4) when 3+ players are in', async () => {
    render(<LiveStrategyPanel pending={multiwayPending()} allowLiveSolve revealActed="call" />)
    expect(await screen.findByText(/sb-vs-co/)).toBeInTheDocument() // 対象外でなく戦略が出る
    expect(screen.getByText(/マルチウェイ=参考値/)).toBeInTheDocument()
    expect(screen.queryByText(/対象外/)).toBeNull()
    // マルチウェイでも勝率を「参考」として出す (— ではない・全相手レンジ vs hero)
    expect(await screen.findByText(/コール判定は出さず参考数値のみ/)).toBeInTheDocument()
    expect(screen.getByText(/あなたの勝率\(参考\)/)).toBeInTheDocument()
    // ルール1: マルチウェイでは断定的な「✓ コール有利 / ✗ フォールド寄り」を出さない
    expect(screen.queryByText(/コール有利/)).toBeNull()
    expect(screen.queryByText(/フォールド寄り/)).toBeNull()
  })

  it('reveal mode (after acting) shows the answer-check header and keeps the hand in the sample (U8)', async () => {
    render(<LiveStrategyPanel pending={pending()} allowLiveSolve revealActed="raise" />)
    await screen.findByText(/AKs @ btn-open/)
    // 「答え合わせ」+ 自分が打ったアクションを併記 (チップは「あなた:」・OddsGuide の「あなたの勝率」と区別)
    expect(screen.getByText(/答え合わせ/)).toBeInTheDocument()
    expect(screen.getByText(/あなた:/)).toBeInTheDocument()
    // 事前ではなく打った後の表示なので、精度サンプルからは除外しない (markHinted しない)
    expect(useSessionStore.getState().hintedHandIds.has('h1')).toBe(false)
  })
})
