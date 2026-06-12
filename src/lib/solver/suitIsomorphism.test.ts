import { describe, it, expect } from 'vitest'
import { parseCard, parseCards, sameCard } from '../../engine/cards/Card'
import type { Card } from '../../types/game'
import type { Combo } from './riverSolver'
import { allRunouts } from './chanceCfr'
import {
  boardSuitPerms,
  runoutClasses,
  comboIndexPerm,
  canonicalFlops,
  canonicalizeFlop,
  applyPermToCard,
  cardId,
  IDENTITY_PERM,
  type SuitPerm,
} from './suitIsomorphism'

// SUITS index: spades=0, hearts=1, diamonds=2, clubs=3

describe('boardSuitPerms — ボードを集合として固定する置換群', () => {
  it('レインボー3枚 (AhKd7s) は h/d/s が各自固定 → c も強制固定で群サイズ1', () => {
    const perms = boardSuitPerms(parseCards('Ah Kd 7s'))
    expect(perms).toHaveLength(1)
    expect(perms[0]).toEqual([0, 1, 2, 3])
  })

  it('ツートーン (Th9h5s) は未使用2スート {d,c} の入替のみ自由で群サイズ2', () => {
    const perms = boardSuitPerms(parseCards('Th 9h 5s'))
    expect(perms).toHaveLength(2)
    expect(perms).toContainEqual([0, 1, 2, 3])
    expect(perms).toContainEqual([0, 1, 3, 2]) // d↔c
  })

  it('モノトーン (Kh9h4h) は h 固定で残り 3! = 6', () => {
    const perms = boardSuitPerms(parseCards('Kh 9h 4h'))
    expect(perms).toHaveLength(6)
    for (const p of perms) expect(p[1]).toBe(1)
  })

  it('ペアボード (QsQd6c) は s↔d 交換可で群サイズ2', () => {
    const perms = boardSuitPerms(parseCards('Qs Qd 6c'))
    expect(perms).toHaveLength(2)
    expect(perms).toContainEqual([0, 1, 2, 3])
    expect(perms).toContainEqual([2, 1, 0, 3]) // s↔d
  })

  it('返る置換はすべて板の各カードを板内に写す', () => {
    for (const str of ['Ah Kd 7s', 'Th 9h 5s', 'Kh 9h 4h', 'Qs Qd 6c', 'As Ad Ah']) {
      const board = parseCards(str)
      const ids = new Set(board.map(cardId))
      for (const perm of boardSuitPerms(board)) {
        for (const c of board) expect(ids.has(cardId(applyPermToCard(c, perm)))).toBe(true)
      }
    }
  })
})

describe('runoutClasses — runout の同値類分割', () => {
  const boards = ['Th 9h 5s', 'Kh 9h 4h', 'Ah Kd 7s', 'Qs Qd 6c']

  it('分割である: 全 runout がちょうど1クラスに属する (重複なし・取りこぼしなし)', () => {
    for (const str of boards) {
      const board = parseCards(str)
      const runouts = allRunouts(board)
      const classes = runoutClasses(board, runouts, boardSuitPerms(board))
      const seen = new Set<number>()
      let total = 0
      for (const cls of classes) {
        for (const m of cls.members) {
          expect(seen.has(cardId(m.card))).toBe(false)
          seen.add(cardId(m.card))
          total++
        }
      }
      expect(total).toBe(runouts.length)
      for (const r of runouts) expect(seen.has(cardId(r))).toBe(true)
    }
  })

  it('member.card == perm(repr) / repr はクラス内最小 cardId / repr 自身の perm は恒等', () => {
    for (const str of boards) {
      const board = parseCards(str)
      const classes = runoutClasses(board, allRunouts(board), boardSuitPerms(board))
      for (const cls of classes) {
        const minId = Math.min(...cls.members.map(m => cardId(m.card)))
        expect(cardId(cls.repr)).toBe(minId)
        const self = cls.members.find(m => sameCard(m.card, cls.repr))
        expect(self).toBeDefined()
        expect(self!.perm).toEqual(IDENTITY_PERM)
        for (const m of cls.members) {
          expect(sameCard(applyPermToCard(cls.repr, m.perm), m.card)).toBe(true)
        }
      }
    }
  })

  it('クラス数: Th9h5s=36 / Kh9h4h=23 / AhKd7s=49 (群サイズ1=縮約なし)', () => {
    // Th9h5s: h残11 + s残12 が単独、d/c はランクごとにペア13 → 11+12+13=36
    const tt = parseCards('Th 9h 5s')
    expect(runoutClasses(tt, allRunouts(tt), boardSuitPerms(tt))).toHaveLength(36)
    // Kh9h4h: h残10 が単独、s/d/c はランクごとに3枚組13 → 10+13=23
    const mono = parseCards('Kh 9h 4h')
    expect(runoutClasses(mono, allRunouts(mono), boardSuitPerms(mono))).toHaveLength(23)
    const rb = parseCards('Ah Kd 7s')
    expect(runoutClasses(rb, allRunouts(rb), boardSuitPerms(rb))).toHaveLength(49)
  })

  it('ボードを固定しない perm は拒否する', () => {
    const board = parseCards('Th 9h 5s')
    const badPerm: SuitPerm = [1, 0, 2, 3] // s↔h は板を固定しない
    expect(() => runoutClasses(board, allRunouts(board), [IDENTITY_PERM, badPerm])).toThrow()
  })
})

const combo = (a: string, b: string, weight = 1): Combo =>
  ({ cards: [parseCard(a), parseCard(b)], weight })

describe('comboIndexPerm — レンジのスート置換 index', () => {
  // AKs 全4コンボ等 weight。spades はカード順を逆に入れて2枚の順序正規化を検証する。
  const aks: Combo[] = [
    combo('Ks', 'As'), combo('Ah', 'Kh'), combo('Ad', 'Kd'), combo('Ac', 'Kc'),
  ]

  it('スート対称レンジでは非 null で正しい置換を返す', () => {
    const perm: SuitPerm = [1, 0, 2, 3] // s↔h
    const idx = comboIndexPerm(aks, perm)
    expect(idx).not.toBeNull()
    expect([...idx!]).toEqual([1, 0, 2, 3])
    for (let i = 0; i < aks.length; i++) {
      const mapped = aks[i].cards.map(c => applyPermToCard(c, perm))
      const target = aks[idx![i]].cards
      const match = (sameCard(mapped[0], target[0]) && sameCard(mapped[1], target[1])) ||
        (sameCard(mapped[0], target[1]) && sameCard(mapped[1], target[0]))
      expect(match).toBe(true)
    }
  })

  it('恒等置換は weight に関係なく恒等 index を返す', () => {
    const uneven = [
      combo('Ks', 'As', 0.3), combo('Ah', 'Kh', 1), combo('Ad', 'Kd', 0.7), combo('Ac', 'Kc', 1),
    ]
    const idx = comboIndexPerm(uneven, IDENTITY_PERM)
    expect(idx).not.toBeNull()
    expect([...idx!]).toEqual([0, 1, 2, 3])
  })

  it('weight 非対称 (1コンボだけ変更) は null', () => {
    const uneven = [
      combo('As', 'Ks', 0.5), combo('Ah', 'Kh'), combo('Ad', 'Kd'), combo('Ac', 'Kc'),
    ]
    expect(comboIndexPerm(uneven, [1, 0, 2, 3])).toBeNull()
  })

  it('写し先コンボがレンジに無ければ null', () => {
    const partial = [combo('As', 'Ks'), combo('Ah', 'Kh')]
    expect(comboIndexPerm(partial, [2, 1, 0, 3])).toBeNull() // s→d: AdKd 不在
    expect(comboIndexPerm(partial, [1, 0, 2, 3])).not.toBeNull() // s↔h は閉じている
  })
})

describe('canonicalFlops — 正準フロップ列挙', () => {
  const flops = canonicalFlops()

  it('代表 1,755 件・weight 合計 22,100', () => {
    expect(flops).toHaveLength(1755)
    expect(flops.reduce((s, f) => s + f.weight, 0)).toBe(22100)
  })

  it('全代表が正準形 (再正準化で不動) かつ重複なし', () => {
    const seen = new Set<string>()
    for (const { board, weight } of flops) {
      expect(weight).toBeGreaterThan(0)
      const re = canonicalizeFlop(board)
      for (let i = 0; i < 3; i++) expect(sameCard(re[i], board[i])).toBe(true)
      const key = board.map(c => `${c.rank}${c.suit}`).join('|')
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('既知クラス: AAA は1件 weight4・代表 AsAhAd / ランク{A,K,Q}は5クラス計64', () => {
    const sig = (b: Card[]) => b.map(c => c.rank).join('') // 正準形はランク降順
    const aaa = flops.filter(f => sig(f.board) === 'AAA')
    expect(aaa).toHaveLength(1)
    expect(aaa[0].weight).toBe(4)
    expect(aaa[0].board).toEqual([
      { rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'diamonds' },
    ])
    // AKQ: モノトーン4 + レインボー24 + ツートーン(AKs/AQs/KQs)12×3 = 5クラス・計64
    const akq = flops.filter(f => sig(f.board) === 'AKQ')
    expect(akq).toHaveLength(5)
    expect(akq.reduce((s, f) => s + f.weight, 0)).toBe(64)
  })

  it('任意のフロップの正準形は代表リストに含まれる', () => {
    const keys = new Set(flops.map(f => f.board.map(c => `${c.rank}${c.suit}`).join('|')))
    for (const str of ['Ah Kd 7s', 'Th 9h 5s', 'Kh 9h 4h', 'Qs Qd 6c', '2c 2d 2h']) {
      const canon = canonicalizeFlop(parseCards(str))
      expect(keys.has(canon.map(c => `${c.rank}${c.suit}`).join('|'))).toBe(true)
    }
  })
})
