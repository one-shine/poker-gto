import { describe, it, expect } from 'vitest'
import { getSolution } from './getSolution'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import type { SpotKey } from '../../types/solver'

// プリフロップの供給優先順位: 実解(solver_precomputed) > ヒューリスティックEV(approximate_with_ev) > 手作り近似(approximate)。
const pre = (baseSpotId: string, multiway = false): SpotKey => ({ baseSpotId, street: 'preflop', multiway })

describe('getSolution (preflop fallback)', () => {
  it('opener spot は heuristicEV を採用 (approximate_with_ev)', async () => {
    // btn-open は precomputed(push/fold のみ)に無く preflop-ev/btn-open.json がある → EV 付き近似。
    const sol = await getSolution(pre('btn-open'))
    expect(sol).not.toBeNull()
    expect(sol!.source).toBe('approximate_with_ev')
  })

  it('EV未付与の収録スポットは手作り近似 (approximate)', async () => {
    // U22 で追加した mp-vs-utg は preflop-ev を持たない(3bet EV 不整合回避)→ approximate に落ちる。
    expect(PREFLOP_SCENARIOS.some(s => s.id === 'mp-vs-utg')).toBe(true)
    const sol = await getSolution(pre('mp-vs-utg'))
    expect(sol).not.toBeNull()
    expect(sol!.source).toBe('approximate')
  })

  it('multiway は同じ HU レンジを参考値として返し、共有インスタンスを mutate しない (ルール4)', async () => {
    const hu = await getSolution(pre('btn-open', false))
    const mw = await getSolution(pre('btn-open', true))
    expect(mw).not.toBeNull()
    expect(mw!.multiwayReference).toBe(true)
    expect(mw!.strategy).toEqual(hu!.strategy) // 戦略は同一・参考フラグだけ付く
    expect(hu!.multiwayReference).toBeFalsy()   // HU 側(共有元)は汚染されない
  })

  it('未収録スポットは null', async () => {
    expect(await getSolution(pre('does-not-exist'))).toBeNull()
  })
})
