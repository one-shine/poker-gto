import type { GameState, PlayerAction, ActionRecord } from '../../types/game'
import { isHeroIP } from './PositionManager'

export function getTotalPot(state: GameState): number {
  return state.pot.mainPotBB + state.pot.sidePots.reduce((s, sp) => s + sp.amountBB, 0)
}

export function getCurrentCallAmount(state: GameState, playerId: string): number {
  const player = state.players.find(p => p.id === playerId)!
  const maxBet = Math.max(...state.players.map(p => p.currentBetBB))
  return Math.min(maxBet - player.currentBetBB, player.stackBB)
}

export function getMinRaiseToAmount(state: GameState): number {
  const maxBet = Math.max(...state.players.map(p => p.currentBetBB))
  const streetRaises = state.actionHistory.filter(
    a => a.street === state.street && (a.action === 'raise' || a.action === 'allin'),
  )
  // ⚠ amountBB は to-amount (到達ベット水準) であって増分ではない。
  // 直前レイズの「幅」= 今回の to − その前の到達水準。前がレイズならその to、
  // 初回レイズなら直前水準 = プリフロップ:BB / ポストフロップ:0(0 からのベット)。
  // (旧実装は to-amount をそのまま幅扱いし、3bet 以降の最小レイズを過大にしていた)
  let lastRaiseSize = state.bigBlindBB
  if (streetRaises.length > 0) {
    const lastTo = streetRaises[streetRaises.length - 1].amountBB
    const prevTo = streetRaises.length > 1
      ? streetRaises[streetRaises.length - 2].amountBB
      : (state.street === 'preflop' ? state.bigBlindBB : 0)
    lastRaiseSize = lastTo - prevTo
  }
  return maxBet + Math.max(lastRaiseSize, state.bigBlindBB)
}

export function applyAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
  raiseToAmount = 0,
): GameState {
  const players = state.players.map(p => ({ ...p }))
  const actor = players.find(p => p.id === playerId)!
  // record.potBB = アクション直前の「実ポット」= 確定ポット + 場の未回収ベット(ブラインド/前ベット込み)。
  // mainPotBB は街遷移まで未回収ベットを含まないため、ここで現ベットを足して実ポットにする
  // (プリフロップ先頭でも 1.5BB=ブラインド を正しく記録できる)。
  const potBefore = getTotalPot(state) + state.players.reduce((s, p) => s + p.currentBetBB, 0)
  let amountBB = 0

  if (action === 'fold') {
    actor.isFolded = true
  } else if (action === 'check') {
    // no change
  } else if (action === 'call') {
    const callAmt = getCurrentCallAmount(state, playerId)
    actor.stackBB -= callAmt
    actor.currentBetBB += callAmt
    amountBB = actor.currentBetBB // to-amount: 到達したベット水準 (call で揃えた額)
    if (actor.stackBB === 0) actor.isAllIn = true
  } else if (action === 'raise') {
    const requested = raiseToAmount > 0 ? raiseToAmount : getMinRaiseToAmount(state)
    // レイズ到達額はアクターの持ち分 (現ベット + スタック) を超えられない。
    // 超える指定は実質オールイン。キャップしないと持ち分超のベットが「幽霊チップ」になり、
    // 相手がコールできない超過分が単独 eligible のサイドポットになって2人勝者/チップ増殖を招く。
    const target = Math.min(requested, actor.currentBetBB + actor.stackBB)
    const added = target - actor.currentBetBB
    actor.stackBB -= added
    actor.currentBetBB = target
    amountBB = target // to-amount: ポーカー慣習「raise to X」。増分ではなく到達水準を記録
    if (actor.stackBB <= 0) { actor.stackBB = 0; actor.isAllIn = true }
  } else if (action === 'allin') {
    const target = actor.currentBetBB + actor.stackBB
    actor.currentBetBB = target
    actor.stackBB = 0
    actor.isAllIn = true
    amountBB = target // to-amount
  }

  const hero = state.players.find(p => p.isHero)
  const activeSeats = state.players.filter(p => !p.isFolded).map(p => p.seatIndex)
  const heroIsIP = hero ? isHeroIP(hero.seatIndex, state.buttonSeatIndex, activeSeats) : false

  const record: ActionRecord = {
    handId: state.handId,
    street: state.street,
    playerId,
    actorPosition: actor.position,
    heroPosition: hero?.position ?? 'BTN',
    villainPositions: state.players.filter(p => !p.isHero && !p.isFolded).map(p => p.position),
    action,
    amountBB,
    potBB: potBefore,
    isIP: heroIsIP,
    timestamp: Date.now(),
  }

  return { ...state, players, actionHistory: [...state.actionHistory, record], currentActorId: null }
}

export function collectBetsIntoPot(state: GameState): GameState {
  const players = state.players.map(p => ({ ...p }))
  const maxBet = Math.max(...players.map(p => p.currentBetBB))
  if (maxBet === 0) return { ...state, players }

  const allInLevels = players
    .filter(p => p.isAllIn && p.currentBetBB > 0)
    .map(p => p.currentBetBB)
  const thresholds = [...new Set([...allInLevels, maxBet])].sort((a, b) => a - b)

  const newPots: Array<{ amountBB: number; eligiblePlayerIds: string[] }> = []
  let prevLevel = 0

  for (const level of thresholds) {
    let potAmount = 0
    const eligible: string[] = []
    for (const p of players) {
      const chunk = Math.min(p.currentBetBB, level) - prevLevel
      if (chunk > 0) {
        potAmount += chunk
        if (!p.isFolded) eligible.push(p.id)
      }
    }
    if (potAmount > 0) newPots.push({ amountBB: potAmount, eligiblePlayerIds: eligible })
    prevLevel = level
  }

  players.forEach(p => { p.currentBetBB = 0 })
  const [first, ...rest] = newPots
  return {
    ...state,
    players,
    pot: {
      mainPotBB: state.pot.mainPotBB + (first?.amountBB ?? 0),
      sidePots: [...state.pot.sidePots, ...rest],
    },
  }
}
