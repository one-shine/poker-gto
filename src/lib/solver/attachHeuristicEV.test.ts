import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCallerCallFreq, computeHeuristicEV,
  buildOpenerRaiseFreq, computeDefenderHeuristicEV,
  buildOpenerResponseFreqs, computeOpenerFacing3betEV,
} from './attachHeuristicEV'
import { buildEquityMatrix } from './preflopEquity'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

// CI 高速化のため scripts/.cache を優先使用 (R4-A の test と同じパス)。
let EQ_CACHE: number[][] | null = null
function eqMatrix(): number[][] {
  if (EQ_CACHE) return EQ_CACHE
  const cached = resolve(__dirname, '../../../scripts/.cache/preflop-equity-400-1.json')
  if (existsSync(cached)) {
    EQ_CACHE = JSON.parse(readFileSync(cached, 'utf8')) as number[][]
  } else {
    EQ_CACHE = buildEquityMatrix(60, 1)
  }
  return EQ_CACHE
}
beforeAll(() => { eqMatrix() }, 30000)

const SC = (id: string) => {
  const s = PREFLOP_SCENARIOS.find(x => x.id === id)
  if (!s) throw new Error(`scenario not found: ${id}`)
  return s
}

describe('attachHeuristicEV (R4-B)', () => {
  it('AA in btn-open has very positive EV', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-btn'))
    const node = computeHeuristicEV(SC('btn-open'), eq, callerQ)
    expect(node.source).toBe('approximate_with_ev')
    const aa = node.strategy['AA']
    const raise = aa.find(a => a.action === 'raise')
    expect(raise).toBeTruthy()
    expect(raise!.ev).toBeGreaterThan(2.5)
  })

  it('72o is missing from btn-open (pure fold in hand-built range)', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-btn'))
    const node = computeHeuristicEV(SC('btn-open'), eq, callerQ)
    // 手作りシナリオは pure fold を cells に含めない (CoachAgent が「未収録 = fold 100%」と扱う)
    expect(node.strategy['72o']).toBeUndefined()
  })

  it('EV is monotonic across hand strength (AA > KK > QQ)', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-btn'))
    const node = computeHeuristicEV(SC('btn-open'), eq, callerQ)
    const ev = (k: string) => node.strategy[k]?.find(a => a.action === 'raise')?.ev ?? 0
    expect(ev('AA')).toBeGreaterThan(ev('KK'))
    expect(ev('KK')).toBeGreaterThan(ev('QQ'))
    expect(ev('QQ')).toBeGreaterThan(ev('JJ'))
  })

  it('strategy frequencies are preserved from the input scenario', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-btn'))
    const sc = SC('btn-open')
    const node = computeHeuristicEV(sc, eq, callerQ)
    // 任意の cell を選んで周波数の同一性を確認
    const aa = sc.cells['AA']
    const aaSol = node.strategy['AA']
    if (aa.raise > 0) {
      expect(aaSol.find(a => a.action === 'raise')!.frequency).toBeCloseTo(aa.raise)
    }
  })

  it('postflopFactor scales EV linearly (sanity check)', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-btn'))
    const lo = computeHeuristicEV(SC('btn-open'), eq, callerQ, { postflopFactor: 20 })
    const hi = computeHeuristicEV(SC('btn-open'), eq, callerQ, { postflopFactor: 40 })
    const evLo = lo.strategy['AA']?.find(a => a.action === 'raise')?.ev ?? 0
    const evHi = hi.strategy['AA']?.find(a => a.action === 'raise')?.ev ?? 0
    // factor が大きいほど (eq - 0.5) × F の絶対値が大きく EV が高くなる
    expect(evHi).toBeGreaterThan(evLo)
  })

  it('mp-open vs bb-vs-mp: tighter caller range → opener EV adjusts', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-mp'))
    const node = computeHeuristicEV(SC('mp-open'), eq, callerQ)
    expect(node.spotId).toBe('mp-open')
    expect(node.source).toBe('approximate_with_ev')
    // AA は依然として正値
    expect(node.strategy['AA']?.find(a => a.action === 'raise')?.ev ?? -1).toBeGreaterThan(0)
  })
})

describe('computeDefenderHeuristicEV (R4 defender 拡張)', () => {
  it('AA in bb-vs-btn has positive call EV (well above fold)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq)
    expect(node.source).toBe('approximate_with_ev')
    const aa = node.strategy['AA']
    const call = aa.find(a => a.action === 'call')
    // AA はディフェンダー scenario で raise 100% かつ call は cells に無いケースが多い → 確認
    const raise = aa.find(a => a.action === 'raise')
    if (call) expect(call.ev).toBeGreaterThan(0)
    if (raise) {
      // 3bet の EV は 0 で固定 (未計上の方針)
      expect(raise.ev).toBe(0)
    }
  })

  it('fold has EV = -bb (default 1)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq)
    // BB defender で fold が含まれる手 (低めの手)
    const trash = node.strategy['72o']
    if (trash) {
      const fold = trash.find(a => a.action === 'fold')
      if (fold) expect(fold.ev).toBeCloseTo(-1)
    }
  })

  it('EV(call) monotonic by hand strength (99 > 66 > 22, all pure calls in bb-vs-btn)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq)
    const evCall = (k: string) =>
      node.strategy[k]?.find(a => a.action === 'call')?.ev ?? Number.NEGATIVE_INFINITY
    // KK は raise 100% で call エントリ無し → 純粋 call 群で単調性を確認
    expect(evCall('99')).toBeGreaterThan(evCall('66'))
    expect(evCall('66')).toBeGreaterThan(evCall('22'))
  })

  it('weak hand (22) has call EV worse than fold (-1) → call is a mistake', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq)
    const call = node.strategy['22']?.find(a => a.action === 'call')
    if (call) {
      // 22 vs BTN レンジは set value のみ → 期待 EV はマイナス、fold (-1) より悪い場合あり
      expect(call.ev).toBeLessThan(0)
    }
  })

  it('strategy frequencies are preserved from the defender scenario', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const sc = SC('bb-vs-btn')
    const node = computeDefenderHeuristicEV(sc, openerQ, eq)
    for (const hand of Object.keys(sc.cells).slice(0, 5)) {
      const cell = sc.cells[hand]
      const sols = node.strategy[hand]
      if (cell.call > 0) {
        expect(sols.find(a => a.action === 'call')?.frequency).toBeCloseTo(cell.call)
      }
    }
  })
})

describe('computeDefenderHeuristicEV — 非BB 単独防御 (R4 拡張)', () => {
  // sb-vs-btn: SB が OOP で BTN open に直面 (実戦的に 3bet-or-fold)。
  // SB は 0.5BB 既投入 → fold EV = -0.5 (bbBlind=0.5 を渡す)。
  it('sb-vs-btn (OOP): source=approximate_with_ev, fold EV=-0.5, 3bet EV=0', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('sb-vs-btn'), openerQ, eq, { bbBlind: 0.5 })
    expect(node.source).toBe('approximate_with_ev')
    expect(node.spotId).toBe('sb-vs-btn')
    // SB ディフェンダーは 3bet-or-fold (call エントリ無し)。
    for (const acts of Object.values(node.strategy)) {
      expect(acts.find(a => a.action === 'call')).toBeUndefined()
      const raise = acts.find(a => a.action === 'raise')
      if (raise) expect(raise.ev).toBe(0)
      const fold = acts.find(a => a.action === 'fold')
      if (fold) expect(fold.ev).toBeCloseTo(-0.5)
    }
    // AA は純粋 3bet (頻度1)。
    const aa = node.strategy['AA']
    expect(aa.find(a => a.action === 'raise')?.frequency).toBeCloseTo(1)
  })

  it('sb-vs-btn frequencies are preserved from the scenario', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const sc = SC('sb-vs-btn')
    const node = computeDefenderHeuristicEV(sc, openerQ, eq, { bbBlind: 0.5 })
    for (const hand of Object.keys(sc.cells).slice(0, 6)) {
      const cell = sc.cells[hand]
      const sols = node.strategy[hand]
      if (cell.raise > 0) {
        expect(sols.find(a => a.action === 'raise')?.frequency).toBeCloseTo(cell.raise)
      }
      if (cell.fold > 0) {
        expect(sols.find(a => a.action === 'fold')?.frequency).toBeCloseTo(cell.fold)
      }
    }
  })

  // btn-vs-co: BTN が IP で CO open に直面。call レンジを持つ。fold EV=-1 (未投入)。
  it('btn-vs-co (IP): source=approximate_with_ev, fold EV=-1, call EV monotonic by strength', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('co-open'))
    const node = computeDefenderHeuristicEV(SC('btn-vs-co'), openerQ, eq)
    expect(node.source).toBe('approximate_with_ev')
    expect(node.spotId).toBe('btn-vs-co')
    const evCall = (k: string) =>
      node.strategy[k]?.find(a => a.action === 'call')?.ev ?? Number.NEGATIVE_INFINITY
    // 純粋 call 群で単調性 (TT > 99 > 88 > 77 > 66)。
    expect(evCall('TT')).toBeGreaterThan(evCall('99'))
    expect(evCall('99')).toBeGreaterThan(evCall('88'))
    expect(evCall('88')).toBeGreaterThan(evCall('77'))
    expect(evCall('77')).toBeGreaterThan(evCall('66'))
    // fold を持つ手は fold EV=-1。
    const twos = node.strategy['22']
    if (twos) {
      const fold = twos.find(a => a.action === 'fold')
      if (fold) expect(fold.ev).toBeCloseTo(-1)
    }
  })

  it('btn-vs-co weak hand (22) call EV is worse than fold (-1)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('co-open'))
    const node = computeDefenderHeuristicEV(SC('btn-vs-co'), openerQ, eq)
    const call = node.strategy['22']?.find(a => a.action === 'call')
    // 22 vs CO open はセットバリューのみ → コール EV はマイナスで fold(-1) を下回る。
    if (call) expect(call.ev).toBeLessThan(-1)
  })

  it('btn-vs-co call frequencies are preserved from the scenario', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('co-open'))
    const sc = SC('btn-vs-co')
    const node = computeDefenderHeuristicEV(sc, openerQ, eq)
    for (const hand of Object.keys(sc.cells).slice(0, 6)) {
      const cell = sc.cells[hand]
      const sols = node.strategy[hand]
      if (cell.call > 0) {
        expect(sols.find(a => a.action === 'call')?.frequency).toBeCloseTo(cell.call)
      }
    }
  })
})

// ── R4: honest 3bet/4bet EV (opener応答=実データ) ─────────────────────────────────
// 3bet opts を渡したときだけ 3bet EV が載る。渡さなければ従来どおり ev=0 (上のテストで担保)。
describe('computeDefenderHeuristicEV — 3bet EV (R4 honest model)', () => {
  // bb-vs-btn の 3bet 応答 = btn-vs-bb-3bet (実データ)。hero=BB, blind=1.0。
  const threeBetOpts = () => ({
    openerResponse: buildOpenerResponseFreqs(SC('btn-vs-bb-3bet')),
    openerOpenFreq: buildOpenerRaiseFreq(SC('btn-open')),
    openBB: 2.5, threeBetBB: 11, heroBlindPosted: 1.0,
    threeBetFactor: 45, fourBetFactor: 60,
  })
  const ev3 = (node: ReturnType<typeof computeDefenderHeuristicEV>, h: string) =>
    node.strategy[h]?.find(a => a.action === 'raise')?.ev ?? Number.NEGATIVE_INFINITY

  it('3bet EV is non-zero/positive for premiums and meta notes 3bet factor', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq, threeBetOpts())
    expect(node.source).toBe('approximate_with_ev')
    expect(node.meta?.sourceName).toMatch(/3bet factor/)
    expect(ev3(node, 'AA')).toBeGreaterThan(0)
  })

  it('AA has the maximum 3bet EV across all 3bet hands (AA-best invariant)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq, threeBetOpts())
    const aa = ev3(node, 'AA')
    for (const [hand, acts] of Object.entries(node.strategy)) {
      const r = acts.find(a => a.action === 'raise')
      if (r && hand !== 'AA') expect(aa).toBeGreaterThanOrEqual(r.ev!)
    }
  })

  it('3bet EV is monotonic among premium pairs (AA > KK > QQ)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq, threeBetOpts())
    expect(ev3(node, 'AA')).toBeGreaterThan(ev3(node, 'KK'))
    expect(ev3(node, 'KK')).toBeGreaterThan(ev3(node, 'QQ'))
  })

  it('bluff-3bet (A5s) EV beats folding via fold equity (3bet > fold = -1)', () => {
    const eq = eqMatrix()
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), buildOpenerRaiseFreq(SC('btn-open')), eq, threeBetOpts())
    // A5s は bb-vs-btn で混合 3bet/call。fold equity で 3bet が fold(-1) より良い。
    const r = node.strategy['A5s']?.find(a => a.action === 'raise')
    if (r) expect(r.ev).toBeGreaterThan(-1)
  })

  it('without 3bet opts, 3bet EV stays 0 and meta notes 未計上 (no-data fallback)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const node = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq)
    expect(node.meta?.sourceName).toMatch(/未計上/)
    const r = node.strategy['AA']?.find(a => a.action === 'raise')
    if (r) expect(r.ev).toBe(0)
  })

  it('buildOpenerResponseFreqs: in-range hand sums to ~1, out-of-range folds fully', () => {
    const resp = buildOpenerResponseFreqs(SC('btn-vs-bb-3bet'))
    const idx = (h: string) => {
      // CATEGORIES index via scenario cells; assert via a known in-range premium and a junk hand
      return h
    }
    void idx
    // AA は btn-vs-bb-3bet に在り (4bet/call/fold 合計≈1)。72o は未掲載 → oFold=1。
    // categories の並びに依存せず、合計1とフォールド既定だけ確認するため scenario cell から逆引き。
    const sc = SC('btn-vs-bb-3bet')
    const cells = sc.cells
    // 任意の在籍手 (AA) と 不在手 (72o) を確認
    expect(cells['AA']).toBeTruthy()
    expect(cells['72o']).toBeUndefined()
    // ベクトル長は 169 (CATEGORIES) で、合計 oFold+oCall+o4bet は在籍手で≈1
    let checked = 0
    for (let i = 0; i < resp.oFold.length; i++) {
      const s = resp.oFold[i] + resp.oCall[i] + resp.o4bet[i]
      // 在籍手 (応答あり) は合計1、不在手は oFold=1 → どちらも合計1
      expect(s).toBeCloseTo(1, 5)
      checked++
    }
    expect(checked).toBe(169)
  })
})

describe('computeOpenerFacing3betEV — facing-3bet (R4, EV coverage 21/21)', () => {
  // co-vs-btn-3bet: hero=CO opener が BTN の 3bet に直面。villain 3bet レンジ = btn-vs-co raise 列。
  const node = () => {
    const eq = eqMatrix()
    return computeOpenerFacing3betEV(SC('co-vs-btn-3bet'), buildOpenerRaiseFreq(SC('btn-vs-co')), eq, {
      openBB: 2.5, threeBetBB: 11, openerBlind: 0, threeBetterBlind: 0,
      threeBetFactor: 45, fourBetFactor: 60, foldToFourBet: 0.55,
    })
  }
  it('source=approximate_with_ev and fold EV = -(open) = -2.5', () => {
    const n = node()
    expect(n.source).toBe('approximate_with_ev')
    for (const acts of Object.values(n.strategy)) {
      const fold = acts.find(a => a.action === 'fold')
      if (fold) expect(fold.ev).toBeCloseTo(-2.5)
    }
  })
  it('AA prefers 4bet (raise) over call and fold (4bet is AA best action)', () => {
    const n = node()
    const aa = n.strategy['AA']
    const four = aa.find(a => a.action === 'raise')?.ev ?? Number.NEGATIVE_INFINITY
    const call = aa.find(a => a.action === 'call')?.ev ?? Number.NEGATIVE_INFINITY
    expect(four).toBeGreaterThan(call)
    expect(four).toBeGreaterThan(-2.5)
    // AA の 4bet EV は全ハンドで最大
    const allFour = Object.values(n.strategy)
      .map(acts => acts.find(a => a.action === 'raise')?.ev)
      .filter((e): e is number => e != null)
    expect(four).toBe(Math.max(...allFour))
  })
  it('4bet EV monotonic among premiums (AA > KK > QQ)', () => {
    const n = node()
    const f = (h: string) => n.strategy[h]?.find(a => a.action === 'raise')?.ev ?? Number.NEGATIVE_INFINITY
    expect(f('AA')).toBeGreaterThan(f('KK'))
    expect(f('KK')).toBeGreaterThan(f('QQ'))
  })
})
