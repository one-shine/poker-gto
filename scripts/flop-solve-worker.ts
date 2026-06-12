/**
 * flop 求解 Worker (worker_threads)。
 * precompute-flop.ts の JobPool から 1 ジョブを受け取り、solveFlop() を直接呼び、
 * findHeroNode で lead / facing 両テーブルを抽出して parentPort に返す。
 *
 * 同一ツリーを1回だけ解いて lead/facing 両ノードを抽出する
 * (従来 precompute-postflop.ts が同じ木を2回解いていた問題を解消)。
 * heroIsOOP は orchestrator から渡す (worker 側で spotRanges を再解決しない)。
 */
import { parentPort } from 'node:worker_threads'
import { solveFlop } from '../src/lib/solver/flopSolver.ts'
import { findHeroNode, comboActionsAt, heroPhase } from '../src/lib/solver/postflopNode.ts'
import { comboKey } from '../src/lib/solver/riverRanges.ts'
import type { ActionSolution } from '../src/types/solver.ts'
import type { CfrOpts } from '../src/lib/solver/chanceCfr.ts'
import type { JobResult } from './lib/jobPool.ts'

export interface FlopJobInput {
  spotId: string
  boardId: string
  potType: 'srp' | '3bet'
  board: { rank: string; suit: string }[]  // Card は直列化不可なので plain object
  oop: { cards: [{ rank: string; suit: string }, { rank: string; suit: string }]; weight: number }[]
  ip:  { cards: [{ rank: string; suit: string }, { rank: string; suit: string }]; weight: number }[]
  potBB: number
  stackBB: number
  iters: number
  cap: number
  heroIsOOP: boolean  // orchestrator で解決済み (spotRanges の再呼び出し不要)
  cfrOpts?: CfrOpts   // 収束改善オプション (DCFR 等)
}

export interface FlopJobOutput {
  spotId: string
  boardId: string
  potType: 'srp' | '3bet'
  board: { rank: string; suit: string }[]
  potBB: number
  effStackBB: number
  exploitability: number
  iters: number
  fullEnumeration: boolean
  // lead / facing 両ノードの戦略テーブル。該当ノードが無い場合は null。
  lead: Record<string, ActionSolution[]> | null
  facing: Record<string, ActionSolution[]> | null
  heroIsOOP: boolean
}

if (!parentPort) throw new Error('このファイルは Worker として起動してください')

parentPort.on('message', async ({ jobIndex, job }: { jobIndex: number; job: FlopJobInput }) => {
  try {
    const result = await solveJob(job)
    const msg: JobResult<FlopJobOutput> = { jobIndex, result }
    parentPort!.postMessage(msg)
  } catch (e) {
    const msg: JobResult<FlopJobOutput> = {
      jobIndex,
      error: e instanceof Error ? e.message : String(e),
    }
    parentPort!.postMessage(msg)
  }
})

async function solveJob(job: FlopJobInput): Promise<FlopJobOutput> {
  // plain object → 型付き Card[] に復元 (worker_threads でクローンされるため)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const board = job.board as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oop = job.oop as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ip  = job.ip  as any[]

  const { nodes, exploitability } = solveFlop({
    board, oop, ip,
    potBB: job.potBB,
    stackBB: job.stackBB,
    iterations: job.iters,
    cfrOpts: job.cfrOpts,
  })

  // heroIsOOP は orchestrator から受け取る (worker 側での spotRanges 再解決を廃止)
  const heroIsOOP = job.heroIsOOP
  // oop/ip はすでに orchestrator で capRangeSuitClosed 済み
  const heroSide = heroIsOOP ? oop : ip

  function extractStrategy(facing: boolean): Record<string, ActionSolution[]> | null {
    const phase = heroPhase(facing, false)
    const node = findHeroNode(nodes, heroIsOOP, phase)
    if (!node) return null
    const strategy: Record<string, ActionSolution[]> = {}
    heroSide.forEach((combo: typeof oop[0], idx: number) => {
      const acts = comboActionsAt(node, idx)
      if (acts.length > 0) strategy[comboKey(combo.cards)] = acts
    })
    return Object.keys(strategy).length > 0 ? strategy : null
  }

  // solveFlop の turn/river runout が完全列挙かはオプション不在=既定全列挙
  const fullEnumeration = true

  return {
    spotId: job.spotId,
    boardId: job.boardId,
    potType: job.potType,
    board: job.board,
    potBB: job.potBB,
    effStackBB: job.stackBB,
    exploitability,
    iters: job.iters,
    fullEnumeration,
    lead: extractStrategy(false),
    facing: extractStrategy(true),
    heroIsOOP,
  }
}
