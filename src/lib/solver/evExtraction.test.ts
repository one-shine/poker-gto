import { describe, it, expect } from 'vitest'
import { solveFlop } from './flopSolver'
import type { Combo } from './riverSolver'
import { parseCard, parseCards } from '../../engine/cards/Card'
import { allRunouts, comboHasCard, strictEquity5 } from './chanceCfr'
import { CATEGORIES } from './pushFold'
import { rootValueMatrix, aggregateToCategories, probeEVs, rootPotBB } from './evExtraction'
import type { Card } from '../../types/game'

const cc = (a: string, b: string, w = 1): Combo => ({ cards: [parseCard(a), parseCard(b)], weight: w })
const SUIT_CHARS = ['s', 'h', 'd', 'c'] as const
const pairCombos = (rank: string): Combo[] => {
  const out: Combo[] = []
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) out.push(cc(rank + SUIT_CHARS[i], rank + SUIT_CHARS[j]))
  }
  return out
}
const suitedCombos = (r1: string, r2: string): Combo[] => SUIT_CHARS.map(s => cc(r1 + s, r2 + s))

// vOop の i 行を villain weight で周辺化(NaN=衝突ペアは除外)。
const marginal = (row: number[], villain: Combo[]): number => {
  let num = 0
  let den = 0
  row.forEach((v, j) => {
    if (Number.isFinite(v)) {
      num += villain[j].weight * v
      den += villain[j].weight
    }
  })
  return num / den
}

// 全列挙 (turn×river) の条件付き平均エクイティを独立に再計算する参照実装。
function refAvgEquity(hero: Combo, vill: Combo, flop: Card[]): number {
  let sum = 0
  let n = 0
  for (const t of allRunouts(flop)) {
    if (comboHasCard(hero, t) || comboHasCard(vill, t)) continue
    const b4 = [...flop, t]
    for (const r of allRunouts(b4)) {
      if (comboHasCard(hero, r) || comboHasCard(vill, r)) continue
      sum += strictEquity5([hero], [vill], [...b4, r])[0][0]
      n++
    }
  }
  return sum / n
}

describe('evExtraction — 値規約の検証 (①ベット無しで V = eq×pot)', () => {
  const board = parseCards('Ah Kd 7s')
  const oop = [cc('Qs', 'Qd'), cc('Js', 'Jd')]
  const ip = [cc('Kh', 'Qh'), cc('8h', '8c')]
  const potBB = 6

  it('betSizes=[] 全列挙: vOop = 平均エクイティ×pot / vIp = (1−eq)×pot (規約 V_contract=V_solver+pot/2 の実証)', { timeout: 60_000 }, () => {
    const sol = solveFlop({ board, oop, ip, potBB, stackBB: 20, betSizes: [], iterations: 1 })
    expect(rootPotBB(sol)).toBeCloseTo(potBB, 9)
    const { vOop, vIp } = rootValueMatrix(sol, oop, ip)
    for (let i = 0; i < oop.length; i++) {
      for (let j = 0; j < ip.length; j++) {
        const eq = refAvgEquity(oop[i], ip[j], board)
        expect(vOop[i][j]).toBeCloseTo(eq * potBB, 6)
        expect(vIp[j][i]).toBeCloseTo((1 - eq) * potBB, 6)
      }
    }
  })

  it('betSizes=[]: probeEVs(レンジ内 combo) = rootValueMatrix の周辺値と一致 (BR に選択肢が無いケース)', { timeout: 60_000 }, () => {
    const sol = solveFlop({ board, oop, ip, potBB, stackBB: 20, betSizes: [], iterations: 1 })
    const { vOop } = rootValueMatrix(sol, oop, ip)
    const probe = probeEVs(sol, 'oop', oop, { board, villainCombos: ip })
    for (let i = 0; i < oop.length; i++) {
      expect(probe[i]).toBeCloseTo(marginal(vOop[i], ip), 9)
    }
  })
})

describe('evExtraction — ②ゼロサム恒等式と衝突ペア', () => {
  const board = parseCards('Ah Kd 7s')
  // ip[0] は oop[0] と As を共有 → 衝突ペア
  const oop = [cc('As', 'Ac'), cc('Qh', 'Jh')]
  const ip = [cc('As', 'Qd'), cc('9h', '9c'), cc('6d', '5d')]
  const potBB = 6

  it('ベットが入っても vOop[i][j] + vIp[j][i] = potBB (追加投入は勝敗で相殺される恒等式)', () => {
    const sol = solveFlop({
      board, oop, ip, potBB, stackBB: 30,
      betSizes: [0.66], raiseSizes: [0.5], iterations: 30, turnRunoutN: 6, riverRunoutN: 6,
    })
    const { vOop, vIp } = rootValueMatrix(sol, oop, ip)
    for (let i = 0; i < oop.length; i++) {
      for (let j = 0; j < ip.length; j++) {
        if (i === 0 && j === 0) continue
        expect(vOop[i][j] + vIp[j][i]).toBeCloseTo(potBB, 6)
        expect(Number.isFinite(vOop[i][j])).toBe(true)
      }
    }
    expect(Number.isNaN(vOop[0][0])).toBe(true)
    expect(Number.isNaN(vIp[0][0])).toBe(true)
  })

  it('suitIso 縮約解 (member 置換) でも rootValueMatrix は非縮約解と一致', { timeout: 60_000 }, () => {
    const isoBoard = parseCards('Kh 9h 4h')
    const oopIso = pairCombos('Q')
    const ipIso = pairCombos('8')
    const base = { board: isoBoard, oop: oopIso, ip: ipIso, potBB, stackBB: 50, betSizes: [], iterations: 1 }
    const off = rootValueMatrix(solveFlop(base), oopIso, ipIso)
    const on = rootValueMatrix(solveFlop({ ...base, suitIso: true }), oopIso, ipIso)
    for (let i = 0; i < oopIso.length; i++) {
      for (let j = 0; j < ipIso.length; j++) {
        if (Number.isNaN(off.vOop[i][j])) expect(Number.isNaN(on.vOop[i][j])).toBe(true)
        else expect(on.vOop[i][j]).toBeCloseTo(off.vOop[i][j], 9)
      }
    }
  })
})

describe('evExtraction — ③aggregateToCategories', () => {
  const idx = (cat: string) => CATEGORIES.indexOf(cat)
  const hero = [cc('As', 'Ah', 1), cc('Ad', 'Ac', 3), cc('Ks', 'Qs', 1)]
  const vill = [cc('Qh', 'Qd'), cc('Ah', 'Kh')] // AhKh は hero[0] と衝突
  const M = [
    [10, NaN],
    [20, 4],
    [8, 2],
  ]

  it('コンボ重み加重 + NaN(衝突ペア)除外で 169×169 へ集約', () => {
    const out = aggregateToCategories({ oop: hero, ip: vill }, M, 'oop')
    expect(out.length).toBe(169)
    expect(out[idx('AA')][idx('QQ')]).toBeCloseTo((1 * 10 + 3 * 20) / 4, 9) // 17.5
    expect(out[idx('AA')][idx('AKs')]).toBeCloseTo(4, 9) // 衝突した AsAh 行は母数からも除外
    expect(out[idx('KQs')][idx('QQ')]).toBeCloseTo(8, 9)
    expect(out[idx('KQs')][idx('AKs')]).toBeCloseTo(2, 9)
    expect(Number.isNaN(out[idx('AA')][idx('AKo')])).toBe(true) // データ無しセル
    expect(Number.isNaN(out[idx('72o')][idx('QQ')])).toBe(true)
  })

  it("side='ip' は combos.ip を hero として同じ向きの行列を集約する", () => {
    const fromOop = aggregateToCategories({ oop: hero, ip: vill }, M, 'oop')
    const fromIp = aggregateToCategories({ oop: vill, ip: hero }, M, 'ip')
    expect(fromIp[idx('AA')][idx('QQ')]).toBeCloseTo(fromOop[idx('AA')][idx('QQ')], 9)
    expect(fromIp[idx('KQs')][idx('AKs')]).toBeCloseTo(fromOop[idx('KQs')][idx('AKs')], 9)
  })
})

describe('evExtraction — ④probeEVs (固定相手方策への BR 値)', () => {
  const board = parseCards('Ah Kd 7s')
  const oop = [cc('Qs', 'Qd'), cc('Jh', 'Th'), cc('8c', '7c')]
  const ip = [cc('Ad', 'Qh'), cc('9s', '9d'), cc('5h', '4h')]
  const potBB = 6
  const solve = () => solveFlop({
    board, oop, ip, potBB, stackBB: 30,
    betSizes: [0.66], iterations: 60, turnRunoutN: 6, riverRunoutN: 6,
  })

  it('レンジ内 combo の BR 値 ≥ 同 combo の均衡(平均戦略)値 — 両側', { timeout: 60_000 }, () => {
    const sol = solve()
    const { vOop, vIp } = rootValueMatrix(sol, oop, ip)
    const probeOop = probeEVs(sol, 'oop', oop, { board, villainCombos: ip })
    for (let i = 0; i < oop.length; i++) {
      expect(probeOop[i]).toBeGreaterThanOrEqual(marginal(vOop[i], ip) - 1e-6)
    }
    const probeIp = probeEVs(sol, 'ip', ip, { board, villainCombos: oop })
    for (let j = 0; j < ip.length; j++) {
      expect(probeIp[j]).toBeGreaterThanOrEqual(marginal(vIp[j], oop) - 1e-6)
    }
  })

  it('レンジ外 combo: 強い手 > ゴミ手 / 盤面衝突は NaN', { timeout: 60_000 }, () => {
    const sol = solve()
    const extras = [cc('Ac', 'As'), cc('3c', '2d'), cc('Ah', '2c')] // AhはBoardと衝突
    const probe = probeEVs(sol, 'oop', extras, { board, villainCombos: ip })
    expect(Number.isFinite(probe[0])).toBe(true)
    expect(Number.isFinite(probe[1])).toBe(true)
    expect(probe[0]).toBeGreaterThan(probe[1])
    expect(Number.isNaN(probe[2])).toBe(true)
  })

  it('suitIso 縮約解には明示エラー (extra への置換適用が不可能なため)', { timeout: 60_000 }, () => {
    // 全列挙でないと runout 軌道が単元クラスになり members が生成されない
    const isoBoard = parseCards('Kh 9h 4h')
    const sol = solveFlop({
      board: isoBoard, oop: pairCombos('Q'), ip: pairCombos('8'),
      potBB, stackBB: 50, betSizes: [], iterations: 1, suitIso: true,
    })
    expect(() => probeEVs(sol, 'oop', [cc('As', 'Ad')], { board: isoBoard, villainCombos: pairCombos('8') }))
      .toThrow(/suitIso/)
  })
})

describe('evExtraction — 性能スモーク (O(コンボ²×終端) の実測)', () => {
  it('16×16 コンボ・全列挙 (49×48 runout)・ベット入りの抽出が 10 秒以内', { timeout: 120_000 }, () => {
    const board = parseCards('Ah Kd 7s')
    const oop = [...pairCombos('Q'), ...pairCombos('J'), ...suitedCombos('T', '9')]
    const ip = [...pairCombos('9'), ...pairCombos('8'), ...suitedCombos('6', '5')]
    const sol = solveFlop({ board, oop, ip, potBB: 6, stackBB: 30, betSizes: [0.66], iterations: 2 })
    const t0 = performance.now()
    const { vOop, vIp } = rootValueMatrix(sol, oop, ip)
    const probe = probeEVs(sol, 'oop', oop.slice(0, 4), { board, villainCombos: ip })
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(10_000)
    expect(vOop.every(row => row.every(v => Number.isNaN(v) || Number.isFinite(v)))).toBe(true)
    for (let i = 0; i < oop.length; i++) {
      for (let j = 0; j < ip.length; j++) {
        if (!Number.isNaN(vOop[i][j])) expect(vOop[i][j] + vIp[j][i]).toBeCloseTo(6, 6)
      }
    }
    expect(probe.every(Number.isFinite)).toBe(true)
  })
})
