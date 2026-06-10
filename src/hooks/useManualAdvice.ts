import { useEffect, useState } from 'react'
import type { SpotKey, NodeSolution } from '../types/solver'
import { getSolution } from '../lib/solver/getSolution'
import { manualEquity } from '../lib/equity/manualEquity'
import type { EquityUnavailableReason } from '../lib/equity/opponentRange'

export interface ManualAdvice {
  node: NodeSolution | null
  loading: boolean      // GTO 戦略(頻度)の求解中
  equity: number | null
  eqLoading: boolean
  eqReason?: EquityUnavailableReason
}

const EMPTY: ManualAdvice = { node: null, loading: false, equity: null, eqLoading: false }

// spot の実質的な変化を検出するキー(配列参照の揺れを無視)。
function spotSignature(spot: SpotKey | null): string {
  if (!spot) return ''
  const b = spot.board?.map(c => c.rank + c.suit[0]).join('') ?? ''
  const h = spot.heroCards?.map(c => c.rank + c.suit[0]).join('') ?? ''
  return [spot.baseSpotId, spot.street, b, h, spot.potBB, spot.effStackBB, spot.riverBetBB, spot.heroIsOOP].join('|')
}

// 相談ツール: 与えられた SpotKey から GTO 戦略(頻度)と勝率を求める。GameState 非依存。
// フロップは「賭け未考慮の粗い近似」のため GTO 頻度を出さず、勝率・ポットオッズのみに留める(正直表示)。
export function useManualAdvice(spot: SpotKey | null): ManualAdvice {
  const [st, setSt] = useState<ManualAdvice>(EMPTY)
  const sig = spotSignature(spot)

  useEffect(() => {
    if (!spot) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- spot 解除時の即時リセット
      setSt(EMPTY)
      return
    }
    let cancelled = false
    const wantStrategy = spot.street !== 'flop'
    setSt({ node: null, loading: wantStrategy, equity: null, eqLoading: true })

    if (wantStrategy) {
      getSolution(spot, { allowLiveSolve: true })
        .then(node => { if (!cancelled) setSt(s => ({ ...s, node, loading: false })) })
        .catch(() => { if (!cancelled) setSt(s => ({ ...s, node: null, loading: false })) })
    }

    if (spot.heroCards) {
      manualEquity(spot.baseSpotId, spot.board ?? [], spot.heroCards)
        .then(r => { if (!cancelled) setSt(s => ({ ...s, equity: r.equity, eqLoading: false, eqReason: r.reason })) })
        .catch(() => { if (!cancelled) setSt(s => ({ ...s, equity: null, eqLoading: false })) })
    } else {
      setSt(s => ({ ...s, eqLoading: false }))
    }

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return st
}
