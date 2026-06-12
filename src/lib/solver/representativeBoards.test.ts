import { describe, it, expect } from 'vitest'
import {
  REPRESENTATIVE_BOARDS, REPRESENTATIVE_SPOTS, representativeHeroCombos,
  representativeBoard, boardCode, precomputePostflopKey,
  REP_FLOP_CAP, REP_TURN_CAP, REP_RIVER_CAP,
} from './representativeBoards'
import { comboKey } from './riverRanges'
import { sameCard } from '../../engine/cards/Card'

describe('REPRESENTATIVE_BOARDS', () => {
  it('contains flop(3) / turn(4) / river(5) cards matching street', () => {
    const cardCount: Record<string, number> = { flop: 3, turn: 4, river: 5 }
    for (const b of REPRESENTATIVE_BOARDS) {
      expect(['flop', 'turn', 'river']).toContain(b.street)
      expect(b.board.length).toBe(cardCount[b.street])
    }
  })
  it('has distinct cards within each board and unique ids', () => {
    const ids = new Set<string>()
    for (const b of REPRESENTATIVE_BOARDS) {
      ids.add(b.id)
      for (let i = 0; i < b.board.length; i++)
        for (let j = i + 1; j < b.board.length; j++)
          expect(sameCard(b.board[i], b.board[j])).toBe(false)
    }
    expect(ids.size).toBe(REPRESENTATIVE_BOARDS.length)
  })
  it('has exactly 10 flop boards matching the precompute-flop script', () => {
    expect(REPRESENTATIVE_BOARDS.filter(b => b.street === 'flop').length).toBe(10)
  })
})

describe('representativeHeroCombos', () => {
  it('yields a non-empty hero range for every SRP spot × board, none colliding with the board', () => {
    for (const b of REPRESENTATIVE_BOARDS) {
      for (const spot of REPRESENTATIVE_SPOTS) {
        const combos = representativeHeroCombos(spot, b.board, b.street)
        expect(combos.length).toBeGreaterThan(0)
        // どのコンボも board と札衝突しない (デッドカード除外済)
        for (const c of combos)
          expect(b.board.some(bc => sameCard(bc, c.cards[0]) || sameCard(bc, c.cards[1]))).toBe(false)
      }
    }
  })
  it('caps flop at REP_FLOP_CAP, turn at REP_TURN_CAP, river at REP_RIVER_CAP', () => {
    const flop  = REPRESENTATIVE_BOARDS.find(b => b.street === 'flop')!
    const turn  = REPRESENTATIVE_BOARDS.find(b => b.street === 'turn')!
    const river = REPRESENTATIVE_BOARDS.find(b => b.street === 'river')!
    expect(representativeHeroCombos('bb-vs-btn', flop.board,  'flop').length).toBeLessThanOrEqual(REP_FLOP_CAP)
    expect(representativeHeroCombos('bb-vs-btn', turn.board,  'turn').length).toBeLessThanOrEqual(REP_TURN_CAP)
    expect(representativeHeroCombos('bb-vs-btn', river.board, 'river').length).toBeLessThanOrEqual(REP_RIVER_CAP)
  })
})

describe('keys', () => {
  it('boardCode serializes rank+suit-initial', () => {
    const b = representativeBoard('river-ahigh-brick')!
    expect(boardCode(b.board)).toBe('AhKd7s2c9h')
  })
  it('precomputePostflopKey = spot__board__phase', () => {
    const b = representativeBoard('turn-ahigh-dry')!
    expect(precomputePostflopKey('bb-vs-btn', b.board, 'lead')).toBe('bb-vs-btn__AhKd7s2c__lead')
  })
})

describe('comboKey alignment', () => {
  it('hero combo keys are stable (sorted) — drill pick will match a table key', () => {
    const b = REPRESENTATIVE_BOARDS[0]
    const combos = representativeHeroCombos('bb-vs-btn', b.board, b.street)
    const keys = new Set(combos.map(c => comboKey(c.cards)))
    expect(keys.size).toBe(combos.length) // 重複なし
  })
})
