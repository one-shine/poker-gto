import { describe, it, expect } from 'vitest'
import { explainPushFold, generatePushFoldQuestion, judgePushFold, PUSHFOLD_STACKS } from './pushFoldDrill'

describe('pushFoldDrill', () => {
  it('discovers bundled stacks from JSON (昇順)', () => {
    expect(PUSHFOLD_STACKS).toEqual([5, 8, 10, 12, 15, 20, 25])
  })

  it('SB push is correct for AA at 10BB; fold is wrong; uses precomputed source + real EV', () => {
    const q = { ...generatePushFoldQuestion(10, 'sb', () => 0), hand: 'AA' }
    const push = judgePushFold(q, 'push')
    expect(push.correct).toBe(true)
    expect(push.source).toBe('solver_precomputed')
    const pushInfo = push.all.find(a => a.action === 'push')!
    expect(pushInfo.freq).toBeGreaterThan(0.99)
    expect(Number.isFinite(pushInfo.ev)).toBe(true) // 実 EV が付く
    expect(judgePushFold(q, 'fold').correct).toBe(false)
  })

  it('SB fold is correct for 72o at 10BB (trash folds)', () => {
    const q = { ...generatePushFoldQuestion(10, 'sb', () => 0), hand: '72o' }
    expect(judgePushFold(q, 'fold').correct).toBe(true)
    expect(judgePushFold(q, 'push').correct).toBe(false)
  })

  it('BB calls AA vs a shove; offers call/fold options', () => {
    const q = { ...generatePushFoldQuestion(10, 'bb', () => 0), hand: 'AA' }
    expect(q.options.map(o => o.action)).toEqual(['call', 'fold'])
    expect(judgePushFold(q, 'call').correct).toBe(true)
  })

  it('ranges tighten with depth: a marginal hand pushes at 10BB but not 20BB', () => {
    // K5o は浅いほど押しやすい代表 (10BB push ≈1 / 20BB は fold 寄り)
    const shallow = judgePushFold({ ...generatePushFoldQuestion(10, 'sb', () => 0), hand: 'K5o' }, 'push')
    const deep = judgePushFold({ ...generatePushFoldQuestion(20, 'sb', () => 0), hand: 'K5o' }, 'push')
    const f = (j: typeof shallow) => j.all.find(a => a.action === 'push')!.freq
    expect(f(shallow)).toBeGreaterThan(f(deep))
  })

  // 唯一の厳密 GTO(push/fold)の Nash 品質を出荷物から検証可能にする (rule 1)。
  // 求解が劣化したら CI で落ちる = 「solver_precomputed と称せる」根拠を自己強制。
  it('every bundled push/fold solution ships a near-Nash exploitability (< 0.005 BB/hand)', () => {
    for (const stack of PUSHFOLD_STACKS) {
      for (const role of ['sb', 'bb'] as const) {
        const j = judgePushFold({ ...generatePushFoldQuestion(stack, role, () => 0), hand: 'AA' }, 'fold')
        expect(j.source).toBe('solver_precomputed')
        expect(j.exploitability, `${stack}BB ${role} に exploitability が同梱される`).not.toBeNull()
        expect(j.exploitability!, `${stack}BB ${role} は near-Nash`).toBeLessThan(0.005)
      }
    }
  })

  describe('explainPushFold', () => {
    it('SB push (AA 10BB) → +EV push rationale', () => {
      const j = judgePushFold({ ...generatePushFoldQuestion(10, 'sb', () => 0), hand: 'AA' }, 'push')
      expect(explainPushFold(j)).toContain('プッシュが+EV')
    })

    it('SB trash (72o 10BB) → fold rationale', () => {
      const j = judgePushFold({ ...generatePushFoldQuestion(10, 'sb', () => 0), hand: '72o' }, 'fold')
      expect(explainPushFold(j)).toContain('フォールド')
    })
  })
})
