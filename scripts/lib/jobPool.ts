/**
 * worker_threads 汎用ジョブプール。
 * N 並列で Worker を起動し、キュー内のジョブを順次割り当て、結果を親に集約する。
 */
import { Worker, isMainThread } from 'node:worker_threads'

export interface JobResult<T> {
  jobIndex: number
  result?: T
  error?: string
}

export interface ProgressInfo {
  done: number
  total: number
  elapsedMs: number
}

export interface JobPoolOptions<TResult = unknown> {
  concurrency: number
  workerPath: string
  /** Worker の maxOldGenerationSizeMb (既定 2048) */
  maxOldGenerationSizeMb?: number
  onProgress?: (info: ProgressInfo) => void
  /** 各ジョブ完了の都度呼ばれる。長時間ランの途中クラッシュで全損しないよう、書き込みはここで行う */
  onResult?: (res: JobResult<TResult>) => void
}

/** メインスレッドからのみ呼び出すこと。 */
export function runJobPool<TJob, TResult>(
  jobs: TJob[],
  opts: JobPoolOptions<TResult>,
): Promise<JobResult<TResult>[]> {
  if (!isMainThread) throw new Error('runJobPool はメインスレッド専用')

  return new Promise((resolve, reject) => {
    const results: JobResult<TResult>[] = []
    let nextIdx = 0
    let doneCount = 0
    const t0 = Date.now()
    const total = jobs.length

    if (total === 0) { resolve([]); return }

    const concurrency = Math.min(opts.concurrency, total)

    function spawnNext(worker: Worker) {
      if (nextIdx >= total) {
        worker.terminate()
        return
      }
      const idx = nextIdx++
      worker.postMessage({ jobIndex: idx, job: jobs[idx] })
    }

    function onMessage(worker: Worker, msg: JobResult<TResult>) {
      results.push(msg)
      doneCount++
      opts.onResult?.(msg)
      opts.onProgress?.({ done: doneCount, total, elapsedMs: Date.now() - t0 })

      if (doneCount === total) {
        // 全完了 — ソートして返す
        results.sort((a, b) => a.jobIndex - b.jobIndex)
        resolve(results)
        return
      }
      spawnNext(worker)
    }

    for (let i = 0; i < concurrency; i++) {
      const worker = new Worker(opts.workerPath, {
        execArgv: ['--import', 'tsx'],
        resourceLimits: { maxOldGenerationSizeMb: opts.maxOldGenerationSizeMb ?? 2048 },
      })
      worker.on('message', (msg: JobResult<TResult>) => onMessage(worker, msg))
      worker.on('error', (err) => {
        // ワーカーエラーは致命的 — pool 全体を中断
        reject(new Error(`Worker error: ${err.message}`))
      })
      spawnNext(worker)
    }
  })
}
