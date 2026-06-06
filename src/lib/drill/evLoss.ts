// 選んだアクションの EV 損失 = 最良EV − 選択EV (BB)。
// どちらかが非有限 (NaN=未収録 / EVなし) なら null を返す。preflop は EV を持たないため常に null。
export function evLossFrom<A extends string>(all: { action: A; ev: number }[], chosen: A): number | null {
  const finite = all.filter(a => Number.isFinite(a.ev))
  const chosenInfo = all.find(a => a.action === chosen)
  if (finite.length === 0 || !chosenInfo || !Number.isFinite(chosenInfo.ev)) return null
  const best = Math.max(...finite.map(a => a.ev))
  return Math.max(0, best - chosenInfo.ev)
}
