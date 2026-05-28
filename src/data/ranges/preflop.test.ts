import { describe, it, expect } from 'vitest'
import { PREFLOP_SCENARIOS } from './preflop'

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const HAND_RE = /^([AKQJT2-9])\1$|^([AKQJT2-9])([AKQJT2-9])(s|o)$/

describe('PREFLOP_SCENARIOS', () => {
  it('covers the expected 21 spots with unique ids', () => {
    const ids = PREFLOP_SCENARIOS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length) // 重複なし
    // R2 で追加した defender / facing-3bet スポットが含まれる
    for (const id of [
      'sb-vs-co', 'btn-vs-utg', 'btn-vs-mp', 'co-vs-utg',
      'btn-vs-sb-3bet', 'btn-vs-bb-3bet', 'co-vs-sb-3bet', 'co-vs-bb-3bet', 'co-vs-btn-3bet',
    ]) {
      expect(ids).toContain(id)
    }
    expect(PREFLOP_SCENARIOS.length).toBe(21)
  })

  it('every cell has valid frequencies that sum to ~1 with non-negative fold', () => {
    for (const sc of PREFLOP_SCENARIOS) {
      for (const [hand, cell] of Object.entries(sc.cells)) {
        const where = `${sc.id}/${hand}`
        expect(HAND_RE.test(hand), `${where} は正しいハンド表記`).toBe(true)
        for (const f of [cell.raise, cell.call, cell.fold]) {
          expect(f, where).toBeGreaterThanOrEqual(0)
          expect(f, where).toBeLessThanOrEqual(1)
        }
        const sum = cell.raise + cell.call + cell.fold
        expect(Math.abs(sum - 1), `${where} の頻度合計=1`).toBeLessThan(0.011)
      }
    }
  })

  it('uses a known rank for both hole-card slots', () => {
    for (const sc of PREFLOP_SCENARIOS) {
      for (const hand of Object.keys(sc.cells)) {
        expect(RANKS).toContain(hand[0])
        expect(RANKS).toContain(hand[1])
      }
    }
  })

  it('OOP defenders (SB vs X) are 3bet-or-fold: no flat calls', () => {
    for (const id of ['sb-vs-btn', 'sb-vs-co']) {
      const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
      const totalCall = Object.values(sc.cells).reduce((a, c) => a + c.call, 0)
      expect(totalCall, `${id} はフラットしない`).toBe(0)
    }
  })

  it('IP defenders (BTN/CO vs X) mix calls and 3bets', () => {
    for (const id of ['btn-vs-utg', 'btn-vs-mp', 'co-vs-utg']) {
      const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
      const cells = Object.values(sc.cells)
      expect(cells.some(c => c.call > 0), `${id} はフラットを含む`).toBe(true)
      expect(cells.some(c => c.raise > 0), `${id} は3betを含む`).toBe(true)
    }
  })

  it('facing-3bet spots: AA always 4bets, mix call+4bet, and raiseSize reflects the 3bet', () => {
    for (const id of ['btn-vs-sb-3bet', 'btn-vs-bb-3bet', 'co-vs-sb-3bet', 'co-vs-bb-3bet', 'co-vs-btn-3bet']) {
      const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
      expect(sc.cells['AA'].raise, `${id} AA は 4bet`).toBe(1)
      const cells = Object.values(sc.cells)
      expect(cells.some(c => c.call > 0), `${id} はコールを含む`).toBe(true)
      expect(cells.some(c => c.raise > 0 && c.raise < 1), `${id} は混合4betを含む`).toBe(true)
      expect(sc.raiseSize, `${id} の raiseSize は 3bet サイズ`).toBeGreaterThan(2.5)
    }
  })
})
