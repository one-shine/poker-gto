import { useEffect, useState } from 'react'
import type { GameState } from '../types/game'
import { computeEquityAsync } from '../lib/equity/equityClient'
import { resolveOpponentRangesResult, isResolved } from '../lib/equity/opponentRange'
import type { EquityUnavailableReason } from '../lib/equity/opponentRange'

export interface EquityState {
  equity: number | null // null = 算出不能/未対応
  loading: boolean
  // true = マルチウェイ(相手2人以上)の参考値。UI は「参考」と明示する(設計ルール4)。
  reference: boolean
  // equity=null のとき「なぜ出せないか」(UI で1行明示)。算出できたら undefined。
  reason?: EquityUnavailableReason
}

const ITERATIONS = 8000

// hero の vs相手レンジ・エクイティを非同期推定する共有フック。
// HU=厳密 / マルチウェイ=全相手のレンジが定まれば参考値(reference)。レンジ不明は equity=null。
export function useEquity(state: GameState | null, heroId: string, enabled: boolean): EquityState {
  const [st, setSt] = useState<EquityState>({ equity: null, loading: false, reference: false })
  // board.length が依存に効くよう文字列化(配列参照は毎回変わるため)
  const board = state?.board ?? []
  const boardKey = board.map(c => c.rank + c.suit[0]).join('')
  const hero = state?.players.find(p => p.id === heroId)
  const heroKey = hero?.holeCards?.map(c => c.rank + c.suit[0]).join('') ?? ''
  const handId = state?.handId ?? ''

  useEffect(() => {
    if (!enabled || !state || !hero?.holeCards || hero.holeCards.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 非対応時の即時リセット
      setSt({ equity: null, loading: false, reference: false })
      return
    }
    const resolved = resolveOpponentRangesResult(state, heroId)
    if (!isResolved(resolved)) {
      setSt({ equity: null, loading: false, reference: false, reason: resolved.reason })
      return
    }
    let cancelled = false
    setSt({ equity: null, loading: true, reference: resolved.reference })
    computeEquityAsync({
      holeCards: [hero.holeCards[0], hero.holeCards[1]],
      board,
      opponentRanges: resolved.ranges,
      iterations: ITERATIONS,
    }).then(r => {
      // samples=0 = 有効な相手ハンド割当が無い(極稀・ブロッカーで全消し)。
      if (!cancelled) setSt(r.samples > 0
        ? { equity: r.equity, loading: false, reference: resolved.reference }
        : { equity: null, loading: false, reference: resolved.reference, reason: 'sampling_failed' })
    }).catch(() => {
      if (!cancelled) setSt({ equity: null, loading: false, reference: false })
    })
    return () => { cancelled = true }
    // boardKey/heroKey/handId で実質的な変化のみ再計算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, heroId, boardKey, heroKey, handId])

  return st
}
