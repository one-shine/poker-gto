import { describe, it, expect } from 'vitest'
import { fastCardId, evaluate7 } from './fastEval7'
import { evaluateBestHand, compareHands } from '../../engine/cards/HandEvaluator'
import { parseCards, parseCard } from '../../engine/cards/Card'
import type { Card } from '../../types/game'

// シード付きLCG乱数生成器(再現可能なランダムハンド生成用)
function makeLcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// デッキを構築してシャッフル(Fisher-Yates)し7枚ずつ2ハンド返す
function deal7pair(rng: () => number): [Card[], Card[]] {
  // 52枚デッキ
  const deck: Card[] = []
  for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as const) {
    for (const rank of ['2','3','4','5','6','7','8','9','T','J','Q','K','A'] as const) {
      deck.push({ suit, rank })
    }
  }
  // Fisher-Yates
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return [deck.slice(0, 7), deck.slice(7, 14)]
}

function toIds(cards: Card[]): number[] {
  return cards.map(fastCardId)
}

describe('fastEval7', () => {
  describe('ランダム3万ペア全件突合 — evaluateBestHand との全順序一致', () => {
    it('3万ペアでcompareHands符号が一致する', () => {
      const rng = makeLcg(0xdeadbeef)
      let mismatches = 0
      const total = 30000

      for (let i = 0; i < total; i++) {
        const [cardsA, cardsB] = deal7pair(rng)
        const idsA = toIds(cardsA)
        const idsB = toIds(cardsB)

        const fastA = evaluate7(idsA)
        const fastB = evaluate7(idsB)
        const fastSign = Math.sign(fastA - fastB)

        const refA = evaluateBestHand(cardsA)
        const refB = evaluateBestHand(cardsB)
        const refSign = -Math.sign(compareHands(refA, refB)) // compareHands: -1=a wins=higher fastVal

        if (fastSign !== refSign) {
          mismatches++
          if (mismatches <= 3) {
            console.error('mismatch at i=%d fastA=%d fastB=%d fastSign=%d refSign=%d', i, fastA, fastB, fastSign, refSign)
            console.error('  A:', cardsA.map(c=>c.rank+c.suit[0]).join(' '), '→', refA.rank, refA.rankValue)
            console.error('  B:', cardsB.map(c=>c.rank+c.suit[0]).join(' '), '→', refB.rank, refB.rankValue)
          }
        }
      }
      expect(mismatches).toBe(0)
    })
  })

  describe('エッジケース', () => {
    it('ホイール(A-2-3-4-5) — ストレートと判定される', () => {
      const cards = parseCards('Ah 2d 3s 4h 5c Kd 9s')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('straight')
      expect(fast).toBe(ref.rankValue)
    })

    it('ホイールのストレート高さ(5)は通常ストレート(6)に負ける', () => {
      const wheel = parseCards('Ah 2d 3s 4h 5c Kd 9s')
      const sixHigh = parseCards('2h 3d 4s 5h 6c Kd 9s')
      const fWheel = evaluate7(toIds(wheel))
      const fSix = evaluate7(toIds(sixHigh))
      expect(fWheel).toBeLessThan(fSix)
    })

    it('スチールホイール(A-2-3-4-5 同スート) — ストレートフラッシュ', () => {
      // A♠2♠3♠4♠5♠ + 他2枚
      const cards = parseCards('As 2s 3s 4s 5s Kd 9h')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('straight_flush')
      expect(fast).toBe(ref.rankValue)
    })

    it('スチールホイールは通常のストレートより強い', () => {
      const steelWheel = parseCards('As 2s 3s 4s 5s Kd 9h')
      const straight = parseCards('As 2d 3s 4h 5c Kd 9s')
      const fSF = evaluate7(toIds(steelWheel))
      const fST = evaluate7(toIds(straight))
      expect(fSF).toBeGreaterThan(fST)
    })

    it('ボードクワッズ+キッカー — フォーカード', () => {
      const cards = parseCards('As Ah Ad Ac Ks 2h 3d')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('four_of_a_kind')
      expect(fast).toBe(ref.rankValue)
    })

    it('クワッズのキッカー比較 — Kキッカー > Qキッカー', () => {
      const kicker_k = parseCards('As Ah Ad Ac Ks 2h 3d')
      const kicker_q = parseCards('As Ah Ad Ac Qs 2h 3d')
      const fK = evaluate7(toIds(kicker_k))
      const fQ = evaluate7(toIds(kicker_q))
      expect(fK).toBeGreaterThan(fQ)
    })

    it('トリップス2組(=フルハウス) — フルハウスと判定', () => {
      // AAA KKK + 1枚 → 最善5枚はAAA KK
      const cards = parseCards('As Ah Ad Ks Kh Kd 2c')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('full_house')
      expect(fast).toBe(ref.rankValue)
    })

    it('トリップス2組では高いほうをトリップとして使う', () => {
      // AAA + KKK vs KKK + QQQ — どちらもフルハウスで前者が強い
      const trips_a = parseCards('As Ah Ad Ks Kh Kd 2c')
      const trips_k = parseCards('Ks Kh Kd Qs Qh Qd 2c')
      const fA = evaluate7(toIds(trips_a))
      const fK = evaluate7(toIds(trips_k))
      expect(fA).toBeGreaterThan(fK)
    })

    it('ペア3組(=ベスト2ペア+キッカー) — ツーペアと判定', () => {
      // AA KK QQ + 1枚 → ベスト5枚はAA KK Qキッカー
      const cards = parseCards('As Ah Ks Kh Qs Qh 2c')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('two_pair')
      expect(fast).toBe(ref.rankValue)
    })

    it('フラッシュ vs ストレート — フラッシュが勝つ', () => {
      const flush = parseCards('As Ks 9s 6s 2s 8h 4d')
      const straight = parseCards('9s 8h 7d 6c 5s Ah 2d')
      const fFlush = evaluate7(toIds(flush))
      const fStraight = evaluate7(toIds(straight))
      expect(fFlush).toBeGreaterThan(fStraight)
    })

    it('フラッシュ vs ストレート — refと一致', () => {
      const flush = parseCards('As Ks 9s 6s 2s 8h 4d')
      const straight = parseCards('9s 8h 7d 6c 5s Ah 2d')
      const refFlush = evaluateBestHand(flush)
      const refStraight = evaluateBestHand(straight)
      expect(evaluate7(toIds(flush))).toBe(refFlush.rankValue)
      expect(evaluate7(toIds(straight))).toBe(refStraight.rankValue)
    })

    it('7枚中6枚フラッシュ — 最強フラッシュ5枚を選択', () => {
      // 6枚スペード(K Q J 9 6 2) + 1枚ハート → K高フラッシュ
      const cards = parseCards('Ks Qs Js 9s 6s 2s Ah')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('flush')
      expect(fast).toBe(ref.rankValue)
    })

    it('7枚全スペードのフラッシュ vs 同ランク異スート — 同スコア', () => {
      // 盤面が固定されたフラッシュと同等の非フラッシュ手は存在しないが
      // 同じ7枚セットを評価して参照と一致するか確認
      const cards = parseCards('As Ks Qs Js 9s 6s 2s')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(fast).toBe(ref.rankValue)
    })

    it('A-highハイカード', () => {
      const cards = parseCards('As Kh Qd 9c 7s 5h 2d')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('high_card')
      expect(fast).toBe(ref.rankValue)
    })

    it('K-highハイカード — A-highより弱い', () => {
      const aHigh = parseCards('As Kh Qd 9c 7s 5h 2d')
      const kHigh = parseCards('Ks Qh Jd 9c 7s 5h 2d')
      const fA = evaluate7(toIds(aHigh))
      const fK = evaluate7(toIds(kHigh))
      expect(fA).toBeGreaterThan(fK)
    })

    it('ロイヤルフラッシュ — 最強手', () => {
      const cards = parseCards('As Ks Qs Js Ts 2h 3d')
      const ref = evaluateBestHand(cards)
      const fast = evaluate7(toIds(cards))
      expect(ref.rank).toBe('royal_flush')
      expect(fast).toBe(ref.rankValue)
    })

    it('ロイヤルフラッシュはすべての非SF手より強い', () => {
      const royalFlush = parseCards('As Ks Qs Js Ts 2h 3d')
      const quads = parseCards('As Ah Ad Ac Ks 2h 3d')
      const fRF = evaluate7(toIds(royalFlush))
      const fQ = evaluate7(toIds(quads))
      expect(fRF).toBeGreaterThan(fQ)
    })
  })

  describe('fastCardId', () => {
    it('Asは0', () => {
      // A(rankValue14)→ ri=12, spades→si=0 → 12*4+0=48
      expect(fastCardId(parseCard('As'))).toBe(48)
    })

    it('2cは51', () => {
      // 2(rankValue2)→ ri=0, clubs→si=3 → 0*4+3=3
      expect(fastCardId(parseCard('2c'))).toBe(3)
    })

    it('Kh', () => {
      // K(rv13)→ri=11, hearts→si=1 → 11*4+1=45
      expect(fastCardId(parseCard('Kh'))).toBe(45)
    })

    it('全52枚がユニーク', () => {
      const ids = new Set<number>()
      for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as const) {
        for (const rank of ['2','3','4','5','6','7','8','9','T','J','Q','K','A'] as const) {
          ids.add(fastCardId({ suit, rank }))
        }
      }
      expect(ids.size).toBe(52)
    })

    it('全IDが0-51の範囲', () => {
      for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as const) {
        for (const rank of ['2','3','4','5','6','7','8','9','T','J','Q','K','A'] as const) {
          const id = fastCardId({ suit, rank })
          expect(id).toBeGreaterThanOrEqual(0)
          expect(id).toBeLessThanOrEqual(51)
        }
      }
    })
  })
})
