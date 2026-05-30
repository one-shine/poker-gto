import { describe, it, expect } from 'vitest'
import { solveFlop } from './flopSolver'
import { solveRiver, type Combo } from './riverSolver'
import type { Card, Rank, Suit } from '../../types/game'

const c = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })
const combo = (a: Card, b: Card, w = 1): Combo => ({ cards: [a, b], weight: w })
const bestEv = (strat: ReturnType<typeof solveFlop>['oopRootStrategy'], i: number) =>
  Math.max(...strat[i].map(a => a.ev))

describe('flopSolver — 3街・2チャンス層 CFR', () => {
  // ドライフロップ As Kd 7c。OOP: トリップ材料(AhAc=set) + エア。IP: 中ペア。
  const flop: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs')]
  const VALUE = combo(c('A', 'hearts'), c('A', 'clubs'))   // セットのA
  const AIR = combo(c('Q', 'hearts'), c('J', 'hearts'))    // ブロードウェイドロー寄りのエア
  const MID = combo(c('9', 'diamonds'), c('9', 'clubs'))   // ブラフキャッチャー

  it('グラウンドトゥルース: ベッティング無し flop チャンス CFR = flop equity 近似 (riverSolver board=3)', () => {
    // betSizes=[] → 全街チェックダウン。flop の2層チャンス平均(turn×river 全列挙)は
    // riverSolver の flop 近似(全ランナウトペア平均エクイティ)と一致するはず。
    // 3街会計(potAfter/half/committed の畳み込み・カード除去の合成)の直接検証。
    const base = { board: flop, oop: [VALUE, AIR], ip: [MID], potBB: 6, stackBB: 100, betSizes: [] as number[] }
    const approx = solveRiver({ ...base, iterations: 1, runoutSamples: 3000 }) // 全1081ペア(>サンプル数)
    const flopSol = solveFlop({ ...base, iterations: 1 }) // turn×river 全列挙(49×48)
    for (let i = 0; i < 2; i++) {
      const a = approx.oopRootStrategy[i].find(x => x.action === 'check')!.ev
      const b = flopSol.oopRootStrategy[i].find(x => x.action === 'check')!.ev
      expect(b).toBeCloseTo(a, 2)
    }
  })

  it('分極化: バリュー(セット)はエアより root ベスト EV が高い・全 EV 有限', () => {
    const sol = solveFlop({
      board: flop, oop: [VALUE, AIR], ip: [MID],
      potBB: 6, stackBB: 100, betSizes: [0.66], raiseSizes: [0.5],
      iterations: 40, turnRunoutN: 6, riverRunoutN: 6,
    })
    expect(bestEv(sol.oopRootStrategy, 0)).toBeGreaterThan(bestEv(sol.oopRootStrategy, 1))
    expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
  })

  it('各コンボの戦略頻度は ~1 に正規化', () => {
    const sol = solveFlop({
      board: flop, oop: [VALUE, AIR], ip: [MID],
      potBB: 6, stackBB: 100, betSizes: [0.66], iterations: 30, turnRunoutN: 6, riverRunoutN: 6,
    })
    for (const acts of sol.oopRootStrategy) {
      expect(acts.reduce((s, a) => s + a.frequency, 0)).toBeCloseTo(1, 5)
    }
  })

  it('exploitability は反復で減少し収束時 < 12% pot (2チャンス層サンプリングのためやや緩い)', () => {
    const args = {
      board: flop, oop: [VALUE, AIR], ip: [MID],
      potBB: 6, stackBB: 100, betSizes: [0.66] as number[], raiseSizes: [0.5] as number[],
      turnRunoutN: 8, riverRunoutN: 8,
    }
    const low = solveFlop({ ...args, iterations: 15 })
    const high = solveFlop({ ...args, iterations: 120 })
    expect(high.exploitability).toBeLessThanOrEqual(low.exploitability + 1e-6)
    expect(high.exploitability).toBeLessThan(0.12)
    expect(high.exploitability).toBeGreaterThanOrEqual(0)
  })

  it('R14② 同様の主眼: ベッティング織り込みで flop 解がエクイティ近似と乖離', () => {
    const base = {
      board: flop, oop: [VALUE, AIR], ip: [MID],
      potBB: 6, stackBB: 100, betSizes: [0.66] as number[], raiseSizes: [0.5] as number[],
    }
    const approxEv = Math.max(...solveRiver({ ...base, iterations: 1, runoutSamples: 200 }).oopRootStrategy[0].map(a => a.ev))
    const flopEv = bestEv(solveFlop({ ...base, iterations: 60, turnRunoutN: 8, riverRunoutN: 8 }).oopRootStrategy, 0)
    expect(Number.isFinite(flopEv)).toBe(true)
    expect(Math.abs(flopEv - approxEv)).toBeGreaterThan(0.05)
  })

  it('カード除去の合成: turn/river 札と衝突する手が混じっても EV 有限 (subsample 各種)', () => {
    // OOP にスペードのドローを含め、turn/river のスペードで除去が多発しても健全。
    const wet: Card[] = [c('K', 'spades'), c('8', 'spades'), c('5', 'hearts')]
    const oop = [combo(c('A', 'spades'), c('4', 'spades')), combo(c('K', 'diamonds'), c('Q', 'clubs'))]
    const ip = [combo(c('9', 'hearts'), c('9', 'diamonds'))]
    for (const [tN, rN] of [[2, 2], [4, 6], [8, 8]] as const) {
      const sol = solveFlop({
        board: wet, oop, ip, potBB: 6, stackBB: 100, betSizes: [0.66], iterations: 20,
        turnRunoutN: tN, riverRunoutN: rN,
      })
      expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
    }
  })
})
