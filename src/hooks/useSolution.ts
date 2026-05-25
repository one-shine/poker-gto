import { useEffect, useState } from 'react'
import type { GameState } from '../types/game'
import type { NodeSolution } from '../types/solver'
import { resolveSpotKey } from '../lib/solver/spotKey'
import { getSolution } from '../lib/solver/getSolution'

export interface SolutionState {
  node: NodeSolution | null
  loading: boolean // 求解(ライブ)が進行中か。スポット非対応時は false + node null。
}

// 意思決定スポットの GTO 解を非同期取得する共有フック。
// loading で「求解中」と「評価対象外」を区別できる (R13)。
export function useSolution(
  state: GameState | null,
  heroId: string,
  allowLiveSolve: boolean,
): SolutionState {
  const [st, setSt] = useState<SolutionState>({ node: null, loading: false })
  useEffect(() => {
    let cancelled = false
    const spot = state ? resolveSpotKey(state, heroId) : null
    // 求解は非同期。対応スポットなら loading=true を即時反映する(fetch効果)。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 求解の loading 表示に必要
    setSt({ node: null, loading: !!spot })
    if (spot) {
      getSolution(spot, { allowLiveSolve }).then(n => {
        if (!cancelled) setSt({ node: n, loading: false })
      })
    }
    return () => { cancelled = true }
  }, [state, heroId, allowLiveSolve])
  return st
}
