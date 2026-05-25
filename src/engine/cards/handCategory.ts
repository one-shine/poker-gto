import type { Card } from '../../types/game'
import { RANK_VALUES } from './Card'

// 2枚のホールカードを 169 種のレンジ表記に変換する ("AA" / "AKs" / "AKo")。
// レンジデータ (PREFLOP_SCENARIOS) のキーと一致させるための共通ヘルパー。
export function handCategory(cards: Card[]): string {
  if (cards.length !== 2) {
    throw new Error(`handCategory requires exactly 2 cards, got ${cards.length}`)
  }
  const [a, b] = cards
  const [hi, lo] = RANK_VALUES[a.rank] >= RANK_VALUES[b.rank] ? [a, b] : [b, a]
  if (hi.rank === lo.rank) return `${hi.rank}${lo.rank}`
  const suited = a.suit === b.suit ? 's' : 'o'
  return `${hi.rank}${lo.rank}${suited}`
}
