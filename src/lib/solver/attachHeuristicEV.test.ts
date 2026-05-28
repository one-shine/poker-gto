import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCallerCallFreq, computeHeuristicEV } from './attachHeuristicEV'
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
