import type { ActionRecord, Position } from '../../types/game'
import type { MistakeRecord } from '../../types/stats'
import { HERO_ID } from '../../stores/gameStore'

export const POSITIONS: Position[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']

export interface PositionRow {
  position: Position
  hands: number       // そのポジションでプレイしたハンド数
  decisions: number   // HU でのヒーロー判断数 (プレイ量の指標)
  vpip: number        // preflop で call/raise/allin したハンド数
  pfr: number         // preflop で raise/allin したハンド数
  mistakes: number    // 紐づくミス数
  evLost: number      // 紐づく EV 損失合計 (BB)
  // R20: コーチが実際に評価した判断数/正解数 (精度の厳密な母数)。evalByPosition 提供時のみ定義。
  evaluated?: number
  correct?: number
}

// handHistory(アクション列)+ mistakes から、ポジション別の実績を集計する。
// マルチウェイ(villain 2人以上)は GTO 精度の母数から除外 (CLAUDE.md ルール4)。
// R20: evalByPosition (sessionStore のポジション別 評価/正解数) を渡すと、精度の母数が
// 「全HU判断」でなく「コーチが実評価した判断」になる (未評価/ヒント参照スポットを楽観計上しない)。
// 純関数として export し、ユニットテスト可能にする (R22)。
export function aggregatePositionStats(
  handHistory: ActionRecord[][],
  mistakes: MistakeRecord[],
  evalByPosition?: Partial<Record<Position, { evaluated: number; correct: number }>>,
): PositionRow[] {
  const rows = new Map<Position, PositionRow>()
  for (const p of POSITIONS) {
    rows.set(p, { position: p, hands: 0, decisions: 0, vpip: 0, pfr: 0, mistakes: 0, evLost: 0 })
  }

  for (const hand of handHistory) {
    const heroPos = hand[0]?.heroPosition
    if (!heroPos) continue
    const r = rows.get(heroPos)
    if (!r) continue
    r.hands++

    const heroActs = hand.filter(a => a.playerId === HERO_ID)
    const pre = heroActs.filter(a => a.street === 'preflop')
    if (pre.some(a => a.action === 'call' || a.action === 'raise' || a.action === 'allin')) r.vpip++
    if (pre.some(a => a.action === 'raise' || a.action === 'allin')) r.pfr++
    // HU 判断のみ精度母数に
    r.decisions += heroActs.filter(a => a.villainPositions.length <= 1).length
  }

  for (const m of mistakes) {
    const r = rows.get(m.position)
    if (!r) continue
    r.mistakes++
    r.evLost += m.evLoss
  }

  // R20: 提供時は全ポジションに evaluated/correct を埋める (未評価ポジは 0 → 精度 null=データ不足)。
  if (evalByPosition) {
    for (const p of POSITIONS) {
      const e = evalByPosition[p] ?? { evaluated: 0, correct: 0 }
      const r = rows.get(p)!
      r.evaluated = e.evaluated
      r.correct = e.correct
    }
  }

  return POSITIONS.map(p => rows.get(p)!)
}

// 精度。R20: evaluated が与えられていれば「コーチが実評価した判断のみ」を厳密母数にする
// (0=データ不足→null)。evalByPosition 未提供時のみ旧推定 (decisions ベース) に後方互換でフォールバック。
export function estimateAccuracy(row: PositionRow): number | null {
  if (row.evaluated !== undefined) {
    return row.evaluated > 0 ? (row.correct ?? 0) / row.evaluated : null
  }
  if (row.decisions === 0) return null
  return (row.decisions - row.mistakes) / row.decisions
}
