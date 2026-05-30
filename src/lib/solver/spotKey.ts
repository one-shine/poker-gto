import type { GameState, Player, Position } from '../../types/game'
import type { SpotKey } from '../../types/solver'
import { isHeroIP, getPreflopActionOrder } from '../../engine/game/PositionManager'
import { getTotalPot } from '../../engine/game/BettingEngine'
import { baseHeroIsOOP } from './riverRanges'

// ポストフロップで自前ソルバーがレンジ導出に対応するオープナー (BB ディフェンス前提)。
// SB は盲対盲で IP/OOP が反転するため SRP では除外 (3bet ポットは別途 THREE_BET_POTS で判定)。
const POSTFLOP_OPENERS: Position[] = ['UTG', 'MP', 'CO', 'BTN']

const OPEN_SPOT: Partial<Record<Position, string>> = {
  UTG: 'utg-open', MP: 'mp-open', CO: 'co-open', BTN: 'btn-open', SB: 'sb-open',
}
const BB_VS_SPOT: Partial<Record<Position, string>> = {
  UTG: 'bb-vs-utg', MP: 'bb-vs-mp', CO: 'bb-vs-co', BTN: 'bb-vs-btn', SB: 'bb-vs-sb',
}
// 非BB防御 (単独オープンへの応答)。hero防御ポジション → { レイザーポジション: spotId }。
// IP(BTN/CO)=cold-call+3bet / OOP(SB)=3bet-or-fold。data/ranges/preflop.ts と対応。
const POS_VS_SPOT: Partial<Record<Position, Partial<Record<Position, string>>>> = {
  SB: { BTN: 'sb-vs-btn', CO: 'sb-vs-co' },
  BTN: { CO: 'btn-vs-co', UTG: 'btn-vs-utg', MP: 'btn-vs-mp' },
  CO: { UTG: 'co-vs-utg' },
}
// opener が 3bet に直面 (4bet/call/fold)。hero=opener ポジション → { 3better ポジション: spotId }。
const OPENER_VS_3BET_SPOT: Partial<Record<Position, Partial<Record<Position, string>>>> = {
  BTN: { SB: 'btn-vs-sb-3bet', BB: 'btn-vs-bb-3bet' },
  CO: { SB: 'co-vs-sb-3bet', BB: 'co-vs-bb-3bet', BTN: 'co-vs-btn-3bet' },
  UTG: { BB: 'utg-vs-bb-3bet', BTN: 'utg-vs-btn-3bet', CO: 'utg-vs-co-3bet' },
  MP: { BB: 'mp-vs-bb-3bet', BTN: 'mp-vs-btn-3bet' },
  SB: { BB: 'sb-vs-bb-3bet' },
}

// GameState からヒーロー視点の解スポットキーを決める。null = 評価対象外 (スキップ)。
export function resolveSpotKey(state: GameState, heroId: string): SpotKey | null {
  if (state.street === 'preflop') {
    const base = preflopSpotId(state, heroId)
    return base ? { baseSpotId: base, street: 'preflop' } : null
  }
  if (state.street === 'showdown') return null

  // ポストフロップ (Phase 3.5 自前ソルバー): 自前ソルバーが対応する範囲に限定する。
  //  - HU (アクティブ相手1人)
  //  - flop/turn/river (turn/flop は showdown をランナウト平均エクイティで近似)
  //  - base が SRP(bb-vs-X / X-open) または 3bet ポット(3bp-…) で導出可能
  //  - hero ノードが 先頭/被ベット/被レイズ のいずれか
  const hero = state.players.find(p => p.id === heroId)
  if (!hero || !hero.holeCards) return null
  const opponents = state.players.filter(p => p.id !== heroId && !p.isFolded)
  if (opponents.length !== 1) return null
  const villain = opponents[0]
  const activeSeats = state.players.filter(p => !p.isFolded).map(p => p.seatIndex)
  const heroIsOOP = !isHeroIP(hero.seatIndex, state.buttonSeatIndex, activeSeats)

  // 基底スポット (ポット種別) を preflop 履歴から再構成する。
  const base = postflopBase(state, hero, villain, heroId)
  if (!base) return null
  // seat ベース heroIsOOP と base(ポジション)由来が一致しないスポットは除外
  // (SB 盲対盲の IP/OOP 反転や未対応 3bet ペアを安全に弾く)。
  const baseOOP = baseHeroIsOOP(base)
  if (baseOOP === null || baseOOP !== heroIsOOP) return null

  // 現ストリートの hero 判断ノードを特定する (対応ノードのみ・他はスキップ):
  //  - 先頭/チェック後: villain のベット無し (hero が check/bet を選ぶ・hero 未行動)
  //  - 被ベット       : villain が1回ベット (hero が call/fold/raise を選ぶ)
  //  - 被レイズ       : hero が自ベット後、villain にレイズされた (hero が fold/call) — 深いノード
  const streetActions = state.actionHistory.filter(a => a.street === state.street)
  const villainAggro = streetActions.filter(a => a.playerId !== heroId && (a.action === 'raise' || a.action === 'allin'))
  const heroAggro = streetActions.filter(a => a.playerId === heroId && (a.action === 'raise' || a.action === 'allin'))
  const heroActs = streetActions.filter(a => a.playerId === heroId)
  let riverBetBB: number | undefined
  let facingRaise = false
  if (villainAggro.length === 0) {
    if (heroActs.length > 0) return null // 先頭/チェック後は hero 未行動のみ
  } else if (villainAggro.length === 1) {
    const toCall = villain.currentBetBB - hero.currentBetBB
    if (toCall <= 0) return null // hero がコール対象を持たない (hero が最後のアグレッサー)
    if (heroAggro.length === 1 && hero.currentBetBB > 0) {
      // hero が自ら(チェック)ベットし、villain にレイズし返された → 被レイズ深いノード
      facingRaise = true
      riverBetBB = hero.currentBetBB // hero 自身のリードベット = betFrac の基準
    } else if (heroAggro.length === 0) {
      // 被ベット。OOP=hero が check 済→villain ベット / IP=villain ベット→hero 未行動。
      const okOOP = heroIsOOP && heroActs.length === 1 && heroActs[0].action === 'check'
      const okIP = !heroIsOOP && heroActs.length === 0
      if (!okOOP && !okIP) return null
      riverBetBB = toCall
    } else {
      return null
    }
  } else {
    return null // 複数レイズ応酬 (より深いノード) は未対応
  }

  return {
    baseSpotId: base, street: state.street, board: state.board,
    heroCards: [hero.holeCards[0], hero.holeCards[1]],
    potBB: getTotalPot(state),
    effStackBB: Math.min(hero.stackBB, villain.stackBB),
    riverBetBB,
    facingRaise,
    heroIsOOP,
  }
}

// ポストフロップの基底スポットを preflop 履歴から再構成する。
//  - 単一レイズ(SRP): hero=オープナー & villain=BB → '{hero}-open' / hero=BB & villain=オープナー → 'bb-vs-{opener}'
//  - 2レイズ(3bet ポット): open→3bet→call → '3bp-{hero}-vs-{villain}' (ペア妥当性は potSpec が検証)
// 対応外 (SB 関与の SRP・非BB ディフェンス・マルチウェイ・4bet 以上) は null。
function postflopBase(state: GameState, hero: Player, villain: Player, heroId: string): string | null {
  const pfRaises = state.actionHistory.filter(a => a.street === 'preflop' && a.action === 'raise')
  const hp = hero.position.toLowerCase()
  const vp = villain.position.toLowerCase()

  if (pfRaises.length === 1) {
    const openerId = pfRaises[0].playerId
    if (openerId === heroId) {
      if (villain.position !== 'BB' || !POSTFLOP_OPENERS.includes(hero.position)) return null
      return `${hp}-open`
    }
    if (openerId === villain.id) {
      if (hero.position !== 'BB' || !POSTFLOP_OPENERS.includes(villain.position)) return null
      return `bb-vs-${vp}`
    }
    return null
  }
  if (pfRaises.length === 2) {
    const openerId = pfRaises[0].playerId
    const threeBetterId = pfRaises[1].playerId
    const ids = [heroId, villain.id]
    if (!ids.includes(openerId) || !ids.includes(threeBetterId) || openerId === threeBetterId) return null
    return `3bp-${hp}-vs-${vp}`
  }
  return null
}

// プリフロップの対面タイプ (= ポストフロップでも基底スポットとして流用)。
function preflopSpotId(state: GameState, heroId: string): string | null {
  const hero = state.players.find(p => p.id === heroId)
  if (!hero) return null

  const prev = state.actionHistory.filter(a => a.street === 'preflop')
  const hasRaiseBefore = prev.some(a => a.action === 'raise' && a.playerId !== heroId)
  // リンプ (未オープン状況の call) があると RFI 前提が崩れる → スキップ (安全網)
  const hasLimpBefore =
    !hasRaiseBefore && prev.some(a => a.action === 'call' && a.playerId !== heroId)

  if (!hasRaiseBefore) {
    if (hasLimpBefore) return null
    return OPEN_SPOT[hero.position] ?? null
  }

  // コールドコール(レイズへの参加)があれば実質マルチウェイ/スクイーズ → スキップ。
  if (prev.some(a => a.action === 'call' && a.playerId !== heroId)) return null
  const raises = prev.filter(a => a.action === 'raise')

  // 対オープン (単一レイズ) への clean な応答 (defender 視点)。
  if (raises.length === 1) {
    // hero より前に行動する相手は全員フォールド済み (レイザーを除く)。背後の未行動ブラインドは許容。
    const order = getPreflopActionOrder(state.players, state.buttonSeatIndex)
    const heroOrderIdx = order.findIndex(p => p.id === heroId)
    const raiserId = raises[0].playerId
    const cleanFoldAround = order.slice(0, heroOrderIdx).every(p => p.isFolded || p.id === raiserId)
    if (!cleanFoldAround) return null
    const raiserPos = state.players.find(p => p.id === raiserId)?.position
    if (!raiserPos) return null
    if (hero.position === 'BB') return BB_VS_SPOT[raiserPos] ?? null
    return POS_VS_SPOT[hero.position]?.[raiserPos] ?? null
  }

  // 対3bet (open + 3bet)。hero=opener が 4bet/call/fold を選ぶ HU ノードのみ対応。
  if (raises.length === 2) {
    const [openR, threeBetR] = raises
    if (openR.playerId !== heroId || threeBetR.playerId === heroId) return null // hero=opener 限定
    // hero の raise は open の1回のみ (既に4bet応答済みはスキップ)
    if (prev.filter(a => a.action === 'raise' && a.playerId === heroId).length !== 1) return null
    // HU: アクティブな相手は 3better ただ1人 (他は全員フォールド)。スクイーズ/マルチウェイを排除。
    const activeOpps = state.players.filter(p => p.id !== heroId && !p.isFolded)
    if (activeOpps.length !== 1 || activeOpps[0].id !== threeBetR.playerId) return null
    const threeBetterPos = state.players.find(p => p.id === threeBetR.playerId)?.position
    if (!threeBetterPos) return null
    return OPENER_VS_3BET_SPOT[hero.position]?.[threeBetterPos] ?? null
  }

  return null // 4bet 以上の応酬は未対応
}
