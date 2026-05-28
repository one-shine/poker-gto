import { describe, it, expect } from 'vitest'
import {
  explainPostflop, generatePostflopQuestion, judgePostflop, solvePostflopQuestion,
  type PostflopActionInfo, type PostflopQuestion,
} from './postflopDrill'
import type { Card } from '../../types/game'
import { comboKey, expandRange, heroRangeSpec, deriveRiverRanges } from '../solver/riverRanges'

// 再現可能な seeded RNG (preflopEquity の mulberry32 と同系)。
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('postflopDrill generation', () => {
  it('produces valid questions: board length matches street and hero is in range', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const q = generatePostflopQuestion(mulberry32(seed))
      const lens = { flop: 3, turn: 4, river: 5 }
      expect(q.board.length).toBe(lens[q.street])
      // hero の 2枚はボードと衝突しない
      const hk = comboKey(q.heroCards)
      expect(q.board.some(b => b.rank === q.heroCards[0].rank && b.suit === q.heroCards[0].suit)).toBe(false)
      // hero ハンドが当該スポットのレンジに実在する (OOP=call / IP=raise)
      const pick = q.heroIsOOP ? 'call' : 'raise'
      const range = expandRange(q.baseSpotId, pick, q.board)
      expect(range.some(c => comboKey(c.cards) === hk)).toBe(true)
    }
  })

  it('respects a fixed street request', () => {
    const q = generatePostflopQuestion(mulberry32(7), 'river')
    expect(q.street).toBe('river')
    expect(q.board.length).toBe(5)
  })
})

describe('postflopDrill 3bet pots (R16)', () => {
  it('generates valid 3bet-pot questions with the larger pot/stack and in-range hero hand', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const q = generatePostflopQuestion(mulberry32(seed), undefined, '3bet')
      expect(q.potType).toBe('3bet')
      expect(q.baseSpotId.startsWith('3bp-')).toBe(true)
      expect(q.potBB).toBe(22.5)
      expect(q.effStackBB).toBe(89)
      // hero ハンドが当該 3bet ポットの hero レンジに実在する
      const ref = heroRangeSpec(q.baseSpotId)
      expect(ref).not.toBeNull()
      const range = expandRange(ref!.scenarioId, ref!.pick, q.board)
      expect(range.some(c => comboKey(c.cards) === comboKey(q.heroCards))).toBe(true)
    }
  })

  it('derives non-empty OOP and IP ranges for every 3bet-pot spot, hero side consistent', () => {
    const ids = [
      '3bp-bb-vs-btn', '3bp-btn-vs-bb', '3bp-bb-vs-co', '3bp-co-vs-bb',
      '3bp-sb-vs-btn', '3bp-btn-vs-sb', '3bp-sb-vs-co', '3bp-co-vs-sb',
      '3bp-co-vs-btn', '3bp-btn-vs-co',
    ]
    // 衝突しないダミー hero/board (ハンドはレンジ内である必要は無い・導出の健全性のみ確認)
    const hero: [Card, Card] = [{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }]
    const board: Card[] = [{ rank: 'K', suit: 'diamonds' }, { rank: '7', suit: 'clubs' }, { rank: '2', suit: 'spades' }]
    for (const id of ids) {
      const r = deriveRiverRanges(id, board, hero)
      expect(r, id).not.toBeNull()
      expect(r!.oop.length, id).toBeGreaterThan(0)
      expect(r!.ip.length, id).toBeGreaterThan(0)
    }
  })

  it('solves a generated 3bet-pot river spot via self CFR (solver_live + EV)', async () => {
    const q = generatePostflopQuestion(mulberry32(5), 'river', '3bet')
    const res = await solvePostflopQuestion(q)
    expect(res).not.toBeNull()
    expect(res!.source).toBe('solver_live')
    expect(res!.all.length).toBeGreaterThan(0)
    const sum = res!.all.reduce((s, a) => s + a.freq, 0)
    expect(sum).toBeGreaterThan(0.9)
    expect(sum).toBeLessThan(1.1)
  }, 15000)
})

describe('postflopDrill facing-raise deep node (R16)', () => {
  const cc = (r: string, s: string): Card => ({ rank: r as Card['rank'], suit: s as Card['suit'] })

  it('a facing-raise question (hero led, villain raised) solves to fold/call only', async () => {
    // bb-vs-btn river, hero=OOP, 99 はピュアコールレンジ。被レイズ節 → fold/call の2択。
    const q: PostflopQuestion = {
      baseSpotId: 'bb-vs-btn', baseLabel: 'BB vs BTN', street: 'river',
      board: [cc('A', 'spades'), cc('K', 'diamonds'), cc('7', 'clubs'), cc('3', 'hearts'), cc('2', 'spades')],
      heroCards: [cc('9', 'hearts'), cc('9', 'clubs')], heroHand: '99', heroIsOOP: true,
      facing: false, facingRaise: true, potType: 'srp', potBB: 5.5, effStackBB: 100,
      heroBetBB: 3.6, raiseToBB: 10, prompt: '',
    }
    const res = await solvePostflopQuestion(q)
    expect(res).not.toBeNull()
    expect(res!.all.map(a => a.action).sort()).toEqual(['call', 'fold'])
    expect(res!.all.every(a => Number.isFinite(a.ev))).toBe(true)
  }, 15000)

  it('the random generator can produce facing-raise questions', () => {
    let seen = false
    for (let seed = 1; seed <= 60 && !seen; seed++) {
      if (generatePostflopQuestion(mulberry32(seed)).facingRaise) seen = true
    }
    expect(seen).toBe(true)
  })
})

describe('postflopDrill judging', () => {
  const all: PostflopActionInfo[] = [
    { action: 'check', label: 'チェック', freq: 0.7, ev: 1.2 },
    { action: 'raise', label: 'ベット 3.6BB', sizeBB: 3.6, freq: 0.3, ev: 1.1 },
  ]

  it('mixed strategy: both ≥10% actions are correct', () => {
    expect(judgePostflop(all, 'solver_live', 'check').correct).toBe(true)
    expect(judgePostflop(all, 'solver_live', 'raise').correct).toBe(true)
  })

  it('an action below 10% (and absent actions) are wrong', () => {
    const lopsided: PostflopActionInfo[] = [
      { action: 'check', label: 'チェック', freq: 0.95, ev: 1.2 },
      { action: 'raise', label: 'ベット', sizeBB: 3.6, freq: 0.05, ev: 0.4 },
    ]
    expect(judgePostflop(lopsided, 'solver_live', 'raise').correct).toBe(false)
    expect(judgePostflop(lopsided, 'solver_live', 'fold').correct).toBe(false)
    expect(judgePostflop(lopsided, 'solver_live', 'check').correct).toBe(true)
  })
})

describe('explainPostflop', () => {
  const cc = (r: string, s: string): Card => ({ rank: r as Card['rank'], suit: s as Card['suit'] })
  const mkQ = (board: Card[], hero: [Card, Card]): PostflopQuestion => ({
    baseSpotId: 'btn-open', baseLabel: 'BTN', street: board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river',
    board, heroCards: hero, heroHand: 'XX', heroIsOOP: false, facing: false, facingRaise: false, potType: 'srp', potBB: 5.5, prompt: '',
  })

  it('names the made hand and ties the principle to the recommended action', () => {
    // セット (AA on A-K-7) + ベット推奨 → 強い手のバリュー文言
    const q = mkQ([cc('A', 'spades'), cc('K', 'diamonds'), cc('7', 'clubs')], [cc('A', 'hearts'), cc('A', 'clubs')])
    const all: PostflopActionInfo[] = [
      { action: 'check', label: 'チェック', freq: 0.2, ev: 1 },
      { action: 'raise', label: 'ベット', sizeBB: 3.6, freq: 0.8, ev: 1.5 },
    ]
    const text = explainPostflop(q, all)
    expect(text).toContain('スリーカード')
    expect(text).toContain('バリュー')
  })

  it('weak hand + fold recommended → fold rationale', () => {
    const q = mkQ([cc('A', 'spades'), cc('K', 'diamonds'), cc('7', 'clubs')], [cc('3', 'hearts'), cc('2', 'clubs')])
    const all: PostflopActionInfo[] = [
      { action: 'fold', label: 'フォールド', freq: 0.9, ev: -1 },
      { action: 'call', label: 'コール', freq: 0.1, ev: -1.5 },
    ]
    const text = explainPostflop(q, all)
    expect(text).toContain('ノーペア')
    expect(text).toContain('フォールド')
  })
})

describe('postflopDrill end-to-end solve', () => {
  it('solves a generated river spot via self CFR and returns solver_live actions with EV', async () => {
    // river を固定して求解 (turn/flop より速い・showdown 二値で安定)
    const q = generatePostflopQuestion(mulberry32(3), 'river')
    const res = await solvePostflopQuestion(q)
    expect(res).not.toBeNull()
    expect(res!.source).toBe('solver_live')
    expect(res!.all.length).toBeGreaterThan(0)
    for (const a of res!.all) {
      expect(a.freq).toBeGreaterThanOrEqual(0)
      expect(a.freq).toBeLessThanOrEqual(1)
      expect(Number.isFinite(a.ev)).toBe(true)
    }
    // 頻度の総和は概ね1 (戦略分布)
    const sum = res!.all.reduce((s, a) => s + a.freq, 0)
    expect(sum).toBeGreaterThan(0.9)
    expect(sum).toBeLessThan(1.1)
  }, 15000)
})
