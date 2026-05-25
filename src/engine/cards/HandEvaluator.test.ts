import { describe, it, expect } from 'vitest'
import { evaluateBestHand, compareHands } from './HandEvaluator'
import { parseCards } from './Card'

describe('HandEvaluator', () => {
  describe('hand rankings', () => {
    it('detects royal flush', () => {
      const cards = parseCards('As Ks Qs Js Ts 2h 3d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('royal_flush')
    })

    it('detects straight flush', () => {
      const cards = parseCards('9s 8s 7s 6s 5s Ah 2d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('straight_flush')
    })

    it('detects four of a kind', () => {
      const cards = parseCards('As Ah Ad Ac Ks 2h 3d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('four_of_a_kind')
    })

    it('detects full house', () => {
      const cards = parseCards('As Ah Ad Ks Kh 2h 3d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('full_house')
    })

    it('detects flush', () => {
      const cards = parseCards('As Ks 9s 6s 2s Ah 3d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('flush')
    })

    it('detects straight', () => {
      const cards = parseCards('9s 8h 7d 6c 5s Ah 2d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('straight')
    })

    it('detects ace-low straight (wheel)', () => {
      const cards = parseCards('Ah 2d 3s 4h 5c Kd 9s')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('straight')
    })

    it('detects three of a kind', () => {
      const cards = parseCards('As Ah Ad Ks 2h 7c 9d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('three_of_a_kind')
    })

    it('detects two pair', () => {
      const cards = parseCards('As Ah Ks Kh 2h 7c 9d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('two_pair')
    })

    it('detects one pair', () => {
      const cards = parseCards('As Ah Ks 2h 7c 9d Td')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('one_pair')
    })

    it('detects high card', () => {
      const cards = parseCards('As Kh Qd 9c 7s 5h 2d')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('high_card')
    })
  })

  describe('hand comparison', () => {
    it('flush beats straight', () => {
      const flush = evaluateBestHand(parseCards('As Ks 9s 6s 2s 8h 4d'))
      const straight = evaluateBestHand(parseCards('9s 8h 7d 6c 5s Ah 2d'))
      expect(compareHands(flush, straight)).toBeLessThan(0) // flush wins (lower = better)
    })

    it('higher pair beats lower pair', () => {
      const aces = evaluateBestHand(parseCards('As Ah 2d 3s 7h 8c Kd'))
      const kings = evaluateBestHand(parseCards('Ks Kh 2d 3s 7h 8c Ad'))
      expect(compareHands(aces, kings)).toBeLessThan(0) // aces win
    })

    it('same hand rank with better kicker wins', () => {
      const akicker = evaluateBestHand(parseCards('Ks Kh As 2d 3h 7c 8d'))
      const qkicker = evaluateBestHand(parseCards('Ks Kh Qs 2d 3h 7c 8d'))
      expect(compareHands(akicker, qkicker)).toBeLessThan(0) // A kicker wins
    })

    it('returns 0 for identical hand strength', () => {
      const h1 = evaluateBestHand(parseCards('As Ah Ks Kh Qs 2d 3c'))
      const h2 = evaluateBestHand(parseCards('As Ah Ks Kh Qs 4d 5c'))
      expect(compareHands(h1, h2)).toBe(0)
    })

    it('full house beats flush', () => {
      const fh = evaluateBestHand(parseCards('As Ah Ad Ks Kh 2d 3c'))
      const fl = evaluateBestHand(parseCards('2s 5s 8s Js Qs Kh Ad'))
      expect(compareHands(fh, fl)).toBeLessThan(0) // full house wins
    })

    it('picks best 5 from 7 cards', () => {
      // Has a straight flush hidden in 7 cards
      const cards = parseCards('9s 8s 7s 6s 5s Ah Kd')
      const result = evaluateBestHand(cards)
      expect(result.rank).toBe('straight_flush')
    })
  })
})
