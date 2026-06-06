import { describe, it, expect, beforeEach } from 'vitest'
import { useDrillStore } from './drillStore'

const base = { kind: 'preflop' as const, bucketKey: 'btn-open', bucketLabel: 'BTN Open', chosen: 'raise', evLoss: null }

describe('drillStore', () => {
  beforeEach(() => useDrillStore.getState().resetDrills())

  it('aggregates attempts/correct by kind', () => {
    const rec = useDrillStore.getState().recordDrill
    rec({ ...base, correct: true })
    rec({ ...base, correct: false })
    rec({ ...base, kind: 'postflop', bucketKey: 'srp:flop', bucketLabel: 'SRP·フロップ', correct: true, chosen: 'bet', evLoss: 0.4 })
    const { byKind } = useDrillStore.getState()
    expect(byKind.preflop).toEqual({ attempts: 2, correct: 1 })
    expect(byKind.postflop).toEqual({ attempts: 1, correct: 1 })
    expect(byKind.pushfold).toEqual({ attempts: 0, correct: 0 })
  })

  it('aggregates by bucketKey', () => {
    const rec = useDrillStore.getState().recordDrill
    rec({ ...base, correct: true })
    rec({ ...base, correct: true })
    rec({ ...base, bucketKey: 'co-open', bucketLabel: 'CO Open', correct: false })
    const { byBucket } = useDrillStore.getState()
    expect(byBucket['btn-open']).toEqual({ attempts: 2, correct: 2 })
    expect(byBucket['co-open']).toEqual({ attempts: 1, correct: 0 })
  })

  it('keeps recent newest-first and capped at 50', () => {
    const rec = useDrillStore.getState().recordDrill
    for (let i = 0; i < 55; i++) rec({ ...base, bucketLabel: `q${i}`, correct: i % 2 === 0 })
    const { recent } = useDrillStore.getState()
    expect(recent).toHaveLength(50)
    expect(recent[0].bucketLabel).toBe('q54') // 最新が先頭
  })

  it('stores evLoss as null or number', () => {
    const rec = useDrillStore.getState().recordDrill
    rec({ ...base, correct: true, evLoss: null })
    rec({ ...base, kind: 'postflop', bucketKey: 'srp:turn', bucketLabel: 'SRP·ターン', correct: false, chosen: 'check', evLoss: 1.2 })
    const { recent } = useDrillStore.getState()
    expect(recent[0].evLoss).toBe(1.2)
    expect(recent[1].evLoss).toBeNull()
  })

  it('resetDrills clears everything', () => {
    const rec = useDrillStore.getState().recordDrill
    rec({ ...base, correct: true })
    useDrillStore.getState().resetDrills()
    const s = useDrillStore.getState()
    expect(s.byKind.preflop).toEqual({ attempts: 0, correct: 0 })
    expect(s.byBucket).toEqual({})
    expect(s.recent).toEqual([])
  })
})
