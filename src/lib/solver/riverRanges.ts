import type { Card, Rank, Suit } from '../../types/game'
import { RANKS, SUITS } from '../../engine/cards/Card'
import { sameCard } from '../../engine/cards/Card'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import type { Combo } from './riverSolver'

// 具体コンボの一意キー (例: "AsKc")。ソートして向き不問にする。
export function comboKey(cards: [Card, Card]): string {
  const s = cards.map(c => `${c.rank}${c.suit[0]}`).sort()
  return s.join('')
}

// 169 カテゴリ表記 ("AA"/"AKs"/"AKo") を具体 2枚コンボ群に展開する。
function expandCategory(cat: string): [Card, Card][] {
  const out: [Card, Card][] = []
  const r1 = cat[0] as Rank
  const r2 = cat[1] as Rank
  const mk = (s1: Suit, s2: Suit): [Card, Card] => [{ rank: r1, suit: s1 }, { rank: r2, suit: s2 }]
  if (cat.length === 2) {
    // ペア: 異なるスート 2枚の組
    for (let i = 0; i < SUITS.length; i++)
      for (let j = i + 1; j < SUITS.length; j++) out.push(mk(SUITS[i], SUITS[j]))
  } else if (cat[2] === 's') {
    for (const s of SUITS) out.push(mk(s, s))
  } else {
    // オフスート: 異なるスート
    for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) out.push(mk(s1, s2))
  }
  return out
}

function usesDead(combo: [Card, Card], dead: Card[]): boolean {
  return dead.some(d => sameCard(d, combo[0]) || sameCard(d, combo[1]))
}

// シナリオの指定アクション頻度をレンジ(具体コンボ+重み)に展開。board/dead を除外。
export function expandRange(
  scenarioId: string,
  pick: 'raise' | 'call',
  dead: Card[],
): Combo[] {
  const scenario = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  if (!scenario) return []
  const combos: Combo[] = []
  for (const [cat, cell] of Object.entries(scenario.cells)) {
    const freq = cell[pick]
    if (freq <= 0) continue
    for (const cc of expandCategory(cat)) {
      if (usesDead(cc, dead)) continue
      combos.push({ cards: cc, weight: freq })
    }
  }
  return combos
}

// 各カテゴリの出現順 (RANKS) を保証する補助 (未使用カテゴリ検出用)。
export const ALL_RANKS = RANKS

// hero の実手札を必ず重み1で含める (既存同一コンボは置換)。
function forceHero(combos: Combo[], heroCards: [Card, Card]): Combo[] {
  const heroK = comboKey(heroCards)
  const filtered = combos.filter(c => comboKey(c.cards) !== heroK)
  filtered.push({ cards: heroCards, weight: 1 })
  return filtered
}

// baseSpotId からポストフロップの OOP/IP レンジと hero の位置を導出。
// HU の 2 レンジは常に「opener の raise レンジ + BB の call レンジ」。hero がどちら側かが base で決まる:
//  - bb-vs-X : hero=BB=OOP (defender) / villain=X=IP (opener)
//  - X-open  : hero=X=IP (opener)     / villain=BB=OOP (defender)
// 対応外 (3bet/マルチウェイ/SBコンプリート等) は null → スキップ。
export function deriveRiverRanges(
  baseSpotId: string,
  board: Card[],
  heroCards: [Card, Card],
): { oop: Combo[]; ip: Combo[]; heroIsOOP: boolean } | null {
  const bb = /^bb-vs-(utg|mp|co|btn|sb)$/.exec(baseSpotId)
  const open = /^(utg|mp|co|btn|sb)-open$/.exec(baseSpotId)

  if (bb) {
    const openerId = `${bb[1]}-open`
    const oop = forceHero(expandRange(baseSpotId, 'call', board), heroCards) // hero=BB=OOP
    const ip = expandRange(openerId, 'raise', [...board, ...heroCards])      // villain=opener=IP
    if (oop.length === 0 || ip.length === 0) return null
    return { oop, ip, heroIsOOP: true }
  }
  if (open) {
    const pos = open[1]
    const ip = forceHero(expandRange(baseSpotId, 'raise', board), heroCards)  // hero=opener=IP
    const oop = expandRange(`bb-vs-${pos}`, 'call', [...board, ...heroCards]) // villain=BB=OOP
    if (oop.length === 0 || ip.length === 0) return null
    return { oop, ip, heroIsOOP: false }
  }
  return null // 未対応スポット
}
