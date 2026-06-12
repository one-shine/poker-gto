import { describe, it, expect } from 'vitest'
import { evaluateAction, recommendText } from './CoachAgent'
import type { ActionSolution } from '../../types/solver'
import { fromRangeScenario } from '../../lib/solver/fromRangeScenario'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

const btn = fromRangeScenario(PREFLOP_SCENARIOS.find(s => s.id === 'btn-open')!)
const co = fromRangeScenario(PREFLOP_SCENARIOS.find(s => s.id === 'co-open')!)

describe('CoachAgent.evaluateAction (approximate / 頻度ベース)', () => {
  it('treats a 100% raise hand played as raise as correct', () => {
    const fb = evaluateAction(btn, 'AA', 'raise', 'BTN', 2.5)
    expect(fb?.kind).toBe('correct')
    expect(fb?.evLoss).toBe(0)
  })

  it('flags folding a pure-raise hand as a tight mistake (critical)', () => {
    const fb = evaluateAction(btn, 'AA', 'fold', 'BTN')
    expect(fb?.kind).toBe('mistake')
    expect(fb?.category).toBe('preflop_too_tight')
    expect(fb?.severity).toBe('critical')
  })

  it('treats a hand outside the range as implicit fold — playing it is too wide', () => {
    // 72o は btn-open レンジ外 → fold 100% とみなす
    const raise = evaluateAction(btn, '72o', 'raise', 'BTN', 2.5)
    expect(raise?.kind).toBe('mistake')
    expect(raise?.category).toBe('preflop_too_wide')
    const fold = evaluateAction(btn, '72o', 'fold', 'BTN')
    expect(fold?.kind).toBe('correct')
  })

  it('treats a mixed hand as a learning opportunity (either action correct)', () => {
    // A7s @ co-open: raise 0.7 / fold 0.3 — どちらも 10% 以上
    const raise = evaluateAction(co, 'A7s', 'raise', 'CO', 2.5)
    expect(raise?.kind).toBe('mixed')
    const fold = evaluateAction(co, 'A7s', 'fold', 'CO')
    expect(fold?.kind).toBe('mixed')
  })

  it('does not show EV numbers for approximate solutions', () => {
    const fb = evaluateAction(btn, 'AA', 'fold', 'BTN')
    expect(fb?.showEv).toBe(false)
    expect(fb?.evLoss).toBe(0)
  })

  it('returns a strategy array for the hand (for UI frequency bars)', () => {
    const fb = evaluateAction(btn, 'AKs', 'raise', 'BTN', 2.5)
    expect(fb?.strategy.some(s => s.action === 'raise')).toBe(true)
  })

  // A1: ミス文に概念ラベルが入る (「概念: オープン硬すぎ」など)。
  it('injects the mistake-category concept label into the message (A1)', () => {
    const fb = evaluateAction(btn, 'AA', 'fold', 'BTN')
    expect(fb?.message).toContain('概念: オープン硬すぎ')
  })

  // A2: プリフロップでハンド階層が文脈として現れる (AA = プレミアム)。
  it('adds the preflop hand-tier context (A2)', () => {
    const fb = evaluateAction(btn, 'AA', 'fold', 'BTN')
    expect(fb?.message).toContain('プレミアム')
  })

  // A4: 近似モード (EV非提示) では頻度ギャップでスケール感を出す。
  it('shows a frequency gap instead of EV in approximate mode (A4)', () => {
    const fb = evaluateAction(btn, 'AA', 'fold', 'BTN')
    expect(fb?.showEv).toBe(false)
    expect(fb?.message).toContain('推奨頻度との差')
    expect(fb?.message).toContain('100% vs 0%')
  })

  // A6: mixed/correct も端的な定型でなく手固有の原則を添える。
  it('adds a spot-specific principle to mixed/correct messages (A6)', () => {
    const mixed = evaluateAction(co, 'A7s', 'raise', 'CO', 2.5)
    expect(mixed?.kind).toBe('mixed')
    expect(mixed?.message).toContain(' — ') // 推奨 + 原則
    expect(mixed?.message).toContain('スーテッドエース')
  })

  // 表示丸め: sizeBB の float アーティファクト (7.8100000000000005) を出さず、バーと同じ小数1桁にする。
  it('rounds bet sizes to 1 decimal for display without floating-point artifacts', () => {
    const sols: ActionSolution[] = [
      { action: 'raise', sizeBB: 7.8100000000000005, frequency: 0.52, ev: 0 },
      { action: 'call', sizeBB: 1.03, frequency: 0.47, ev: 0 },
    ]
    const text = recommendText(sols)
    expect(text).toContain('レイズ 7.8BB')
    expect(text).toContain('コール 1BB')
    expect(text).not.toContain('7.81')
    // 整数・1桁はそのまま (末尾0を足さない)
    expect(recommendText([{ action: 'raise', sizeBB: 3, frequency: 1, ev: 0 }])).toContain('レイズ 3BB')
    expect(recommendText([{ action: 'raise', sizeBB: 2.5, frequency: 1, ev: 0 }])).toContain('レイズ 2.5BB')
  })
})
