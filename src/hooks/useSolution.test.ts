import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// 依存 (spot 解決 / 解供給) をモックし、フックの「loading 遷移」と「キャンセル」を単体検証する。
vi.mock('../lib/solver/spotKey', () => ({ resolveSpotKey: vi.fn() }))
vi.mock('../lib/solver/getSolution', () => ({ getSolution: vi.fn() }))

import { useSolution } from './useSolution'
import { resolveSpotKey } from '../lib/solver/spotKey'
import { getSolution } from '../lib/solver/getSolution'
import type { GameState } from '../types/game'
import type { NodeSolution, SpotKey } from '../types/solver'

const fakeState = {} as GameState
const fakeSpot = { baseSpotId: 'btn-open', street: 'preflop' } as SpotKey
const fakeNode = { spotId: 'btn-open', street: 'preflop', strategy: {}, potBB: 1.5, source: 'approximate' } as NodeSolution

beforeEach(() => { vi.clearAllMocks() })

describe('useSolution', () => {
  it('対象外スポット (resolveSpotKey=null): loading=false / node=null / getSolution 未呼び出し', () => {
    vi.mocked(resolveSpotKey).mockReturnValue(null)
    const { result } = renderHook(() => useSolution(fakeState, 'hero', true))
    expect(result.current).toEqual({ node: null, loading: false })
    expect(getSolution).not.toHaveBeenCalled()
  })

  it('対応スポット: 即 loading=true → 解決後に node セット・loading=false', async () => {
    vi.mocked(resolveSpotKey).mockReturnValue(fakeSpot)
    vi.mocked(getSolution).mockResolvedValue(fakeNode)
    const { result } = renderHook(() => useSolution(fakeState, 'hero', true))
    expect(result.current.loading).toBe(true) // 求解中を即時表示 (R13)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.node).toBe(fakeNode)
  })

  it('state=null のときは解決もしない', () => {
    const { result } = renderHook(() => useSolution(null, 'hero', true))
    expect(result.current).toEqual({ node: null, loading: false })
    expect(resolveSpotKey).not.toHaveBeenCalled()
  })

  it('multiwayReference を resolveSpotKey に伝える', () => {
    vi.mocked(resolveSpotKey).mockReturnValue(null)
    renderHook(() => useSolution(fakeState, 'hero', false, true))
    expect(resolveSpotKey).toHaveBeenCalledWith(fakeState, 'hero', { multiwayReference: true })
  })

  it('unmount 後に解決しても状態更新しない (cancelled ガード)', async () => {
    vi.mocked(resolveSpotKey).mockReturnValue(fakeSpot)
    let resolveFn: (n: NodeSolution | null) => void = () => {}
    vi.mocked(getSolution).mockReturnValue(new Promise<NodeSolution | null>(res => { resolveFn = res }))
    const { result, unmount } = renderHook(() => useSolution(fakeState, 'hero', true))
    expect(result.current.loading).toBe(true)
    unmount()
    await act(async () => { resolveFn(fakeNode); await Promise.resolve() })
    // cancelled ガードにより unmount 時点の値のまま (解決結果は反映されない・警告も出ない)。
    expect(result.current.loading).toBe(true)
    expect(result.current.node).toBeNull()
  })
})
