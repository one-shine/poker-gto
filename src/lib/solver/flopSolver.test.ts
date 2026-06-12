import { describe, it, expect } from 'vitest'
import { solveFlop } from './flopSolver'
import { solveRiver, type Combo } from './riverSolver'
import { capRangeSuitClosed } from './rangeNarrowing'
import { boardSuitPerms } from './suitIsomorphism'
import { parseCard, parseCards } from '../../engine/cards/Card'
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

  it('cfrOpts(linearAveraging + dcfr)の opt-in 経路でも整合した解 (eq dedup と併用)', () => {
    const sol = solveFlop({
      board: flop, oop: [VALUE, AIR], ip: [MID],
      potBB: 6, stackBB: 100, betSizes: [0.66], raiseSizes: [0.5],
      iterations: 30, turnRunoutN: 6, riverRunoutN: 6,
      cfrOpts: { linearAveraging: true, dcfr: { alpha: 1.5, beta: 0, gamma: 2 } },
    })
    for (const acts of sol.oopRootStrategy) {
      expect(acts.reduce((s, a) => s + a.frequency, 0)).toBeCloseTo(1, 5)
    }
    expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
    expect(sol.exploitability).toBeGreaterThanOrEqual(0)
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

describe('suitIso — スート同型ランナウト縮約 (verify-iso)', () => {
  const SUIT_CHARS = ['s', 'h', 'd', 'c'] as const
  const pairCombos = (rank: string, weight = 1): Combo[] => {
    const out: Combo[] = []
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        out.push({ cards: [parseCard(rank + SUIT_CHARS[i]), parseCard(rank + SUIT_CHARS[j])], weight })
      }
    }
    return out
  }
  const suitedCombos = (r1: string, r2: string, weight = 1): Combo[] =>
    SUIT_CHARS.map(s => ({ cards: [parseCard(r1 + s), parseCard(r2 + s)] as [Card, Card], weight }))

  // 全列挙 (turn 49 × river 48) で on/off の解は数学的に同一 (fp 加算順のみ異なる)。
  const solveBoth = (boardStr: string, oopRaw: Combo[], ipRaw: Combo[]) => {
    const board = parseCards(boardStr)
    const perms = boardSuitPerms(board)
    const oop = capRangeSuitClosed(oopRaw, 8, perms) // 縮約の前提=置換閉性を保って cap
    const ip = capRangeSuitClosed(ipRaw, 8, perms)
    const base = { board, oop, ip, potBB: 6, stackBB: 100, betSizes: [0.66], iterations: 16 }
    return { off: solveFlop(base), on: solveFlop({ ...base, suitIso: true }) }
  }
  const maxFreqDiff = (a: ReturnType<typeof solveFlop>, b: ReturnType<typeof solveFlop>) => {
    let linf = 0
    for (let i = 0; i < a.oopRootStrategy.length; i++) {
      for (let k = 0; k < a.oopRootStrategy[i].length; k++) {
        linf = Math.max(linf, Math.abs(a.oopRootStrategy[i][k].frequency - b.oopRootStrategy[i][k].frequency))
      }
    }
    return linf
  }

  it('two-tone Th9h5s: on/off で exploitability 差と root 戦略 L∞ 差 < 1e-3', () => {
    const { off, on } = solveBoth(
      'Th 9h 5s',
      [...pairCombos('A'), ...suitedCombos('K', 'Q', 0.8)],
      [...pairCombos('Q'), ...suitedCombos('A', 'J', 0.8)],
    )
    expect(Math.abs(off.exploitability - on.exploitability)).toBeLessThan(1e-3)
    expect(maxFreqDiff(off, on)).toBeLessThan(1e-3)
  })

  it('monotone Kh9h4h: on/off で exploitability 差と root 戦略 L∞ 差 < 1e-3', () => {
    const { off, on } = solveBoth(
      'Kh 9h 4h',
      [...pairCombos('Q'), ...suitedCombos('A', 'J', 0.8)],
      [...pairCombos('8'), ...suitedCombos('A', 'Q', 0.8)],
    )
    expect(Math.abs(off.exploitability - on.exploitability)).toBeLessThan(1e-3)
    expect(maxFreqDiff(off, on)).toBeLessThan(1e-3)
  })

  it('レインボー (置換群=恒等のみ) は縮約余地なし → 従来動作と完全一致', () => {
    const board = parseCards('Ah Kd 7s')
    const oop = [...pairCombos('Q'), ...suitedCombos('J', 'T', 0.8)]
    const ip = pairCombos('9')
    const base = { board, oop, ip, potBB: 6, stackBB: 100, betSizes: [0.66], iterations: 10, turnRunoutN: 4, riverRunoutN: 4 }
    const off = solveFlop(base)
    const on = solveFlop({ ...base, suitIso: true })
    expect(on.oopRootStrategy).toEqual(off.oopRootStrategy)
    expect(on.nodes).toEqual(off.nodes)
    expect(on.exploitability).toBe(off.exploitability)
  })

  it('スート非対称レンジ (weight 不一致) は安全弁で従来動作へフォールバック → 完全一致', () => {
    const board = parseCards('Th 9h 5s') // 群サイズ2 だがレンジが d↔c で閉じない
    const skewed = pairCombos('A')
    skewed[1] = { ...skewed[1], weight: 0.37 } // AsAd の weight を崩す (像 AsAc と不一致)
    const ip = pairCombos('Q')
    const base = { board, oop: skewed, ip, potBB: 6, stackBB: 100, betSizes: [0.66], iterations: 10, turnRunoutN: 4, riverRunoutN: 4 }
    const off = solveFlop(base)
    const on = solveFlop({ ...base, suitIso: true })
    expect(on.oopRootStrategy).toEqual(off.oopRootStrategy)
    expect(on.nodes).toEqual(off.nodes)
    expect(on.exploitability).toBe(off.exploitability)
  })
})
