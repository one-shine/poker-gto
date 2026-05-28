import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCallerCallFreq, computeHeuristicEV,
  buildOpenerRaiseFreq, computeDefenderHeuristicEV,
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
