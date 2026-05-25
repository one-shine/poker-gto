import { describe, it, expect } from 'vitest'
import { solvePushFold, CATEGORIES } from './pushFold'

const NCAT = CATEGORIES.length

// 全マッチアップ 0.5 勝率 (コインフリップ) の合成行列。
function flatEquity(): number[][] {
  return CATEGORIES.map(() => new Array(NCAT).fill(0.5))
}

// カテゴリ強度 s∈[0,1] (AA=1 ... 末尾≈0) に基づく単調な合成勝率行列。
// eq[i][j] = clamp(0.5 + 0.5(s_i - s_j))。eq[i][j]+eq[j][i]=1, 対角=0.5。
function monotoneEquity(): number[][] {
  const s = CATEGORIES.map((_, i) => 1 - i / (NCAT - 1))
  return CATEGORIES.map((_, i) =>
    CATEGORIES.map((_, j) => Math.min(0.95, Math.max(0.05, 0.5 + 0.5 * (s[i] - s[j])))),
  )
}

const idx = (cat: string) => CATEGORIES.indexOf(cat)

describe('solvePushFold', () => {
  it('with coinflip equity everywhere, both push and call 100% (blinds are worth contesting)', () => {
    const r = solvePushFold(flatEquity(), { effStackBB: 10, iterations: 400 })
    expect(r.sbPush['AA'].freq).toBeGreaterThan(0.99)
    expect(r.sbPush['72o'].freq).toBeGreaterThan(0.99)
    expect(r.bbCall['AA'].freq).toBeGreaterThan(0.99)
    expect(r.bbCall['72o'].freq).toBeGreaterThan(0.99)
    expect(r.exploitability).toBeLessThan(0.01)
  })

  it('AA always pushes and always calls under monotone equity', () => {
    const r = solvePushFold(monotoneEquity(), { effStackBB: 15, iterations: 800 })
    expect(r.sbPush['AA'].freq).toBeGreaterThan(0.99)
    expect(r.bbCall['AA'].freq).toBeGreaterThan(0.99)
    // AA の push EV は fold(-0.5) を大きく上回る
    expect(r.sbPush['AA'].evAct).toBeGreaterThan(r.sbPush['AA'].evFold)
  })

  it('ranges tighten as the effective stack deepens', () => {
    const eq = monotoneEquity()
    const shallow = solvePushFold(eq, { effStackBB: 3, iterations: 800 })
    const deep = solvePushFold(eq, { effStackBB: 25, iterations: 800 })
    const pushWidth = (r: ReturnType<typeof solvePushFold>) =>
      CATEGORIES.reduce((n, c) => n + r.sbPush[c].freq, 0)
    const callWidth = (r: ReturnType<typeof solvePushFold>) =>
      CATEGORIES.reduce((n, c) => n + r.bbCall[c].freq, 0)
    // 浅いほど push/call レンジは広い
    expect(pushWidth(shallow)).toBeGreaterThan(pushWidth(deep))
    expect(callWidth(shallow)).toBeGreaterThan(callWidth(deep))
  })

  it('converges to a low-exploitability profile', () => {
    const r = solvePushFold(monotoneEquity(), { effStackBB: 12, iterations: 1500 })
    expect(r.exploitability).toBeLessThan(0.02)
    // 最弱手は深いスタックでフォールド寄り、最強手はプッシュ
    expect(r.sbPush['AA'].freq).toBeGreaterThan(r.sbPush['72o'].freq)
  })

  it('enumerates all 169 categories with pairs/suited/offsuit', () => {
    expect(NCAT).toBe(169)
    expect(idx('AA')).toBe(0)
    expect(CATEGORIES.filter(c => c.length === 2)).toHaveLength(13)
    expect(CATEGORIES.filter(c => c.endsWith('s'))).toHaveLength(78)
    expect(CATEGORIES.filter(c => c.endsWith('o'))).toHaveLength(78)
  })
})
