import type { GameState, PlayerAction, Position } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { handCategory } from '../cards/handCategory'

// Fish AI / GTO 未カバースポットのフォールバック用ヒューリスティクス。
// プリフロップ未オープン時は raise-or-fold (リンプ禁止) — RFI 前提を保つため (docs/archive/PHASE_3.md)。

const OPEN_SCENARIO_BY_POSITION: Partial<Record<Position, string>> = {
  BTN: 'btn-open', CO: 'co-open', MP: 'mp-open', UTG: 'utg-open', SB: 'sb-open',
}

export type Decision = { action: PlayerAction; amount: number }

export function decideFishAction(
  state: GameState,
  playerId: string,
  validActions: PlayerAction[],
  callAmount: number,
  minRaiseToAmount: number,
): Decision {
  const me = state.players.find(p => p.id === playerId)
  if (state.street === 'preflop' && me) {
    const opened = state.actionHistory.some(a => a.street === 'preflop' && a.action === 'raise')
    return opened
      ? decideVsRaise(validActions, minRaiseToAmount)
      : decideOpen(me.position, me.holeCards, validActions, minRaiseToAmount)
  }
  return decidePostflop(callAmount, validActions, minRaiseToAmount)
}

// 未オープンポット: raise-or-fold (BB のみ check 可)。
function decideOpen(
  position: Position,
  holeCards: GameState['players'][number]['holeCards'],
  validActions: PlayerAction[],
  minRaiseToAmount: number,
): Decision {
  const raiseProb = holeCards ? openRaiseProb(position, handCategory(holeCards)) : 0
  if (Math.random() < raiseProb && validActions.includes('raise')) {
    const scenario = PREFLOP_SCENARIOS.find(s => s.id === OPEN_SCENARIO_BY_POSITION[position])
    const sizeBB = scenario?.raiseSize ?? minRaiseToAmount
    return { action: 'raise', amount: Math.max(sizeBB, minRaiseToAmount) }
  }
  return validActions.includes('check') ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 }
}

function openRaiseProb(position: Position, category: string): number {
  const scenarioId = OPEN_SCENARIO_BY_POSITION[position]
  if (scenarioId) {
    const scenario = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
    return scenario?.cells[category]?.raise ?? 0
  }
  return 0 // BB はオープンしない (未オープンなら check)
}

// レイズに直面: fold 45% / call 47% / 3bet 8%
function decideVsRaise(validActions: PlayerAction[], minRaiseToAmount: number): Decision {
  const r = Math.random()
  if (r < 0.45) return { action: 'fold', amount: 0 }
  if (r < 0.53 && validActions.includes('raise')) return { action: 'raise', amount: minRaiseToAmount }
  if (validActions.includes('call')) return { action: 'call', amount: 0 }
  return { action: 'fold', amount: 0 }
}

// ポストフロップ: 先頭 check 65%/bet 35%、相手のベットに fold 30%/call 55%/raise 15%
function decidePostflop(callAmount: number, validActions: PlayerAction[], minRaiseToAmount: number): Decision {
  const r = Math.random()
  if (callAmount === 0) {
    if (r < 0.35 && validActions.includes('raise')) return { action: 'raise', amount: minRaiseToAmount }
    return { action: 'check', amount: 0 }
  }
  if (r < 0.30) return { action: 'fold', amount: 0 }
  if (r < 0.45 && validActions.includes('raise')) return { action: 'raise', amount: minRaiseToAmount }
  if (validActions.includes('call')) return { action: 'call', amount: 0 }
  return { action: 'fold', amount: 0 }
}
