import { describe, it, expect } from 'vitest'
import { PREFLOP_SCENARIOS } from './preflop'
import { rangeStats } from '../../lib/ranges/rangeStats'

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const HAND_RE = /^([AKQJT2-9])\1$|^([AKQJT2-9])([AKQJT2-9])(s|o)$/

describe('PREFLOP_SCENARIOS', () => {
  it('covers the expected 31 spots with unique ids', () => {
    const ids = PREFLOP_SCENARIOS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length) // 重複なし
    // R2 facing-3bet (BTN/CO opener) + UTG/MP/SB opener facing-3bet (3bet EV 拡張)
    // 2026-06-07: 単独オープン HU 防御の未収録 4 対 (mp-vs-utg/co-vs-mp/sb-vs-utg/sb-vs-mp) を追加。
    for (const id of [
      'sb-vs-co', 'btn-vs-utg', 'btn-vs-mp', 'co-vs-utg',
      'mp-vs-utg', 'co-vs-mp', 'sb-vs-utg', 'sb-vs-mp',
      'btn-vs-sb-3bet', 'btn-vs-bb-3bet', 'co-vs-sb-3bet', 'co-vs-bb-3bet', 'co-vs-btn-3bet',
      'utg-vs-bb-3bet', 'utg-vs-btn-3bet', 'utg-vs-co-3bet', 'mp-vs-bb-3bet', 'mp-vs-btn-3bet', 'sb-vs-bb-3bet',
    ]) {
      expect(ids).toContain(id)
    }
    expect(PREFLOP_SCENARIOS.length).toBe(31)
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
    for (const id of ['sb-vs-btn', 'sb-vs-co', 'sb-vs-utg', 'sb-vs-mp']) {
      const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
      const totalCall = Object.values(sc.cells).reduce((a, c) => a + c.call, 0)
      expect(totalCall, `${id} はフラットしない`).toBe(0)
    }
  })

  it('IP defenders (BTN/CO vs X) mix calls and 3bets', () => {
    for (const id of ['btn-vs-utg', 'btn-vs-mp', 'co-vs-utg', 'mp-vs-utg', 'co-vs-mp']) {
      const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
      const cells = Object.values(sc.cells)
      expect(cells.some(c => c.call > 0), `${id} はフラットを含む`).toBe(true)
      expect(cells.some(c => c.raise > 0), `${id} は3betを含む`).toBe(true)
    }
  })

  // R11: ドリフトガード。各スポットの combo比 widthPct (RangesPage「レンジ比較」が表示する権威メトリクス)
  // を preflop.ts の見出しコメント値に固定。頻度を編集してコメントと乖離させたら落ちる = 両者を必ず同期させる。
  it('combo-weighted width matches the documented per-spot comments (drift guard)', () => {
    const EXPECTED: Record<string, number> = {
      'btn-open': 0.368, 'co-open': 0.247, 'mp-open': 0.176, 'utg-open': 0.134, 'sb-open': 0.497,
      'bb-vs-btn': 0.430, 'bb-vs-sb': 0.250, 'bb-vs-utg': 0.166, 'bb-vs-mp': 0.219, 'bb-vs-co': 0.268,
      'sb-vs-btn': 0.069, 'btn-vs-co': 0.164, 'sb-vs-co': 0.057, 'btn-vs-utg': 0.110,
      'btn-vs-mp': 0.146, 'co-vs-utg': 0.087,
      'mp-vs-utg': 0.073, 'co-vs-mp': 0.118, 'sb-vs-utg': 0.044, 'sb-vs-mp': 0.052,
      'btn-vs-sb-3bet': 0.066, 'btn-vs-bb-3bet': 0.077, 'co-vs-sb-3bet': 0.056,
      'co-vs-bb-3bet': 0.064, 'co-vs-btn-3bet': 0.047,
      'utg-vs-bb-3bet': 0.117, 'utg-vs-btn-3bet': 0.108, 'utg-vs-co-3bet': 0.110,
      'mp-vs-bb-3bet': 0.069, 'mp-vs-btn-3bet': 0.045, 'sb-vs-bb-3bet': 0.083,
    }
    for (const sc of PREFLOP_SCENARIOS) {
      const want = EXPECTED[sc.id]
      expect(want, `${sc.id} は EXPECTED に登録が必要 (新スポットはコメント%とここを同時更新)`).toBeDefined()
      const got = rangeStats(sc).widthPct
      expect(Math.abs(got - want), `${sc.id} combo比=${(got * 100).toFixed(1)}% が文書値 ${(want * 100).toFixed(1)}% と乖離`).toBeLessThan(0.025)
    }
  })

  it('facing-3bet spots: AA always 4bets, mix call+4bet, and raiseSize reflects the 3bet', () => {
    for (const id of ['btn-vs-sb-3bet', 'btn-vs-bb-3bet', 'co-vs-sb-3bet', 'co-vs-bb-3bet', 'co-vs-btn-3bet',
      'utg-vs-bb-3bet', 'utg-vs-btn-3bet', 'utg-vs-co-3bet', 'mp-vs-bb-3bet', 'mp-vs-btn-3bet', 'sb-vs-bb-3bet']) {
      const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
      expect(sc.cells['AA'].raise, `${id} AA は 4bet`).toBe(1)
      const cells = Object.values(sc.cells)
      expect(cells.some(c => c.call > 0), `${id} はコールを含む`).toBe(true)
      expect(cells.some(c => c.raise > 0 && c.raise < 1), `${id} は混合4betを含む`).toBe(true)
      expect(sc.raiseSize, `${id} の raiseSize は 3bet サイズ`).toBeGreaterThan(2.5)
    }
  })
})
