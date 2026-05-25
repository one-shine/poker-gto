import { solveRiver, type RiverInput, type SolvedNodeSummary } from './riverSolver'

export interface SolveResult {
  nodes: SolvedNodeSummary[]
  exploitability: number
}

// 求解を Web Worker に委譲する窓口。Worker 非対応環境 (テスト等) ではメインスレッドで実行。
// リバーは軽いのでインライン実行でも実用的。重いターン/フロップで Worker の恩恵が出る。

let worker: Worker | null | undefined // undefined=未試行 / null=利用不可
function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    if (typeof Worker === 'undefined') { worker = null; return null }
    worker = new Worker(new URL('../../workers/solver.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null
  }
  return worker
}

let nextId = 1

export function solveRiverAsync(input: RiverInput): Promise<SolveResult> {
  const w = getWorker()
  if (!w) {
    // インラインフォールバック (Worker 非対応 / テスト)
    try {
      const sol = solveRiver(input)
      return Promise.resolve({ nodes: sol.nodes, exploitability: sol.exploitability })
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { id: number; nodes?: SolvedNodeSummary[]; exploitability?: number; error?: string }
      if (data.id !== id) return
      w.removeEventListener('message', onMsg)
      if (data.error) reject(new Error(data.error))
      else resolve({ nodes: data.nodes ?? [], exploitability: data.exploitability ?? 0 })
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ id, input })
  })
}
