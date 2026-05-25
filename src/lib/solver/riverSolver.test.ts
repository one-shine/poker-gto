import { describe, it, expect } from 'vitest'
import { solveRiver, type Combo } from './riverSolver'
import type { Card, Rank, Suit } from '../../types/game'

const c = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })
const combo = (a: Card, b: Card, weight = 1): Combo => ({ cards: [a, b], weight })

// ドライボード A♠ K♦ 7♣ 3♥ 2♠ (フラッシュ/ストレート無し)
const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
const NUTS = combo(c('A', 'hearts'), c('A', 'clubs'))   // セットのA (最強)
const AIR = combo(c('Q', 'hearts'), c('J', 'hearts'))   // クイーンハイ (最弱)
const BLUFFCATCHER = combo(c('9', 'diamonds'), c('9', 'clubs')) // ポケット9 (中)

// ルート(OOP)戦略から、指定コンボのアクション頻度を取り出す
function freq(strat: ReturnType<typeof solveRiver>['oopRootStrategy'], comboIdx: number, action: string): number {
  return strat[comboIdx].filter(a => a.action === action).reduce((s, a) => s + a.frequency, 0)
}

describe('solveRiver (HU river CFR)', () => {
  it('a pure-air range rarely bets (bluffing 0% value is unprofitable)', () => {
    // OOP がエア単独 → 相手(9)は常にコール → ブラフは損 → ほぼチェック
    const sol = solveRiver({
      board, oop: [AIR], ip: [BLUFFCATCHER], potBB: 10, stackBB: 100, betSizes: [0.66], iterations: 800,
    })
    expect(freq(sol.oopRootStrategy, 0, 'bet')).toBeLessThan(0.3)
  })

  it('polarized OOP bets value more than air, and bluffs a non-zero amount', () => {
    const sol = solveRiver({
      board, oop: [NUTS, AIR], ip: [BLUFFCATCHER], potBB: 10, stackBB: 100, betSizes: [0.75], iterations: 1500,
    })
    const valueBet = freq(sol.oopRootStrategy, 0, 'bet')
    const airBet = freq(sol.oopRootStrategy, 1, 'bet')
    expect(valueBet).toBeGreaterThan(airBet)        // バリュー > ブラフ
    expect(valueBet).toBeGreaterThan(0.6)            // バリューは高頻度ベット
    expect(airBet).toBeGreaterThan(0.01)             // ブラフは0ではない (混合)
    expect(airBet).toBeLessThan(0.9)                 // 常時ブラフではない
  })

  it('computes per-action EV (value hand prefers betting/checking over a losing line)', () => {
    const sol = solveRiver({
      board, oop: [NUTS, AIR], ip: [BLUFFCATCHER], potBB: 10, stackBB: 100, betSizes: [0.75], iterations: 1500,
    })
    // NUTS(combo 0): ベットの EV はプラス方向 (相手のコールから価値を得る)。EV が数値で入っている。
    const nutsBet = sol.oopRootStrategy[0].find(a => a.action === 'bet')!
    const nutsCheck = sol.oopRootStrategy[0].find(a => a.action === 'check')!
    expect(Number.isFinite(nutsBet.ev)).toBe(true)
    expect(Number.isFinite(nutsCheck.ev)).toBe(true)
    // 均衡では採用される(頻度>0)アクション同士の EV はほぼ等しい(無差別)。NUTSのベットEVは正。
    expect(nutsBet.ev).toBeGreaterThan(0)
  })

  it('solves a TURN spot (4-card board, runout-averaged equity) — polarized bets value > air', () => {
    // ターン As Kd 7c 3h。OOP: セットA(高エクイティ) + エア。IP: 中ペア(ブラフキャッチャー)。
    const turnBoard: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts')]
    const t0 = performance.now()
    const sol = solveRiver({
      board: turnBoard,
      oop: [combo(c('A', 'hearts'), c('A', 'clubs')), combo(c('Q', 'hearts'), c('J', 'hearts'))],
      ip: [combo(c('9', 'diamonds'), c('9', 'clubs'))],
      potBB: 10, stackBB: 100, betSizes: [0.75], iterations: 800,
    })
    const ms = performance.now() - t0
    const valueBet = freq(sol.oopRootStrategy, 0, 'bet')
    const airBet = freq(sol.oopRootStrategy, 1, 'bet')
    expect(valueBet).toBeGreaterThan(airBet)         // バリュー(セット) > エア
    expect(sol.oopRootStrategy[0].every(a => Number.isFinite(a.ev))).toBe(true)
    expect(ms).toBeLessThan(3000)                     // ターン1スポットは数秒以内
  })

  it('exploitability decreases with more iterations and is small when converged', () => {
    const args = {
      board, oop: [NUTS, AIR], ip: [BLUFFCATCHER], potBB: 10, stackBB: 100, betSizes: [0.75] as number[],
    }
    const low = solveRiver({ ...args, iterations: 20 })
    const high = solveRiver({ ...args, iterations: 2000 })
    expect(high.exploitability).toBeLessThanOrEqual(low.exploitability) // 反復↑で収束
    expect(high.exploitability).toBeLessThan(0.05) // 収束時は pot の 5%未満
    expect(high.exploitability).toBeGreaterThanOrEqual(0)
  })

  it('each combo strategy sums to ~1', () => {
    const sol = solveRiver({
      board, oop: [NUTS, AIR], ip: [BLUFFCATCHER], potBB: 10, stackBB: 100, iterations: 300,
    })
    for (const combos of sol.oopRootStrategy) {
      const sum = combos.reduce((s, a) => s + a.frequency, 0)
      expect(sum).toBeCloseTo(1, 5)
    }
  })
})
