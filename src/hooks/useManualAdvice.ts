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
// フロップは precomputed のみ照会(live solve 不走)。ヒットすれば頻度表示、未ヒットは勝率のみ(正直表示)。
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
    // flop は allowLiveSolve:false で precomputed のみ照会(live は走らない=即時に null or ヒット)。
    const allowLive = spot.street !== 'flop'
    setSt({ node: null, loading: true, equity: null, eqLoading: true })

    getSolution(spot, { allowLiveSolve: allowLive })
      .then(node => { if (!cancelled) setSt(s => ({ ...s, node, loading: false })) })
      .catch(() => { if (!cancelled) setSt(s => ({ ...s, node: null, loading: false })) })

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
