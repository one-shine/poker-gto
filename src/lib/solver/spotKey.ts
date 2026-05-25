import type { GameState, Position } from '../../types/game'
import type { SpotKey } from '../../types/solver'
import { isHeroIP } from '../../engine/game/PositionManager'
import { getTotalPot } from '../../engine/game/BettingEngine'

const OPEN_SPOT: Partial<Record<Position, string>> = {
  UTG: 'utg-open', MP: 'mp-open', CO: 'co-open', BTN: 'btn-open', SB: 'sb-open',
}
const BB_VS_SPOT: Partial<Record<Position, string>> = {
  UTG: 'bb-vs-utg', MP: 'bb-vs-mp', CO: 'bb-vs-co', BTN: 'bb-vs-btn', SB: 'bb-vs-sb',
}

// GameState からヒーロー視点の解スポットキーを決める。null = 評価対象外 (スキップ)。
export function resolveSpotKey(state: GameState, heroId: string): SpotKey | null {
  const base = preflopSpotId(state, heroId)
  if (!base) return null

  if (state.street === 'preflop') return { baseSpotId: base, street: 'preflop' }

  // ポストフロップ (Phase 3.5 自前ソルバー): 自前ソルバーが対応する範囲に限定する。
  //  - HU (アクティブ相手1人)
  //  - flop/turn/river (turn/flop は showdown をランナウト平均エクイティで近似)
  //  - hero が OOP かつ 先頭リード or 単発被ベット — それ以外のノードはスキップ
  //  - base が bb-vs-X (BB ディフェンス) — レンジ導出が対応
  if (state.street === 'showdown') return null
  const activeSeats = state.players.filter(p => !p.isFolded).map(p => p.seatIndex)
  const hero = state.players.find(p => p.id === heroId)
  if (!hero) return null
  const activeOpponents = state.players.filter(p => p.id !== heroId && !p.isFolded).length
  if (activeOpponents !== 1) return null
  if (!hero.holeCards) return null
  const villain = state.players.find(p => p.id !== heroId && !p.isFolded)
  if (!villain) return null
  // 対応 base: bb-vs-X (hero=OOP) / X-open (hero=IP)。それ以外はスキップ。
  if (!/^(bb-vs-(utg|mp|co|btn|sb)|(utg|mp|co|btn|sb)-open)$/.test(base)) return null
  const heroIsOOP = !isHeroIP(hero.seatIndex, state.buttonSeatIndex, activeSeats)

  // 現ストリートの hero 判断ノードを特定する (対応ノードのみ・他はスキップ):
  //  - 先頭/チェック後: この街で villain のベットが無い (hero が check/bet を選ぶ)
  //  - 被ベット       : villain が1回ベット (hero が call/fold を選ぶ)
  // hero が既に応答済 / レイズ応酬 / 複数ベットは未対応 → スキップ
  const streetActions = state.actionHistory.filter(a => a.street === state.street)
  const villainBets = streetActions.filter(a => a.playerId !== heroId && (a.action === 'raise' || a.action === 'allin'))
  const heroActs = streetActions.filter(a => a.playerId === heroId)
  let riverBetBB: number | undefined
  if (villainBets.length === 0) {
    // ベット未直面。OOP=先頭(heroActs=0) / IP=villainチェック後(heroActs=0)。いずれも hero 未行動。
    if (heroActs.length > 0) return null
  } else if (villainBets.length === 1) {
    // 被ベット。OOP=hero が check 済→villain ベット / IP=villain ベット→hero 未行動。
    const okOOP = heroIsOOP && heroActs.length === 1 && heroActs[0].action === 'check'
    const okIP = !heroIsOOP && heroActs.length === 0
    if (!okOOP && !okIP) return null
    riverBetBB = villain.currentBetBB - hero.currentBetBB
    if (riverBetBB <= 0) return null
  } else {
    return null
  }

  return {
    baseSpotId: base, street: state.street, board: state.board,
    heroCards: [hero.holeCards[0], hero.holeCards[1]],
    potBB: getTotalPot(state),
    effStackBB: Math.min(hero.stackBB, villain.stackBB),
    riverBetBB,
    heroIsOOP,
  }
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
  const activeOpponents = state.players.filter(p => p.id !== heroId && !p.isFolded).length

  // マルチウェイ (3人以上) かつ対レイズは評価しない (HU前提)
  if (activeOpponents > 1 && hasRaiseBefore) return null

  if (!hasRaiseBefore) {
    if (hasLimpBefore) return null
    return OPEN_SPOT[hero.position] ?? null
  }

  // 単独レイザーへの BB ディフェンスのみ対応 (3bet/スクイーズはスキップ)
  if (hero.position === 'BB') {
    const raises = prev.filter(a => a.action === 'raise')
    if (raises.length !== 1) return null
    const raiserPos = state.players.find(p => p.id === raises[0].playerId)?.position
    return raiserPos ? (BB_VS_SPOT[raiserPos] ?? null) : null
  }

  return null
}
