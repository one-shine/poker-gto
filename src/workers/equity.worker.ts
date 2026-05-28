import { computeEquity, type EquityInput } from '../lib/equity/monteCarlo'
import { computeRangeEquity, type RangeEquityInput } from '../lib/equity/rangeVsRange'

// モンテカルロ・エクイティ計算を別スレッドで実行する。
// input=単一ハンド vs レンジ / rangeInput=レンジ vs レンジ分布 の2系統を扱う。
const ctx = self as unknown as {
  postMessage: (m: unknown) => void
  onmessage: ((e: MessageEvent) => void) | null
}

ctx.onmessage = (e: MessageEvent) => {
  const { id, input, rangeInput } = e.data as {
    id: number
    input?: EquityInput
    rangeInput?: RangeEquityInput
  }
  try {
    if (rangeInput) {
      ctx.postMessage({ id, result: computeRangeEquity(rangeInput) })
    } else if (input) {
      const result = computeEquity(input)
      ctx.postMessage({ id, equity: result.equity, samples: result.samples })
    } else {
      ctx.postMessage({ id, error: 'no input' })
    }
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
