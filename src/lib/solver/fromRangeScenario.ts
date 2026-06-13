import type { RangeCell, RangeScenario } from '../../types/ranges'
import type { ActionSolution, NodeSolution } from '../../types/solver'

// 手作り近似レンジ (RangeScenario) を NodeSolution へ橋渡しする (source: 'approximate')。
// 実ソルバーCSV取込 (scripts/import-ranges.ts) 完了後、data/solutions/ の
// solver_precomputed 解に順次置換される移行用の変換。
// ev は不明のため 0 プレースホルダ。approximate では evLoss を信頼せず頻度で正誤判定する。
export function fromRangeScenario(scenario: RangeScenario): NodeSolution {
  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(scenario.cells)) {
    strategy[hand] = cellToActions(cell, scenario.raiseSize)
  }
  return {
    street: 'preflop',
    spotId: scenario.id,
    strategy,
    potBB: 1.5, // SB + BB (近似)
    source: 'approximate',
    meta: { sourceName: 'GTO理論準拠の近似レンジ（一般理論ベース）', license: 'original', version: '0' },
  }
}

function cellToActions(cell: RangeCell, raiseSizeBB: number): ActionSolution[] {
  const acts: ActionSolution[] = []
  if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: raiseSizeBB, frequency: cell.raise, ev: 0 })
  if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: 0 })
  if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: 0 })
  return acts
}
