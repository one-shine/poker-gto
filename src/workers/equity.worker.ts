import { computeEquity, type EquityInput } from '../lib/equity/monteCarlo'

// モンテカルロ・エクイティ計算を別スレッドで実行する。
const ctx = self as unknown as {
  postMessage: (m: unknown) => void
  onmessage: ((e: MessageEvent) => void) | null
}

ctx.onmessage = (e: MessageEvent) => {
  const { id, input } = e.data as { id: number; input: EquityInput }
  try {
    const result = computeEquity(input)
    ctx.postMessage({ id, equity: result.equity, samples: result.samples })
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
