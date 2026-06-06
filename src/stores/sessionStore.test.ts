import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from './sessionStore'
import type { CoachFeedback } from '../types/coach'

const fb = (over: Partial<CoachFeedback>): CoachFeedback => ({
  handKey: 'AA', spotId: 'btn-open', street: 'preflop', source: 'approximate', kind: 'correct',
  chosen: 'raise', evLoss: 0, showEv: false, strategy: [], message: '', ...over,
})
const ctx = (handId = 'h1') => ({ handId, street: 'preflop' as const, position: 'BTN' as const, action: 'raise' as const })

describe('sessionStore', () => {
  beforeEach(() => useSessionStore.getState().clearSession())

  it('returns null accuracy with no samples', () => {
    expect(useSessionStore.getState().gtoAccuracy()).toBeNull()
  })

  it('computes accuracy as correct(+mixed)/evaluated', () => {
    const s = useSessionStore.getState()
    s.recordEvaluation(fb({ kind: 'correct' }), ctx())
    s.recordEvaluation(fb({ kind: 'mixed' }), ctx())
    s.recordEvaluation(fb({ kind: 'mistake', category: 'preflop_too_tight', severity: 'major' }), ctx())
    expect(useSessionStore.getState().gtoAccuracy()).toBeCloseTo(2 / 3)
    expect(useSessionStore.getState().mistakes).toHaveLength(1)
  })

  it('excludes hinted hands from the accuracy sample', () => {
    const s = useSessionStore.getState()
    s.markHinted('h1')
    s.recordEvaluation(fb({ kind: 'correct' }), ctx('h1'))
    expect(useSessionStore.getState().gtoAccuracy()).toBeNull() // 母数に入らない
  })

  it('records hand summaries alongside history and clears them (U5)', () => {
    const s = useSessionStore.getState()
    s.recordHand([], { handId: 'h1', heroPosition: 'BTN', won: true, netBB: 3.5, showdown: true, timestamp: 0 })
    s.recordHand([], { handId: 'h2', heroPosition: 'SB', won: false, netBB: -1.5, showdown: false, timestamp: 0 })
    const st = useSessionStore.getState()
    expect(st.handSummaries).toHaveLength(2)
    expect(st.handHistory).toHaveLength(2) // 件数が一致
    expect(st.handSummaries[0].handId).toBe('h1')
    expect(st.handSummaries[1].netBB).toBe(-1.5)
    useSessionStore.getState().clearSession()
    expect(useSessionStore.getState().handSummaries).toEqual([])
  })

  it('recordHand without a summary still advances history (back-compat)', () => {
    const s = useSessionStore.getState()
    s.recordHand([])
    expect(useSessionStore.getState().handHistory).toHaveLength(1)
    expect(useSessionStore.getState().handSummaries).toHaveLength(0)
  })
})
