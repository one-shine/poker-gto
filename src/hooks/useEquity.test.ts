import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// 相手レンジ解決 / エクイティ計算をモックし、フックの分岐 (無効 / 未解決 / 参考値 / sampling失敗) を検証する。
vi.mock('../lib/equity/equityClient', () => ({ computeEquityAsync: vi.fn() }))
vi.mock('../lib/equity/opponentRange', () => ({
  resolveOpponentRangesResult: vi.fn(),
  isResolved: (r: { ranges?: unknown }) => 'ranges' in r,
}))

import { useEquity } from './useEquity'
import { computeEquityAsync } from '../lib/equity/equityClient'
import { resolveOpponentRangesResult } from '../lib/equity/opponentRange'
import type { GameState } from '../types/game'

// hero に holeCards を持たせた最小 state (フックは board / players / handId のみ参照)。
const heroCards = [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }]
const state = { board: [], handId: 'h1', players: [{ id: 'hero', holeCards: heroCards }] } as unknown as GameState

beforeEach(() => { vi.clearAllMocks() })

describe('useEquity', () => {
  it('enabled=false: equity=null / loading=false / 計算しない', () => {
    const { result } = renderHook(() => useEquity(state, 'hero', false))
    expect(result.current).toMatchObject({ equity: null, loading: false, reference: false })
    expect(computeEquityAsync).not.toHaveBeenCalled()
  })

  it('相手レンジ解決: 即 loading=true → equity 反映 (HU=reference false)', async () => {
    vi.mocked(resolveOpponentRangesResult).mockReturnValue({ ranges: [{}], reference: false } as never)
    vi.mocked(computeEquityAsync).mockResolvedValue({ equity: 0.62, samples: 1000 } as never)
    const { result } = renderHook(() => useEquity(state, 'hero', true))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.equity).toBeCloseTo(0.62)
    expect(result.current.reference).toBe(false)
  })

  it('マルチウェイ解決: reference=true を保つ', async () => {
    vi.mocked(resolveOpponentRangesResult).mockReturnValue({ ranges: [{}, {}], reference: true } as never)
    vi.mocked(computeEquityAsync).mockResolvedValue({ equity: 0.4, samples: 500 } as never)
    const { result } = renderHook(() => useEquity(state, 'hero', true))
    await waitFor(() => expect(result.current.equity).toBeCloseTo(0.4))
    expect(result.current.reference).toBe(true)
  })

  it('相手レンジ未解決: reason を渡し計算しない', () => {
    vi.mocked(resolveOpponentRangesResult).mockReturnValue({ reason: 'uncovered_line' } as never)
    const { result } = renderHook(() => useEquity(state, 'hero', true))
    expect(result.current.equity).toBeNull()
    expect(result.current.reason).toBe('uncovered_line')
    expect(computeEquityAsync).not.toHaveBeenCalled()
  })

  it('samples=0 (有効割当なし): reason=sampling_failed / equity=null', async () => {
    vi.mocked(resolveOpponentRangesResult).mockReturnValue({ ranges: [{}], reference: true } as never)
    vi.mocked(computeEquityAsync).mockResolvedValue({ equity: 0.5, samples: 0 } as never)
    const { result } = renderHook(() => useEquity(state, 'hero', true))
    await waitFor(() => expect(result.current.reason).toBe('sampling_failed'))
    expect(result.current.equity).toBeNull()
    expect(result.current.reference).toBe(true)
  })
})
