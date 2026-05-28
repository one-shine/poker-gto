import type { RangeScenario } from '../../types/ranges'

export const TOTAL_COMBOS = 1326 // C(52,2)

// 169 ハンド表記 (例 AA / AKs / AKo) → 実コンボ数 (6/4/12)。
export function combosForHand(hand: string): number {
  if (hand.length === 2) return 6 // ペア
  return hand.endsWith('s') ? 4 : 12 // スーテッド / オフスート
}

export interface RangeStats {
  combos: number       // raise + call の総コンボ重み (頻度×コンボ数)
  raiseCombos: number  // raise だけのコンボ重み
  callCombos: number   // call だけのコンボ重み
  pair: number         // ペアの重み
  suited: number       // スーテッドの重み
  offsuit: number      // オフスートの重み
  widthPct: number     // combos / TOTAL_COMBOS (0..1)
}

// レンジを「コンボ数」基準で集計する (169ハンドでなく実コンボ重みで見る)。
// 純関数として export し、ユニットテスト可能にする (R22)。
export function rangeStats(scenario: RangeScenario): RangeStats {
  let combos = 0, raiseCombos = 0, callCombos = 0, pair = 0, suited = 0, offsuit = 0
  for (const [hand, cell] of Object.entries(scenario.cells)) {
    const cc = combosForHand(hand)
    const inRange = cell.raise + cell.call
    if (inRange <= 0) continue
    const w = cc * inRange
    combos += w
    raiseCombos += cc * cell.raise
    callCombos += cc * cell.call
    if (hand.length === 2) pair += w
    else if (hand.endsWith('s')) suited += w
    else offsuit += w
  }
  return { combos, raiseCombos, callCombos, pair, suited, offsuit, widthPct: combos / TOTAL_COMBOS }
}
