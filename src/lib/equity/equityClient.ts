import { computeEquity, type EquityInput, type EquityResult } from './monteCarlo'
import { computeRangeEquity, type RangeEquityInput, type RangeEquityResult } from './rangeVsRange'

// エクイティ計算を Web Worker に委譲する窓口。非対応環境 (テスト) はインライン実行。
let worker: Worker | null | undefined // undefined=未試行 / null=利用不可
const pending = new Map<number, (err: Error) => void>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    if (typeof Worker === 'undefined') { worker = null; return null }
    worker = new Worker(new URL('../../workers/equity.worker.ts', import.meta.url), { type: 'module' })
    // モジュール Worker のロード失敗は同期例外ではなく error イベントで届く。
    // 保留中の計算を reject し worker=null に戻す(次回以降はインライン fallback 経路へ)。
    worker.addEventListener('error', () => {
      const err = new Error('equity worker failed to load')
      const waiting = [...pending.values()]
      pending.clear()
      worker = null
      for (const reject of waiting) reject(err)
    })
  } catch {
    worker = null
  }
  return worker
}

let nextId = 1

const WORKER_TIMEOUT_MS = 60_000 // 防御的タイムアウト: worker ハング時の永久 pending を避ける

// id ベースの req/res プロトコルで1件を投げて解を待つ。error/timeout で必ず settle させる。
function requestFromWorker<T>(
  w: Worker,
  build: (id: number) => object,
  parse: (data: unknown) => T | undefined,
): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { id: number; error?: string }
      if (data.id !== id) return
      cleanup()
      if (data.error) { reject(new Error(data.error)); return }
      const result = parse(e.data)
      if (result === undefined) reject(new Error('no result'))
      else resolve(result)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('equity worker timed out'))
    }, WORKER_TIMEOUT_MS)
    function cleanup() {
      w.removeEventListener('message', onMsg)
      clearTimeout(timer)
      pending.delete(id)
    }
    pending.set(id, err => { cleanup(); reject(err) })
    w.addEventListener('message', onMsg)
    w.postMessage(build(id))
  })
}

export function computeEquityAsync(input: EquityInput): Promise<EquityResult> {
  const w = getWorker()
  if (!w) {
    try {
      return Promise.resolve(computeEquity(input))
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }
  return requestFromWorker(
    w,
    id => ({ id, input }),
    data => {
      const d = data as { equity?: number; samples?: number }
      return { equity: d.equity ?? 0, samples: d.samples ?? 0 }
    },
  )
}

// レンジ vs レンジのエクイティ分布を Worker で計算する。非対応環境はインライン。
export function computeRangeEquityAsync(rangeInput: RangeEquityInput): Promise<RangeEquityResult> {
  const w = getWorker()
  if (!w) {
    try {
      return Promise.resolve(computeRangeEquity(rangeInput))
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }
  return requestFromWorker(
    w,
    id => ({ id, rangeInput }),
    data => (data as { result?: RangeEquityResult }).result,
  )
}
