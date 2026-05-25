import { solveRiver, type RiverInput } from '../lib/solver/riverSolver'

// 求解を メインスレッド外で実行する Web Worker。
// DOM lib の Window 型と衝突しないよう self を最小型にキャストする。
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (m: unknown) => void
}

ctx.onmessage = (e: MessageEvent) => {
  const { id, input } = e.data as { id: number; input: RiverInput }
  try {
    const sol = solveRiver(input)
    ctx.postMessage({ id, nodes: sol.nodes, exploitability: sol.exploitability })
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
