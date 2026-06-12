import type { Card } from '../../types/game'
import type { Combo } from './riverSolver'
import { sameCard } from '../../engine/cards/Card'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import { comboKey } from './riverRanges'
import { comboIndexPerm, type SuitPerm } from './suitIsomorphism'

// R15-A: 純粋な top-N から「重みしきい値 + 上限」に変更。
// しきい値で意味ある尾部 (mixed 戦略のコール頻度 0.05+) を保持しつつ、
// 上限で SRP の超巨大レンジ (500+ combos) を抑制して live solve 性能を確保する。
// must は必ず保持 (hero の手札)。実測 (scripts/measure-ranges.ts) で SRP は 200-570 combos,
// 重み最小は 0.05-0.30。上限 200・しきい値 0.05 で大半のレンジを 90%+ カバー。
export const MAX_COMBOS = 200
export const MIN_WEIGHT = 0.05

// cap 既定 200。R14② turn 完全チャンス CFR は O(combos²×runout) と重いため cap=60 を渡す。
export function capRange(combos: Combo[], mustKey?: string, cap: number = MAX_COMBOS): Combo[] {
  let kept = combos.filter(c => c.weight >= MIN_WEIGHT)
  if (kept.length > cap) {
    kept = [...kept].sort((a, b) => b.weight - a.weight).slice(0, cap)
  }
  if (mustKey && !kept.some(c => comboKey(c.cards) === mustKey)) {
    const must = combos.find(c => comboKey(c.cards) === mustKey)
    if (must) {
      if (kept.length >= cap) kept[kept.length - 1] = must
      else kept.push(must)
    }
  }
  return kept
}

// suitIso 縮約の前提=レンジの置換閉性を保ったまま cap する capRange 変種。
// weight 降順だがスート軌道(perms の下で互いに写り合う combo 集合)を丸ごと keep/drop し、
// cap は軌道境界で切る(入り切らない軌道は丸ごと drop して次の軌道へ)。
// レンジが閉じない perm は捨てる(安全弁・軌道は残った perm の閉包で計算)。既存 capRange は不変。
export function capRangeSuitClosed(combos: Combo[], cap: number, perms: SuitPerm[]): Combo[] {
  const kept = combos.filter(c => c.weight >= MIN_WEIGHT)
  if (kept.length <= cap) return kept
  const maps = perms
    .map(p => comboIndexPerm(kept, p))
    .filter((m): m is Int32Array => m != null)
  // 軌道分割(perm 写像の推移閉包)。perms が群なら1ステップで閉じるが、非群入力でも安全。
  const orbitOf = new Int32Array(kept.length).fill(-1)
  const orbits: number[][] = []
  for (let i = 0; i < kept.length; i++) {
    if (orbitOf[i] >= 0) continue
    const orbit: number[] = []
    const stack = [i]
    orbitOf[i] = orbits.length
    while (stack.length > 0) {
      const x = stack.pop()!
      orbit.push(x)
      for (const m of maps) {
        const y = m[x]
        if (orbitOf[y] < 0) { orbitOf[y] = orbits.length; stack.push(y) }
      }
    }
    orbit.sort((a, b) => a - b)
    orbits.push(orbit)
  }
  // 軌道内 weight は comboIndexPerm の検査により同一 → 先頭要素で代表。同 weight は元 index 昇順。
  orbits.sort((a, b) => kept[b[0]].weight - kept[a[0]].weight || a[0] - b[0])
  const keepFlag = new Uint8Array(kept.length)
  let count = 0
  for (const orbit of orbits) {
    if (count + orbit.length > cap) continue
    for (const idx of orbit) keepFlag[idx] = 1
    count += orbit.length
  }
  return kept.filter((_c, i) => keepFlag[i] === 1)
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
