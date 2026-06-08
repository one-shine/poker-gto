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
      'bb-vs-btn': 0.430, 'bb-vs-sb': 0.250, 'bb-vs-utg': 0.168, 'bb-vs-mp': 0.219, 'bb-vs-co': 0.268,
      'sb-vs-btn': 0.063, 'btn-vs-co': 0.167, 'sb-vs-co': 0.053, 'btn-vs-utg': 0.113,
      'btn-vs-mp': 0.148, 'co-vs-utg': 0.091,
      'mp-vs-utg': 0.076, 'co-vs-mp': 0.119, 'sb-vs-utg': 0.041, 'sb-vs-mp': 0.049,
      'btn-vs-sb-3bet': 0.063, 'btn-vs-bb-3bet': 0.073, 'co-vs-sb-3bet': 0.054,
      'co-vs-bb-3bet': 0.060, 'co-vs-btn-3bet': 0.044,
      'utg-vs-bb-3bet': 0.115, 'utg-vs-btn-3bet': 0.106, 'utg-vs-co-3bet': 0.108,
      'mp-vs-bb-3bet': 0.066, 'mp-vs-btn-3bet': 0.043, 'sb-vs-bb-3bet': 0.078,
    }
    for (const sc of PREFLOP_SCENARIOS) {
      const want = EXPECTED[sc.id]
      expect(want, `${sc.id} は EXPECTED に登録が必要 (新スポットはコメント%とここを同時更新)`).toBeDefined()
      const got = rangeStats(sc).widthPct
      expect(Math.abs(got - want), `${sc.id} combo比=${(got * 100).toFixed(1)}% が文書値 ${(want * 100).toFixed(1)}% と乖離`).toBeLessThan(0.025)
    }
  })

  // 飛び石ガード: continue 列 (raise+call>0) の「中抜け」を検出する。各キッカー走
  // (固定ハイランク × suited/offsuit) で、より弱いキッカーが continue しているのに自身が
  // continue=0 のセルがあれば飛び石 = fail。raise/call の内訳は問わない (ホイールの 3bet
  // バンプを誤検出しないため総 continue で判定)。最下端の fold は走の外なので flag しない。
  // U28: ポラライズ系(SB 3bet-or-fold・*-3bet)の A6s-A9s も視覚連続化で低頻度充填済のため
  // 全スポット・全走を検査する(allowlist なし)。中抜けを作り直したら必ず落ちる。
  it('no fold-hole inside a continuing kicker run (飛び石ガード)', () => {
    const holes: string[] = []
    for (const sc of PREFLOP_SCENARIOS) {
      for (let h = 0; h < RANKS.length; h++) {
        for (const suit of ['s', 'o'] as const) {
          const run = RANKS.slice(h + 1).map(low => RANKS[h] + low + suit)
          const cont = run.map(hand => {
            const c = sc.cells[hand]
            return c ? c.raise + c.call : 0
          })
          let last = -1
          for (let i = 0; i < cont.length; i++) if (cont[i] > 0) last = i
          for (let i = 0; i < last; i++) {
            if (cont[i] === 0) holes.push(`${sc.id}/${run[i]} (弱い ${run[last]} は continue)`)
          }
        }
      }
    }
    expect(holes, `continue 列の中抜け (飛び石):\n${holes.join('\n')}`).toEqual([])
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
