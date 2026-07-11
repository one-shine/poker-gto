import { solveRiver, type RiverInput, type SolvedNodeSummary } from './riverSolver'
import { solveTurn } from './turnSolver'

export interface SolveResult {
  nodes: SolvedNodeSummary[]
  exploitability: number
}

// 求解を Web Worker に委譲する窓口。Worker 非対応環境 (テスト等) ではメインスレッドで実行。
// リバーは軽いのでインライン実行でも実用的。重いターン/フロップで Worker の恩恵が出る。

let worker: Worker | null | undefined // undefined=未試行 / null=利用不可
const pending = new Map<number, (err: Error) => void>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    if (typeof Worker === 'undefined') { worker = null; return null }
    worker = new Worker(new URL('../../workers/solver.worker.ts', import.meta.url), { type: 'module' })
    // モジュール Worker のロード失敗は同期例外ではなく error イベントで届く。
    // 保留中の求解を reject し worker=null に戻す(次回以降はインライン fallback 経路へ)。
    worker.addEventListener('error', () => {
      const err = new Error('solver worker failed to load')
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

const WORKER_TIMEOUT_MS = 120_000 // 防御的タイムアウト: worker ハング時の永久 pending を避ける

// インラインフォールバック (Worker 非対応 / テスト / ロード失敗後)。
function inlineSolve(input: RiverInput): Promise<SolveResult> {
  try {
    const sol = input.useChanceCFR ? solveTurn(input) : solveRiver(input)
    return Promise.resolve({ nodes: sol.nodes, exploitability: sol.exploitability })
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)))
  }
}

export function solveRiverAsync(input: RiverInput): Promise<SolveResult> {
  const w = getWorker()
  if (!w) return inlineSolve(input)
  // 巻き上げられる cleanup() は絞り込み後の w でも null 可能性が残るため、非 null の const に束縛する。
  const activeWorker: Worker = w
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { id: number; nodes?: SolvedNodeSummary[]; exploitability?: number; error?: string }
      if (data.id !== id) return
      cleanup()
      if (data.error) reject(new Error(data.error))
      else resolve({ nodes: data.nodes ?? [], exploitability: data.exploitability ?? 0 })
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('solver worker timed out'))
    }, WORKER_TIMEOUT_MS)
    function cleanup() {
      activeWorker.removeEventListener('message', onMsg)
      clearTimeout(timer)
      pending.delete(id)
    }
    pending.set(id, err => { cleanup(); reject(err) })
    activeWorker.addEventListener('message', onMsg)
    activeWorker.postMessage({ id, input })
  })
}
