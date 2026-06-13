/**
 * EV モデル構築ワーカー (worker_threads)。
 * build-postflop-ev.ts の JobPool から 1 ジョブを受け取り、
 * solveFlop → evExtraction で 169×169 vOop/vIp を抽出して親へ返す。
 *
 * suitIso は使わない(evExtraction.rootValueMatrix が iso 縮約解に対応するが、
 * probeEVs が iso 縮約解を throw するため、将来の probeEVs 呼び出しと整合させる)。
 */
import { parentPort } from 'node:worker_threads'
import { solveFlop } from '../src/lib/solver/flopSolver.ts'
import {
  rootValueMatrix, aggregateToCategories,
} from '../src/lib/solver/evExtraction.ts'
import type { CfrOpts } from '../src/lib/solver/chanceCfr.ts'
import type { JobResult } from './lib/jobPool.ts'

export interface EvModelJobInput {
  potKey: string          // 例 "srp-btn-bb"
  board: { rank: string; suit: string }[]
  oop: { cards: [{ rank: string; suit: string }, { rank: string; suit: string }]; weight: number }[]
  ip:  { cards: [{ rank: string; suit: string }, { rank: string; suit: string }]; weight: number }[]
  potBB: number
  stackBB: number
  iters: number
  cap: number             // (参考値・既にキャップ済みのコンボが渡される)
  cfrOpts?: CfrOpts
}

export interface EvModelJobOutput {
  potKey: string
  board: { rank: string; suit: string }[]
  // 169×169 (CATEGORIES 順) の vOop/vIp。衝突ペアは null (JSON は NaN 不可)。
  vOop: (number | null)[][]
  vIp:  (number | null)[][]
  exploitability: number
  potBB: number
  stackBB: number
}

if (!parentPort) throw new Error('このファイルは Worker として起動してください')

parentPort.on('message', async ({ jobIndex, job }: { jobIndex: number; job: EvModelJobInput }) => {
  try {
    const result = await solveJob(job)
    const msg: JobResult<EvModelJobOutput> = { jobIndex, result }
    parentPort!.postMessage(msg)
  } catch (e) {
    const msg: JobResult<EvModelJobOutput> = {
      jobIndex,
      error: e instanceof Error ? e.message : String(e),
    }
    parentPort!.postMessage(msg)
  }
})

async function solveJob(job: EvModelJobInput): Promise<EvModelJobOutput> {
  // worker_threads でクローンされるため plain object → 型付き配列で受け取る
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const board = job.board as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oop = job.oop as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ip  = job.ip  as any[]

  const solution = solveFlop({
    board,
    oop,
    ip,
    potBB: job.potBB,
    stackBB: job.stackBB,
    iterations: job.iters,
    cfrOpts: job.cfrOpts,
    // suitIso は使わない(probeEVs との整合・evExtraction の既存 iso 対応で追加可)
  })

  const { vOop: rawOop, vIp: rawIp } = rootValueMatrix(solution, oop, ip)
  const catOop = aggregateToCategories({ oop, ip }, rawOop, 'oop')
  const catIp  = aggregateToCategories({ oop, ip }, rawIp,  'ip')

  // NaN → null に変換 (JSON シリアライズのため)
  const toNullable = (mat: number[][]): (number | null)[][] =>
    mat.map(row => row.map(v => (Number.isFinite(v) ? v : null)))

  return {
    potKey:        job.potKey,
    board:         job.board,
    vOop:          toNullable(catOop),
    vIp:           toNullable(catIp),
    exploitability: solution.exploitability,
    potBB:         job.potBB,
    stackBB:       job.stackBB,
  }
}
