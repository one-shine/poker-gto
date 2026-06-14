import { describe, it, expect } from 'vitest'
import type { GameState, Player, ActionRecord, Card, Rank, Suit } from '../../types/game'
import { buildDecisionGuidance } from './decisionGuidance'
import { conceptById } from '../../data/theory/concepts'

// answer-neutral guide: buildDecisionGuidance は NodeSolution(GTO頻度=答え)を一切受け取らない。
// =構造的に答えを漏らせない。本テストは観点(situation/considerations/conceptIds)の正しさを検証する。

const C = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })
function player(id: string, position: Player['position'], seatIndex: number, hole: [Card, Card] | null): Player {
  return {
    id, position, seatIndex, stackBB: 100, holeCards: hole, isHero: id === 'hero',
    agentType: 'fish_ai', isFolded: false, isAllIn: false, currentBetBB: 0,
  }
}
function rec(playerId: string, action: ActionRecord['action'], street: GameState['street'] = 'preflop'): ActionRecord {
  return {
    handId: 'h', street, playerId, heroPosition: 'BTN', villainPositions: [],
    action, amountBB: action === 'raise' ? 2.5 : 0, potBB: 1.5, isIP: false, timestamp: 0,
  }
}
const folded = (p: Player): Player => ({ ...p, isFolded: true })
// 6-max btn=seat0: BTN,SB,BB,UTG,MP,CO
function baseState(over: Partial<GameState> = {}): GameState {
  return {
    handId: 'h', street: 'preflop',
    players: [
      player('hero', 'BTN', 0, [C('A', 'spades'), C('K', 'spades')]),
      player('p1', 'SB', 1, null), player('p2', 'BB', 2, null),
      player('p3', 'UTG', 3, null), player('p4', 'MP', 4, null), player('p5', 'CO', 5, null),
    ],
    board: [], pot: { mainPotBB: 1.5, sidePots: [] }, actionHistory: [],
    currentActorId: 'hero', buttonSeatIndex: 0, bigBlindBB: 1, smallBlindBB: 0.5,
    handNumber: 1, isHandComplete: false, ...over,
  }
}
const noCtx = { callAmount: 0, reqEquity: 0, equity: null }

describe('buildDecisionGuidance', () => {
  it('every emitted conceptId is a real theory concept', () => {
    const states: GameState[] = [
      baseState({ actionHistory: ['p3', 'p4', 'p5'].map(id => rec(id, 'fold')) }), // RFI
      baseState({ // BB vs UTG
        players: [
          player('hero', 'BB', 2, [C('A', 'hearts'), C('Q', 'hearts')]),
          player('utg', 'UTG', 3, null), folded(player('mp', 'MP', 4, null)),
          folded(player('co', 'CO', 5, null)), folded(player('btn', 'BTN', 0, null)), folded(player('sb', 'SB', 1, null)),
        ],
        actionHistory: [rec('utg', 'raise')],
      }),
      baseState({ street: 'flop', board: [C('K', 'clubs'), C('7', 'diamonds'), C('2', 'spades')], actionHistory: [rec('p3', 'raise'), rec('hero', 'call')] }),
    ]
    for (const s of states) {
      const g = buildDecisionGuidance(s, 'hero', noCtx)
      for (const id of g.conceptIds) expect(conceptById(id), `concept ${id} 実在`).toBeDefined()
    }
  })

  it('preflop RFI (未オープン) → オープン判断の観点', () => {
    const s = baseState({ actionHistory: ['p3', 'p4', 'p5'].map(id => rec(id, 'fold')) })
    const g = buildDecisionGuidance(s, 'hero', noCtx)
    expect(g.situation).toContain('未オープン')
    expect(g.conceptIds).toContain('rfi-ranges')
    expect(g.conceptIds).toContain('no-limp')
    expect(g.considerations.some(c => c.label === '位置' && c.value === 'BTN')).toBe(true)
    expect(g.considerations.some(c => c.label === 'ハンド')).toBe(true)
  })

  it('preflop BB vs UTG open → bb-defense + 相手レンジの定性', () => {
    const s = baseState({
      players: [
        player('hero', 'BB', 2, [C('A', 'hearts'), C('Q', 'hearts')]),
        player('utg', 'UTG', 3, null), folded(player('mp', 'MP', 4, null)),
        folded(player('co', 'CO', 5, null)), folded(player('btn', 'BTN', 0, null)), folded(player('sb', 'SB', 1, null)),
      ],
      actionHistory: [rec('utg', 'raise')],
    })
    const g = buildDecisionGuidance(s, 'hero', { callAmount: 1.5, reqEquity: 0.3, equity: 0.42 })
    expect(g.situation).toContain('UTG')
    expect(g.conceptIds).toContain('bb-defense')
    expect(g.conceptIds).toContain('pot-odds')
    expect(g.considerations.some(c => c.label === '相手レンジ')).toBe(true)
    // オッズ数値は OddsGuide が1回だけ出す → 観点には含めない(二重表示回避)
    expect(g.considerations.some(c => c.label.startsWith('オッズ'))).toBe(false)
  })

  it('postflop OOP facing bet → 位置OOP + ボード + pot-odds、equity null は理由文', () => {
    const s = baseState({
      street: 'turn',
      board: [C('Q', 'hearts'), C('J', 'hearts'), C('9', 'clubs'), C('2', 'spades')],
      players: [
        player('hero', 'BB', 2, [C('A', 'clubs'), C('5', 'diamonds')]),
        player('co', 'CO', 5, null), folded(player('utg', 'UTG', 3, null)),
        folded(player('mp', 'MP', 4, null)), folded(player('btn', 'BTN', 0, null)), folded(player('sb', 'SB', 1, null)),
      ],
      actionHistory: [rec('co', 'raise'), rec('hero', 'call')],
    })
    const g = buildDecisionGuidance(s, 'hero', { callAmount: 6, reqEquity: 0.3, equity: null, equityReason: 'uncovered_line' })
    expect(g.situation).toContain('ターン')
    expect(g.situation).toContain('OOP')
    expect(g.conceptIds).toContain('board-texture')
    expect(g.conceptIds).toContain('pot-odds')
    expect(g.considerations.some(c => c.label === 'ボード')).toBe(true)
    // オッズ数値は OddsGuide が出すため観点には含めない
    expect(g.considerations.some(c => c.label.startsWith('オッズ'))).toBe(false)
  })

  it('postflop IP 先制 (未ベット) → cbet-ip', () => {
    const s = baseState({
      street: 'flop',
      board: [C('K', 'clubs'), C('7', 'diamonds'), C('2', 'spades')],
      players: [
        player('hero', 'BTN', 0, [C('A', 'spades'), C('K', 'spades')]),
        player('bb', 'BB', 2, null), folded(player('sb', 'SB', 1, null)),
        folded(player('utg', 'UTG', 3, null)), folded(player('mp', 'MP', 4, null)), folded(player('co', 'CO', 5, null)),
      ],
      actionHistory: [rec('hero', 'raise'), rec('bb', 'call')],
    })
    const g = buildDecisionGuidance(s, 'hero', noCtx)
    expect(g.situation).toContain('IP')
    expect(g.situation).toContain('先制')
    expect(g.conceptIds).toContain('cbet-ip')
    // ベットの使い分け観点 (サイズ) がゲーム中に出る (B10)
    expect(g.considerations.some(c => c.label === 'サイズの使い分け')).toBe(true)
    expect(g.conceptIds).toContain('bet-sizing')
    expect(g.conceptIds).toContain('polarization')
    expect(g.terms).toContain('ポラライズ')
    // ブロッカー観点: hero Ks がボードの K をブロック
    expect(g.considerations.some(c => c.label === 'ブロッカー')).toBe(true)
    expect(g.conceptIds).toContain('blockers')
  })

  it('postflop フラッシュ可能ボードで A フラッシュブロッカー → blockers 観点 (B10)', () => {
    const s = baseState({
      street: 'flop',
      board: [C('K', 'hearts'), C('9', 'hearts'), C('4', 'clubs')],
      players: [
        player('hero', 'BTN', 0, [C('A', 'hearts'), C('Q', 'spades')]),
        player('bb', 'BB', 2, null), folded(player('sb', 'SB', 1, null)),
        folded(player('utg', 'UTG', 3, null)), folded(player('mp', 'MP', 4, null)), folded(player('co', 'CO', 5, null)),
      ],
      actionHistory: [rec('hero', 'raise'), rec('bb', 'call')],
    })
    const g = buildDecisionGuidance(s, 'hero', noCtx)
    expect(g.conceptIds).toContain('blockers')
    expect(g.considerations.some(c => c.label === 'ブロッカー' && /フラッシュ/.test(c.note ?? ''))).toBe(true)
    expect(g.terms).toContain('ブロッカー')
  })
})
