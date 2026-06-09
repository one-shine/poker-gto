import { describe, it, expect } from 'vitest'
import type { ActionSolution } from '../../types/solver'
import { recommendedSolution, actionSizeLabel, recommendLabel } from './recommendation'

const sol = (action: ActionSolution['action'], frequency: number, sizeBB?: number): ActionSolution =>
  ({ action, frequency, ev: 0, sizeBB })

describe('recommendedSolution', () => {
  it('最頻アクションを返す', () => {
    const s = [sol('fold', 0.2), sol('call', 0.5), sol('raise', 0.3, 3.6)]
    expect(recommendedSolution(s)?.action).toBe('call')
  })
  it('タイは先頭を保持(> 比較なので後続が同頻度でも置換しない)', () => {
    const s = [sol('call', 0.5), sol('raise', 0.5, 3.6)]
    expect(recommendedSolution(s)?.action).toBe('call')
  })
  it('空配列は null', () => {
    expect(recommendedSolution([])).toBeNull()
  })
})

describe('actionSizeLabel', () => {
  it('raise はサイズ + BB を付ける', () => {
    expect(actionSizeLabel(sol('raise', 1, 3.6))).toBe('レイズ 3.6BB')
  })
  it('allin もサイズ付き', () => {
    expect(actionSizeLabel(sol('allin', 1, 97))).toBe('オールイン 97.0BB')
  })
  it('call/check/fold は素のラベル', () => {
    expect(actionSizeLabel(sol('call', 1))).toBe('コール')
    expect(actionSizeLabel(sol('check', 1))).toBe('チェック')
    expect(actionSizeLabel(sol('fold', 1))).toBe('フォールド')
  })
  it('sizeBB が undefined / 0 の raise は素のラベル', () => {
    expect(actionSizeLabel(sol('raise', 1))).toBe('レイズ')
    expect(actionSizeLabel(sol('raise', 1, 0))).toBe('レイズ')
  })
})

describe('recommendLabel', () => {
  it('approximate 系は「推奨(最頻)」', () => {
    expect(recommendLabel('approximate')).toBe('推奨(最頻)')
    expect(recommendLabel('approximate_with_ev')).toBe('推奨(最頻)')
  })
  it('solver 系は「推奨」', () => {
    expect(recommendLabel('solver_live')).toBe('推奨')
    expect(recommendLabel('solver_precomputed')).toBe('推奨')
  })
})
