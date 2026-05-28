import { deriveRiverRanges } from '../src/lib/solver/riverRanges'

const board = [
  { rank: 'A' as const, suit: 'spades' as const },
  { rank: 'K' as const, suit: 'diamonds' as const },
  { rank: '7' as const, suit: 'clubs' as const },
]
const heroCards: [import('../src/types/game').Card, import('../src/types/game').Card] = [
  { rank: 'A', suit: 'hearts' },
  { rank: 'A', suit: 'clubs' },
]
const spots = ['bb-vs-btn', 'bb-vs-co', 'bb-vs-utg', 'btn-open', 'co-open', '3bp-bb-vs-btn', '3bp-btn-vs-bb']
for (const id of spots) {
  const r = deriveRiverRanges(id, board, heroCards)
  if (!r) { console.log(id, '→ null'); continue }
  const sumW = (arr: { weight: number }[]) => arr.reduce((s, c) => s + c.weight, 0)
  const minW = (arr: { weight: number }[]) => arr.reduce((m, c) => Math.min(m, c.weight), 1)
  console.log(`${id}: oop ${r.oop.length} Σw=${sumW(r.oop).toFixed(1)} min=${minW(r.oop).toFixed(3)} / ip ${r.ip.length} Σw=${sumW(r.ip).toFixed(1)} min=${minW(r.ip).toFixed(3)}`)
}
