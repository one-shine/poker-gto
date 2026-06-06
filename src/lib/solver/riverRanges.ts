import type { Card, Position, Rank, Suit } from '../../types/game'
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

// レンジを引く元 (プリフロップシナリオ + どの頻度を使うか)。
interface RangeRef { scenarioId: string; pick: 'raise' | 'call' }
interface PotSpec { oop: RangeRef; ip: RangeRef; heroIsOOP: boolean }

// ポストフロップのアクション順 (HU): 左から SB→BB→…→BTN。後ろ (BTN寄り) ほど IP。
const POSTFLOP_ORDER: Position[] = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN']
function postflopOOP(a: Position, b: Position): Position {
  return POSTFLOP_ORDER.indexOf(a) < POSTFLOP_ORDER.indexOf(b) ? a : b
}

// 3bet ポット: opener が 3bet を受けてコールした単発 3bet ドポット (R16)。
// 3better レンジ = `{3better}-vs-{opener}` の raise(3bet頻度)。
// caller  レンジ = `{opener}-vs-{3better}-3bet` の call(対3betコール頻度)。
const THREE_BET_POTS: { threeBetter: Position; opener: Position }[] = [
  { threeBetter: 'SB', opener: 'BTN' },
  { threeBetter: 'BB', opener: 'BTN' },
  { threeBetter: 'SB', opener: 'CO' },
  { threeBetter: 'BB', opener: 'CO' },
  { threeBetter: 'BTN', opener: 'CO' },
]
function findThreeBetPot(a: Position, b: Position) {
  return THREE_BET_POTS.find(
    p => (p.threeBetter === a && p.opener === b) || (p.threeBetter === b && p.opener === a),
  )
}
const lc = (p: Position) => p.toLowerCase()

// baseSpotId からポストフロップの OOP/IP レンジ参照と hero の位置を解決する。
// 単一窓口にすることで deriveRiverRanges と heroRangeSpec が同じ前提を共有する。
//  - bb-vs-X            : hero=BB=OOP / villain=X=IP (SRP)
//  - X-open             : hero=X=IP   / villain=BB=OOP (SRP)
//  - 3bp-{hero}-vs-{vil}: 3bet ポット (どちらが 3better かは THREE_BET_POTS で判定)
// 対応外 (マルチウェイ/SBコンプリート等) は null。
function potSpec(baseSpotId: string): PotSpec | null {
  const bb = /^bb-vs-(utg|mp|co|btn|sb)$/.exec(baseSpotId)
  if (bb) {
    return {
      oop: { scenarioId: baseSpotId, pick: 'call' },
      ip: { scenarioId: `${bb[1]}-open`, pick: 'raise' },
      heroIsOOP: true,
    }
  }
  const open = /^(utg|mp|co|btn|sb)-open$/.exec(baseSpotId)
  if (open) {
    return {
      oop: { scenarioId: `bb-vs-${open[1]}`, pick: 'call' },
      ip: { scenarioId: baseSpotId, pick: 'raise' },
      heroIsOOP: false,
    }
  }
  const three = /^3bp-(utg|mp|co|btn|sb|bb)-vs-(utg|mp|co|btn|sb|bb)$/.exec(baseSpotId)
  if (three) {
    const heroPos = three[1].toUpperCase() as Position
    const villPos = three[2].toUpperCase() as Position
    const pot = findThreeBetPot(heroPos, villPos)
    if (!pot) return null
    const threeBetRange: RangeRef = { scenarioId: `${lc(pot.threeBetter)}-vs-${lc(pot.opener)}`, pick: 'raise' }
    const callerRange: RangeRef = { scenarioId: `${lc(pot.opener)}-vs-${lc(pot.threeBetter)}-3bet`, pick: 'call' }
    const oopPos = postflopOOP(heroPos, villPos)
    const oop = oopPos === pot.threeBetter ? threeBetRange : callerRange
    const ip = oopPos === pot.threeBetter ? callerRange : threeBetRange
    return { oop, ip, heroIsOOP: heroPos === oopPos }
  }
  return null
}

// hero の手札を引くべきレンジ参照 (出題側がレンジ内 hero ハンドを選ぶのに使う)。
export function heroRangeSpec(baseSpotId: string): RangeRef | null {
  const spec = potSpec(baseSpotId)
  if (!spec) return null
  return spec.heroIsOOP ? spec.oop : spec.ip
}

// base が表す hero の OOP/IP (求解と整合する権威値)。未対応 base は null。
// ライブ配線が seat ベース判定とのクロスチェックに使う (不整合スポットを除外)。
export function baseHeroIsOOP(baseSpotId: string): boolean | null {
  return potSpec(baseSpotId)?.heroIsOOP ?? null
}

// hero を固定せずスポット全体の OOP/IP レンジを導出 (代表ボード事前計算用)。
// deriveRiverRanges と違い特定 hero を forceHero しない = レンジ全コンボを頻度どおり返す。
export function spotRanges(
  baseSpotId: string, board: Card[],
): { oop: Combo[]; ip: Combo[]; heroIsOOP: boolean } | null {
  const spec = potSpec(baseSpotId)
  if (!spec) return null
  const oop = expandRange(spec.oop.scenarioId, spec.oop.pick, board)
  const ip = expandRange(spec.ip.scenarioId, spec.ip.pick, board)
  if (oop.length === 0 || ip.length === 0) return null
  return { oop, ip, heroIsOOP: spec.heroIsOOP }
}

// baseSpotId からポストフロップの OOP/IP レンジと hero の位置を導出。
// hero 側は実手札を重み1で必ず含め、villain 側からは hero のカードを除外する。
export function deriveRiverRanges(
  baseSpotId: string,
  board: Card[],
  heroCards: [Card, Card],
): { oop: Combo[]; ip: Combo[]; heroIsOOP: boolean } | null {
  const spec = potSpec(baseSpotId)
  if (!spec) return null
  const heroRef = spec.heroIsOOP ? spec.oop : spec.ip
  const villRef = spec.heroIsOOP ? spec.ip : spec.oop
  const heroRange = forceHero(expandRange(heroRef.scenarioId, heroRef.pick, board), heroCards)
  const villRange = expandRange(villRef.scenarioId, villRef.pick, [...board, ...heroCards])
  if (heroRange.length === 0 || villRange.length === 0) return null
  const oop = spec.heroIsOOP ? heroRange : villRange
  const ip = spec.heroIsOOP ? villRange : heroRange
  return { oop, ip, heroIsOOP: spec.heroIsOOP }
}
