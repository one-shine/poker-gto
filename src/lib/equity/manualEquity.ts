import type { Card } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { villainRangeSpec } from '../solver/riverRanges'
import { computeEquityAsync } from './equityClient'
import type { EquityUnavailableReason } from './opponentRange'

const ITERATIONS = 6000

export interface ManualEquityResult {
  equity: number | null
  reason?: EquityUnavailableReason
}

// シナリオの指定アクション頻度を満たすカテゴリ(169表記)を返す。
function scenarioCategories(scenarioId: string, pick: 'raise' | 'call'): string[] {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  if (!sc) return []
  return Object.entries(sc.cells).filter(([, c]) => c[pick] > 0).map(([h]) => h)
}

// hero(具体2枚)の vs 相手レンジ勝率を GameState 無しで算出する(相談ツール用)。
// 相手レンジは baseSpotId の potSpec 由来(=ソルバーが使う相手側と一致)。未対応 base は理由を返す。
export async function manualEquity(
  baseSpotId: string,
  board: Card[],
  heroCards: [Card, Card],
): Promise<ManualEquityResult> {
  const villRef = villainRangeSpec(baseSpotId)
  if (!villRef) return { equity: null, reason: 'uncovered_line' }
  const cats = scenarioCategories(villRef.scenarioId, villRef.pick)
  if (cats.length === 0) return { equity: null, reason: 'uncovered_line' }
  try {
    const r = await computeEquityAsync({
      holeCards: heroCards,
      board,
      opponentRanges: [cats],
      iterations: ITERATIONS,
    })
    return r.samples > 0 ? { equity: r.equity } : { equity: null, reason: 'sampling_failed' }
  } catch {
    return { equity: null, reason: 'sampling_failed' }
  }
}
