import { computeEquity, type EquityInput, type EquityResult } from './monteCarlo'

// エクイティ計算を Web Worker に委譲する窓口。非対応環境 (テスト) はインライン実行。
let worker: Worker | null | undefined // undefined=未試行 / null=利用不可
function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    if (typeof Worker === 'undefined') { worker = null; return null }
    worker = new Worker(new URL('../../workers/equity.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null
  }
  return worker
}

let nextId = 1

export function computeEquityAsync(input: EquityInput): Promise<EquityResult> {
  const w = getWorker()
  if (!w) {
    try {
      return Promise.resolve(computeEquity(input))
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { id: number; equity?: number; samples?: number; error?: string }
      if (data.id !== id) return
      w.removeEventListener('message', onMsg)
      if (data.error) reject(new Error(data.error))
      else resolve({ equity: data.equity ?? 0, samples: data.samples ?? 0 })
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ id, input })
  })
}
