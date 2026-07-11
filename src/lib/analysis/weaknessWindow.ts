import type { MistakeCategory, MistakeRecord } from '../../types/stats'

// 弱点 TOP の集計ウィンドウ。克服済みのミスが累積で永久に居座らないよう、
// 直近の期間 + 件数で絞る (どちらか一方が広くても他方で頭打ちにして自然減衰させる)。
export const WEAKNESS_WINDOW_DAYS = 14
export const WEAKNESS_WINDOW_MAX = 100

const DAY_MS = 24 * 60 * 60 * 1000

export interface WeaknessAgg {
  category: MistakeCategory
  count: number
  evLost: number // approximate ソースのミスは 0 (evLoss 非提示)
}

function aggregateByCategory(mistakes: MistakeRecord[]): WeaknessAgg[] {
  const byCat = new Map<MistakeCategory, WeaknessAgg>()
  for (const m of mistakes) {
    const a = byCat.get(m.category) ?? { category: m.category, count: 0, evLost: 0 }
    a.count++
    a.evLost += m.evLoss
    byCat.set(m.category, a)
  }
  return [...byCat.values()].sort((a, b) => b.count - a.count)
}

// 直近ウィンドウ (windowDays 日以内 かつ 直近 maxRecent 件) のカテゴリ別集計。
// mistakes は記録順 (時系列昇順) 前提。
export function aggregateRecentWeaknesses(
  mistakes: MistakeRecord[],
  opts: { now?: number; windowDays?: number; maxRecent?: number } = {},
): WeaknessAgg[] {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? WEAKNESS_WINDOW_DAYS
  const maxRecent = opts.maxRecent ?? WEAKNESS_WINDOW_MAX
  const cutoff = now - windowDays * DAY_MS
  const recent = mistakes.filter(m => m.timestamp >= cutoff).slice(-maxRecent)
  return aggregateByCategory(recent)
}

// 全期間のカテゴリ別集計 (補助表示用)。
export function aggregateAllTimeWeaknesses(mistakes: MistakeRecord[]): WeaknessAgg[] {
  return aggregateByCategory(mistakes)
}
