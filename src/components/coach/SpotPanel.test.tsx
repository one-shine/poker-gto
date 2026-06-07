import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpotPanel } from './SpotPanel'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import type { ActionRecord, GameState, Player } from '../../types/game'

function fold(id: string): ActionRecord {
  return {
    handId: 'h1', street: 'preflop', playerId: id, heroPosition: 'BTN',
    villainPositions: [], action: 'fold', amountBB: 0, potBB: 1.5, isIP: true, timestamp: 0,
  }
}

function pending(callAmount = 1, hole: Player['holeCards'] = [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }]): ActionRequiredPayload {
  const p = (id: string, position: Player['position'], seatIndex: number, isHero = false): Player => ({
    id, position, seatIndex, stackBB: 100,
    holeCards: isHero ? hole : null,
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

const openGuide = () => fireEvent.click(screen.getByRole('button', { name: /この局面の考え方/ }))
const clickReveal = () => fireEvent.click(screen.getByRole('button', { name: /GTO の答えを見る/ }))

describe('SpotPanel', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSession()
    useSettingsStore.setState({ studyShowStrategy: true })
  })

  // ── review フェーズ(アクション後・自動展開) ───────────────────────────────
  it('review: 答え合わせヘッダ + 打ったアクション + 戦略バー(自動表示)', async () => {
    render(<SpotPanel pending={pending()} phase="review" actedAction="raise" />)
    expect(await screen.findByText(/AKs @ btn-open/)).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument() // AKs は btn-open で 100% レイズ
    expect(screen.getByText(/答え合わせ/)).toBeInTheDocument()
    expect(screen.getByText(/あなた:/)).toBeInTheDocument()
  })

  it('review: 打った後なので精度サンプルから除外しない (markHinted しない・U8)', async () => {
    render(<SpotPanel pending={pending()} phase="review" actedAction="raise" />)
    await screen.findByText(/AKs @ btn-open/)
    expect(useSessionStore.getState().hintedHandIds.has('h1')).toBe(false)
  })

  it('review: オッズ目安を1回だけ併記(コール直面=ポットオッズ/必要勝率)', async () => {
    render(<SpotPanel pending={pending(1)} phase="review" actedAction="call" />)
    await screen.findByText(/AKs @ btn-open/)
    expect(screen.getAllByText(/オッズ目安/)).toHaveLength(1) // 1パネル内に1回だけ
    expect(screen.getAllByText(/ポットオッズ/).length).toBeGreaterThan(0)
    // 必要勝率はオッズ数値として1回だけ(用語チップは「関連理論・用語」に集約=既定折りたたみ)
    expect(screen.getAllByText(/必要勝率/).length).toBe(1)
    expect(screen.getByText(/: 1/)).toBeInTheDocument()
  })

  it('review: 打った後も「考え方(観点)」を折りたたみで見れる', () => {
    render(<SpotPanel pending={pending()} phase="review" actedAction="raise" />)
    expect(screen.queryByText('ハンド')).toBeNull() // 既定は折りたたみ(答え主体)
    fireEvent.click(screen.getByRole('button', { name: /この局面の考え方/ }))
    expect(screen.getByText('ハンド')).toBeInTheDocument() // 開くと観点が振り返れる
  })

  it('review: レンジ外の手は「フォールド100%」表示で対象外にしない', async () => {
    // 72o は btn-open レンジ外(手作りレンジは降りの手を省略)→ 対象外ではなくフォールド100%。
    render(<SpotPanel pending={pending(1, [{ rank: '7', suit: 'diamonds' }, { rank: '2', suit: 'clubs' }])} phase="review" actedAction="fold" />)
    expect(await screen.findByText(/72o @ btn-open/)).toBeInTheDocument()
    expect(screen.queryByText(/対象外/)).toBeNull()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('review: コール無しスポットはエクイティ強弱目安(ポットオッズ比は出さない)', async () => {
    render(<SpotPanel pending={pending(0)} phase="review" actedAction="check" />)
    await screen.findByText(/AKs @ btn-open/)
    expect(screen.getByText(/あなたの勝率/)).toBeInTheDocument()
    expect(screen.queryByText(/: 1/)).toBeNull()
  })

  it('review: マルチウェイは HU レンジを参考値表示(ルール4)・断定コール判定は出さない', async () => {
    render(<SpotPanel pending={multiwayPending()} phase="review" actedAction="call" />)
    expect(await screen.findByText(/sb-vs-co/)).toBeInTheDocument()
    expect(screen.getByText(/マルチウェイ=参考値/)).toBeInTheDocument()
    expect(screen.queryByText(/対象外/)).toBeNull()
    expect(await screen.findByText(/コール判定は出さず参考数値のみ/)).toBeInTheDocument()
    expect(screen.getByText(/あなたの勝率\(参考\)/)).toBeInTheDocument()
    expect(screen.queryByText(/コール有利/)).toBeNull()
    expect(screen.queryByText(/フォールド寄り/)).toBeNull()
  })

  // ── decision フェーズ(アクション前・既定折りたたみ・答えは任意) ────────────
  it('decision: 既定は折りたたみで答え(GTO頻度)を見せない', () => {
    render(<SpotPanel pending={pending()} phase="decision" />)
    expect(screen.getByText(/タップで開く/)).toBeInTheDocument()
    expect(screen.queryByText(/AKs @ btn-open/)).toBeNull() // 答えは出ていない
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('decision: 開いても答えは「答えを見る」まで出ない(観点のみ)', () => {
    render(<SpotPanel pending={pending()} phase="decision" />)
    openGuide()
    expect(screen.getByText('ハンド')).toBeInTheDocument() // 観点(考え方)は出る
    expect(screen.getByRole('button', { name: /GTO の答えを見る/ })).toBeInTheDocument()
    expect(screen.queryByText(/AKs @ btn-open/)).toBeNull() // 答えはまだ出ない
  })

  it('decision: 「答えを見る」で頻度を表示し、その手を精度サンプルから除外(markHinted)', async () => {
    render(<SpotPanel pending={pending()} phase="decision" />)
    openGuide()
    clickReveal()
    expect(await screen.findByText(/AKs @ btn-open/)).toBeInTheDocument()
    expect(useSessionStore.getState().hintedHandIds.has('h1')).toBe(true)
  })

  it('decision: 純テスト(studyShowStrategy=false)では「答えを見る」を出さない', () => {
    useSettingsStore.setState({ studyShowStrategy: false })
    render(<SpotPanel pending={pending()} phase="decision" />)
    openGuide()
    expect(screen.queryByRole('button', { name: /GTO の答えを見る/ })).toBeNull()
  })
})
