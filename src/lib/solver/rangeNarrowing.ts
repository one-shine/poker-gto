import type { Card } from '../../types/game'
import type { Combo } from './riverSolver'
import { sameCard } from '../../engine/cards/Card'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import { comboKey } from './riverRanges'

// R15-A: 純粋な top-N から「重みしきい値 + 上限」に変更。
// しきい値で意味ある尾部 (mixed 戦略のコール頻度 0.05+) を保持しつつ、
// 上限で SRP の超巨大レンジ (500+ combos) を抑制して live solve 性能を確保する。
// must は必ず保持 (hero の手札)。実測 (scripts/measure-ranges.ts) で SRP は 200-570 combos,
// 重み最小は 0.05-0.30。上限 200・しきい値 0.05 で大半のレンジを 90%+ カバー。
export const MAX_COMBOS = 200
export const MIN_WEIGHT = 0.05

export function capRange(combos: Combo[], mustKey?: string): Combo[] {
  let kept = combos.filter(c => c.weight >= MIN_WEIGHT)
  if (kept.length > MAX_COMBOS) {
    kept = [...kept].sort((a, b) => b.weight - a.weight).slice(0, MAX_COMBOS)
  }
  if (mustKey && !kept.some(c => comboKey(c.cards) === mustKey)) {
    const must = combos.find(c => comboKey(c.cards) === mustKey)
    if (must) {
      if (kept.length >= MAX_COMBOS) kept[kept.length - 1] = must
      else kept.push(must)
    }
  }
  return kept
}

// R15-B: river 限定の「ストリート narrowing」ヒューリスティック。
// 入力は preflop の raise/call 全体だが、river 時点ではフロップ・ターンを peel
// した手だけが残っているはず。**5枚ボードでの生強度** (rankValue) で
// 下位 RIVER_NARROW_DROP_FRAC を落として「フロップ・ターンで降りた手」を近似する。
// - river のみ適用 (板5枚で showdown 評価が安定。turn/flop はドロー価値を含めて
//   評価する必要があり R14② 完全チャンスCFR の領域)
// - must (hero の手札) は必ず保持
// - 板と衝突する combo は最下位扱い (drop 優先)
export const RIVER_NARROW_DROP_FRAC = 0.2

export function narrowByRiverStrength(
  combos: Combo[], board: Card[], mustKey?: string,
): Combo[] {
  if (board.length !== 5 || combos.length <= 4) return combos
  const overlapsBoard = (combo: Combo) =>
    board.some(b => sameCard(b, combo.cards[0]) || sameCard(b, combo.cards[1]))
  const scored = combos.map(c => ({
    combo: c,
    rank: overlapsBoard(c) ? -1 : evaluateBestHand([...c.cards, ...board]).rankValue,
  }))
  scored.sort((a, b) => b.rank - a.rank)
  const keepN = Math.max(4, Math.floor(scored.length * (1 - RIVER_NARROW_DROP_FRAC)))
  const kept = scored.slice(0, keepN).map(s => s.combo)
  if (mustKey && !kept.some(c => comboKey(c.cards) === mustKey)) {
    const must = combos.find(c => comboKey(c.cards) === mustKey)
    if (must) kept.push(must)
  }
  return kept
}
