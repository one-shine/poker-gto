import type { Card, Position } from '../../types/game'
import type { SpotKey } from '../../types/solver'
import { sameCard } from '../../engine/cards/Card'
import { baseHeroIsOOP } from './riverRanges'

// ソルバータブ(ハンド相談): フォーム入力から SpotKey を「GameState 無しで」直接組み立てる純関数。
// resolveSpotKey(spotKey.ts) は GameState 依存で再利用できないため、収録スポットへのマップを
// ここに持つ。マップは spotKey.ts / riverRanges.ts と同一規約の複製(共有分類モジュールへの
// 抽出は別タスク・opponentRange.ts も同方針で複製している)。

// ポストフロップで自前ソルバーがレンジ導出に対応するオープナー (BB ディフェンス前提)。
// SB は盲対盲で IP/OOP が反転するため SRP では除外 (baseHeroIsOOP では弾けない=明示チェックが要る)。
const POSTFLOP_OPENERS: Position[] = ['UTG', 'MP', 'CO', 'BTN']

const OPEN_SPOT: Partial<Record<Position, string>> = {
  UTG: 'utg-open', MP: 'mp-open', CO: 'co-open', BTN: 'btn-open', SB: 'sb-open',
}
const BB_VS_SPOT: Partial<Record<Position, string>> = {
  UTG: 'bb-vs-utg', MP: 'bb-vs-mp', CO: 'bb-vs-co', BTN: 'bb-vs-btn', SB: 'bb-vs-sb',
}
const POS_VS_SPOT: Partial<Record<Position, Partial<Record<Position, string>>>> = {
  SB: { BTN: 'sb-vs-btn', CO: 'sb-vs-co', MP: 'sb-vs-mp', UTG: 'sb-vs-utg' },
  BTN: { CO: 'btn-vs-co', UTG: 'btn-vs-utg', MP: 'btn-vs-mp' },
  CO: { UTG: 'co-vs-utg', MP: 'co-vs-mp' },
  MP: { UTG: 'mp-vs-utg' },
}
const OPENER_VS_3BET_SPOT: Partial<Record<Position, Partial<Record<Position, string>>>> = {
  BTN: { SB: 'btn-vs-sb-3bet', BB: 'btn-vs-bb-3bet' },
  CO: { SB: 'co-vs-sb-3bet', BB: 'co-vs-bb-3bet', BTN: 'co-vs-btn-3bet' },
  UTG: { BB: 'utg-vs-bb-3bet', BTN: 'utg-vs-btn-3bet', CO: 'utg-vs-co-3bet' },
  MP: { BB: 'mp-vs-bb-3bet', BTN: 'mp-vs-btn-3bet' },
  SB: { BB: 'sb-vs-bb-3bet' },
}
// 3bet ポット(postflop)で収録のあるペア(riverRanges.ts THREE_BET_POTS と対応)。順不同。
const THREE_BET_PAIRS: [Position, Position][] = [
  ['SB', 'BTN'], ['BB', 'BTN'], ['SB', 'CO'], ['BB', 'CO'], ['BTN', 'CO'],
]

const lc = (p: Position) => p.toLowerCase()

export const ALL_POSITIONS: Position[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']

export type ManualStreet = 'preflop' | 'flop' | 'turn' | 'river'
// プリフロップの状況: hero がオープン(RFI) / オープンに対応 / 自分の3betに直面(=自分がオープン→相手3bet)。
export type PreflopContext = 'rfi' | 'vs_open' | 'vs_3bet'
// 相手のアクション(ポストフロップ): チェックで回ってきた / ベットされた。被レイズ(facingRaise)は v1 対象外。
export type FacingAction = 'check' | 'bet'

export type ManualUncoveredReason =
  | 'no_scenario'                // 位置の組み合わせが収録レンジに無い
  | 'sb_srp'                     // SB の SRP ポストフロップ(盲対盲のIP/OOP反転で未対応)
  | 'three_bet_pair_unsupported' // 収録のない 3bet ポットのペア
  | 'invalid_cards'              // カード重複(手札同士 / 手札と盤面)
  | 'need_board'                 // ポストフロップで盤面の枚数が不足
  | 'invalid_bet'                // 被ベットなのにベット額が未指定/0以下

export interface ManualSpotInput {
  street: ManualStreet
  heroPos: Position
  villainPos: Position
  heroCards: [Card, Card]
  // preflop 専用
  preflopContext?: PreflopContext
  // postflop 専用
  potType?: 'srp' | '3bet'
  board?: Card[]
  facing?: FacingAction
  villainBetBB?: number // facing==='bet' のとき相手のベット額(to-amount, BB)
  potBB?: number        // このストリート開始時(相手ベット前)のポット
  effStackBB?: number
}

export type ManualSpotResult =
  | { ok: true; spot: SpotKey; nonstandardBet?: boolean }
  | { ok: false; reason: ManualUncoveredReason }

// preflop の baseSpotId をマップから決める。収録外は null。
function preflopBaseSpotId(hero: Position, villain: Position, ctx: PreflopContext): string | null {
  if (ctx === 'rfi') return OPEN_SPOT[hero] ?? null
  if (ctx === 'vs_open') {
    return hero === 'BB' ? (BB_VS_SPOT[villain] ?? null) : (POS_VS_SPOT[hero]?.[villain] ?? null)
  }
  return OPENER_VS_3BET_SPOT[hero]?.[villain] ?? null
}

// postflop の baseSpotId を決める。SRP は一方が必ず BB(opener は POSTFLOP_OPENERS 限定=SB除外)。
function postflopBaseSpotId(
  hero: Position, villain: Position, potType: 'srp' | '3bet',
): { base: string } | { error: ManualUncoveredReason } {
  if (potType === 'srp') {
    if (hero === 'BB') {
      if (villain === 'SB') return { error: 'sb_srp' }
      if (!POSTFLOP_OPENERS.includes(villain)) return { error: 'no_scenario' }
      return { base: `bb-vs-${lc(villain)}` }
    }
    if (villain === 'BB') {
      if (hero === 'SB') return { error: 'sb_srp' }
      if (!POSTFLOP_OPENERS.includes(hero)) return { error: 'no_scenario' }
      return { base: `${lc(hero)}-open` }
    }
    return { error: 'no_scenario' } // SRP postflop は一方が必ず BB
  }
  // 3bet ポット。baseHeroIsOOP が potSpec(THREE_BET_POTS)で妥当性を検証する(null=収録外ペア)。
  const base = `3bp-${lc(hero)}-vs-${lc(villain)}`
  if (baseHeroIsOOP(base) === null) return { error: 'three_bet_pair_unsupported' }
  return { base }
}

function hasDuplicateCard(cards: Card[]): boolean {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) if (sameCard(cards[i], cards[j])) return true
  }
  return false
}

// フォーム入力 → SpotKey(GameState 不要)。収録外は理由付きで返す(黙って空にしない)。
export function buildManualSpotKey(input: ManualSpotInput): ManualSpotResult {
  if (hasDuplicateCard(input.heroCards)) return { ok: false, reason: 'invalid_cards' }

  if (input.street === 'preflop') {
    const base = preflopBaseSpotId(input.heroPos, input.villainPos, input.preflopContext ?? 'rfi')
    if (!base) return { ok: false, reason: 'no_scenario' }
    return { ok: true, spot: { baseSpotId: base, street: 'preflop', heroCards: input.heroCards } }
  }

  const need = input.street === 'flop' ? 3 : input.street === 'turn' ? 4 : 5
  const board = (input.board ?? []).slice(0, need)
  if (board.length < need) return { ok: false, reason: 'need_board' }
  if (hasDuplicateCard([...input.heroCards, ...board])) return { ok: false, reason: 'invalid_cards' }

  const res = postflopBaseSpotId(input.heroPos, input.villainPos, input.potType ?? 'srp')
  if ('error' in res) return { ok: false, reason: res.error }
  const heroIsOOP = baseHeroIsOOP(res.base)
  if (heroIsOOP === null) return { ok: false, reason: 'no_scenario' }

  const potBB = input.potBB ?? 0
  const facing = input.facing === 'bet'
  let riverBetBB: number | undefined
  let nonstandardBet = false
  if (facing) {
    const bet = input.villainBetBB ?? 0
    if (bet <= 0) return { ok: false, reason: 'invalid_bet' }
    riverBetBB = bet
    // 事前計算は 0.66pot のみ。それ以外は live で当該サイズを求解する(=参考ではなく当該サイズの解)。
    // 代表サイズから外れることだけ UI に伝えるためのフラグ。
    if (potBB > 0 && Math.abs(bet / potBB - 0.66) > 0.08) nonstandardBet = true
  }

  return {
    ok: true,
    spot: {
      baseSpotId: res.base,
      street: input.street,
      board,
      heroCards: input.heroCards,
      potBB,
      effStackBB: input.effStackBB ?? 100,
      riverBetBB,
      heroIsOOP,
    },
    nonstandardBet,
  }
}

// --- UI が「収録のある選択肢だけ」を出すための有効ペア列挙(対象外を事実上発生させない) ---

export function validPreflopHeroPositions(ctx: PreflopContext): Position[] {
  if (ctx === 'rfi') return ALL_POSITIONS.filter(p => OPEN_SPOT[p])
  if (ctx === 'vs_open') return ALL_POSITIONS.filter(p => p === 'BB' || POS_VS_SPOT[p])
  return ALL_POSITIONS.filter(p => OPENER_VS_3BET_SPOT[p])
}

export function validPreflopVillainPositions(ctx: PreflopContext, hero: Position): Position[] {
  if (ctx === 'rfi') return [] // RFI は相手のアクション無し
  if (ctx === 'vs_open') {
    return hero === 'BB'
      ? ALL_POSITIONS.filter(p => BB_VS_SPOT[p])
      : ALL_POSITIONS.filter(p => POS_VS_SPOT[hero]?.[p])
  }
  return ALL_POSITIONS.filter(p => OPENER_VS_3BET_SPOT[hero]?.[p])
}

export function validPostflopPairs(potType: 'srp' | '3bet'): { hero: Position; villain: Position }[] {
  if (potType === 'srp') {
    const pairs: { hero: Position; villain: Position }[] = []
    for (const opener of POSTFLOP_OPENERS) {
      pairs.push({ hero: opener, villain: 'BB' })
      pairs.push({ hero: 'BB', villain: opener })
    }
    return pairs
  }
  return THREE_BET_PAIRS.flatMap(([a, b]) => [
    { hero: a, villain: b },
    { hero: b, villain: a },
  ])
}
