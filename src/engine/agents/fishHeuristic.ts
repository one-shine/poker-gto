import type { GameState, Player, PlayerAction, Position, Street } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { handCategory } from '../cards/handCategory'
import { isHeroIP } from '../game/PositionManager'
import { getTotalPot } from '../game/BettingEngine'

// Fish AI / GTO 未カバースポットのフォールバック用ヒューリスティクス。
// heuristic: not GTO-exact — 本筋はソルバー解 (getSolution)。ここは解の無い局面の埋め草。
// プリフロップ未オープン時は raise-or-fold (リンプ禁止) — RFI 前提を保つため (docs/archive/PHASE_3.md)。

const OPEN_SCENARIO_BY_POSITION: Partial<Record<Position, string>> = {
  BTN: 'btn-open', CO: 'co-open', MP: 'mp-open', UTG: 'utg-open', SB: 'sb-open',
}

export type Decision = { action: PlayerAction; amount: number }

// fish = リーク持ち (exploit モード) / gto = 解の無い局面での GTO 寄りフォールバック (trainer モード)。
export type AiProfile = 'fish' | 'gto'

export function decideFishAction(
  state: GameState,
  playerId: string,
  validActions: PlayerAction[],
  callAmount: number,
  minRaiseToAmount: number,
  profile: AiProfile = 'fish',
  rng: () => number = Math.random,
): Decision {
  const me = state.players.find(p => p.id === playerId)
  if (!me) return safeAction(callAmount, validActions)
  if (state.street === 'preflop') {
    const opened = state.actionHistory.some(a => a.street === 'preflop' && a.action === 'raise')
    return opened
      ? decideVsRaise(validActions, minRaiseToAmount, rng)
      : decideOpen(me.position, me.holeCards, validActions, minRaiseToAmount, rng)
  }
  return decidePostflop(state, me, callAmount, validActions, minRaiseToAmount, profile, rng)
}

// 未オープンポット: raise-or-fold (BB のみ check 可)。
function decideOpen(
  position: Position,
  holeCards: Player['holeCards'],
  validActions: PlayerAction[],
  minRaiseToAmount: number,
  rng: () => number,
): Decision {
  const raiseProb = holeCards ? openRaiseProb(position, handCategory(holeCards)) : 0
  if (rng() < raiseProb && validActions.includes('raise')) {
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
function decideVsRaise(validActions: PlayerAction[], minRaiseToAmount: number, rng: () => number): Decision {
  const r = rng()
  if (r < 0.45) return { action: 'fold', amount: 0 }
  if (r < 0.53 && validActions.includes('raise')) return { action: 'raise', amount: minRaiseToAmount }
  if (validActions.includes('call')) return { action: 'call', amount: 0 }
  return { action: 'fold', amount: 0 }
}

// ポストフロップ。先頭/チェック回しの「打つ確率」はポジションとプリフロップ
// アグレッサーかで大きく変える。OOP・非アグレッサーの先頭リード=ドンクベットは
// GTO ではほぼ打たない。旧実装はこれらを無視し一律 35% で打っていた(過剰ドンクの元凶)。
function decidePostflop(
  state: GameState,
  me: Player,
  callAmount: number,
  validActions: PlayerAction[],
  minRaiseToAmount: number,
  profile: AiProfile,
  rng: () => number,
): Decision {
  const r = rng()
  if (callAmount === 0) {
    const ip = isPlayerIP(state, me)
    const aggressorId = preflopAggressorId(state)
    const prob = leadBetProb(state.street, ip, aggressorId === me.id, aggressorId != null, profile)
    if (r < prob && validActions.includes('raise')) {
      return { action: 'raise', amount: leadSizeBB(state, me, minRaiseToAmount) }
    }
    return validActions.includes('check') ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 }
  }
  const { fold, raise } = vsBetProbs(profile)
  if (r < fold) return { action: 'fold', amount: 0 }
  if (r < fold + raise && validActions.includes('raise')) return { action: 'raise', amount: minRaiseToAmount }
  if (validActions.includes('call')) return { action: 'call', amount: 0 }
  return { action: 'fold', amount: 0 }
}

// アクティブプレイヤーの中で最後に行動する=IP (ポジション名でなくシートで判定・絶対ルール3)。
function isPlayerIP(state: GameState, me: Player): boolean {
  const activeSeats = state.players.filter(p => !p.isFolded).map(p => p.seatIndex)
  return isHeroIP(me.seatIndex, state.buttonSeatIndex, activeSeats)
}

// プリフロップで最後にレイズした者=アグレッサー (ポストフロップで C ベット権を持つ)。
// リンプ/未レイズ(アグレッサー不在)なら null。
function preflopAggressorId(state: GameState): string | null {
  let lastRaiser: string | null = null
  for (const a of state.actionHistory) {
    if (a.street === 'preflop' && (a.action === 'raise' || a.action === 'allin')) lastRaiser = a.playerId
  }
  return lastRaiser
}

// 先頭/チェック回しで打つ確率。heuristic: not GTO-exact (傾向のみ模倣)。
// 後ストリートほどベット頻度は下げ、ドンクは僅かに上げる。fish は C ベットを打ち損ね、
// ドンクを漏らす(リーク)。gto は GTO 寄りに絞る。
function leadBetProb(street: Street, ip: boolean, aggressor: boolean, hasAggressor: boolean, profile: AiProfile): number {
  if (!hasAggressor) {
    // リンプ/未レイズポット: アグレッサー不在 → ドンクの概念なし。中庸にリード (IP やや高め)。
    const base = ip
      ? pickByStreet(street, { flop: 0.40, turn: 0.36, river: 0.34 }, 0.38)
      : pickByStreet(street, { flop: 0.30, turn: 0.28, river: 0.26 }, 0.28)
    return profile === 'fish' ? Math.max(0, base - 0.05) : base
  }
  if (!ip && !aggressor) {
    // ドンクベット: GTO はほぼ打たない。
    const base = pickByStreet(street, { flop: 0.04, turn: 0.06, river: 0.08 }, 0.05)
    return profile === 'fish' ? base + 0.08 : base
  }
  if (aggressor) {
    // 継続ベット (C ベット)。
    const base = pickByStreet(street, { flop: 0.60, turn: 0.50, river: 0.45 }, 0.5)
    return profile === 'fish' ? Math.max(0, base - 0.08) : base
  }
  // IP・非アグレッサー: 相手のチェックに対するスタブ (probe)。
  const base = pickByStreet(street, { flop: 0.42, turn: 0.38, river: 0.36 }, 0.4)
  return profile === 'fish' ? Math.max(0, base - 0.05) : base
}

function pickByStreet(street: Street, byStreet: Partial<Record<Street, number>>, fallback: number): number {
  return byStreet[street] ?? fallback
}

// 被ベット時の fold/raise 確率 (残りは call)。fish はコーリングステーション気味
// (降りなさすぎ・レイズ控えめ) で搾取余地を残す。
function vsBetProbs(profile: AiProfile): { fold: number; raise: number } {
  return profile === 'fish' ? { fold: 0.18, raise: 0.06 } : { fold: 0.32, raise: 0.10 }
}

// リードベットのサイズ: ポットの ~60% (min ベット〜オールインでクランプ)。
// 旧実装は min レイズ額 (≈1BB) を打っており不自然に小さかった。
function leadSizeBB(state: GameState, me: Player, minRaiseToAmount: number): number {
  const pot = getTotalPot(state)
  const allInTo = me.currentBetBB + me.stackBB
  const target = Math.max(minRaiseToAmount, Math.round(pot * 0.6 * 2) / 2)
  return Math.min(target, allInTo)
}

function safeAction(callAmount: number, validActions: PlayerAction[]): Decision {
  if (callAmount === 0 && validActions.includes('check')) return { action: 'check', amount: 0 }
  if (validActions.includes('call')) return { action: 'call', amount: 0 }
  return { action: 'fold', amount: 0 }
}
