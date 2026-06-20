import type { ActionRequiredPayload, AgentBus } from './AgentBus'
import type { ActionSolution } from '../../types/solver'
import { resolveSpotKey } from '../../lib/solver/spotKey'
import { getSolution } from '../../lib/solver/getSolution'
import { handCategory } from '../cards/handCategory'
import { decideFishAction, type Decision } from './fishHeuristic'
import type { ActionScheduler } from './AIPlayerAgent'

const SYNC_SCHEDULER: ActionScheduler = emit => emit()
// gto_ai はやや思考的に (300-800ms)
export const gtoDelayScheduler: ActionScheduler = emit => setTimeout(emit, 300 + Math.random() * 500)

// 頻度で重み付け抽選して 1 アクションを選ぶ (rng 注入でテスト可能)。
export function sampleStrategyAction(sols: ActionSolution[], rng: () => number = Math.random): ActionSolution {
  const total = sols.reduce((s, a) => s + a.frequency, 0)
  let r = rng() * (total || 1)
  for (const s of sols) {
    r -= s.frequency
    if (r <= 0) return s
  }
  return sols[sols.length - 1]
}

// 抽選アクションを「その局面で有効なアクション」に写像する。
export function mapToValid(
  sampled: ActionSolution,
  payload: Pick<ActionRequiredPayload, 'state' | 'validActions' | 'callAmount' | 'minRaiseToAmount' | 'playerId'>,
): Decision {
  const { validActions, callAmount, minRaiseToAmount } = payload
  const me = payload.state.players.find(p => p.id === payload.playerId)
  const allInTo = me ? me.currentBetBB + me.stackBB : minRaiseToAmount

  const canRaise = validActions.includes('raise') && allInTo > minRaiseToAmount
  const raiseTo = Math.min(Math.max(sampled.sizeBB ?? minRaiseToAmount, minRaiseToAmount), allInTo)

  switch (sampled.action) {
    case 'raise':
      if (canRaise) return { action: 'raise', amount: raiseTo }
      return callOrCheck()
    case 'allin':
      if (validActions.includes('allin')) return { action: 'allin', amount: allInTo }
      if (canRaise) return { action: 'raise', amount: allInTo }
      return callOrCheck()
    case 'call':
      return callOrCheck()
    case 'check':
      if (validActions.includes('check')) return { action: 'check', amount: 0 }
      return callOrCheck()
    case 'fold':
    default:
      if (callAmount === 0 && validActions.includes('check')) return { action: 'check', amount: 0 }
      return validActions.includes('fold') ? { action: 'fold', amount: 0 } : callOrCheck()
  }

  function callOrCheck(): Decision {
    if (callAmount === 0 && validActions.includes('check')) return { action: 'check', amount: 0 }
    if (validActions.includes('call')) return { action: 'call', amount: 0 }
    return validActions.includes('fold') ? { action: 'fold', amount: 0 } : { action: 'check', amount: 0 }
  }
}

// trainer モードの相手: NodeSolution を頻度サンプリングして打つ。
// 未カバースポット (解なし) は Fish ヒューリスティクスにフォールバック。
// リアルタイム性のため live solve は使わない (precomputed / approximate のみ)。
export class GTOPlayerAgent {
  private bus: AgentBus
  private playerId: string
  private schedule: ActionScheduler

  constructor(bus: AgentBus, playerId: string, schedule: ActionScheduler = SYNC_SCHEDULER) {
    this.bus = bus
    this.playerId = playerId
    this.schedule = schedule
    bus.on('ACTION_REQUIRED', payload => {
      if (payload.playerId !== this.playerId) return
      void this.decide(payload)
    })
  }

  private async decide(payload: ActionRequiredPayload): Promise<void> {
    const { state, validActions, callAmount, minRaiseToAmount } = payload
    const me = state.players.find(p => p.id === this.playerId)
    let decision: Decision | null = null

    const spot = me?.holeCards ? resolveSpotKey(state, this.playerId) : null
    if (spot && me?.holeCards) {
      const node = await getSolution(spot, { allowLiveSolve: false })
      const sols = node?.strategy[handCategory(me.holeCards)]
      if (sols && sols.length > 0) {
        decision = mapToValid(sampleStrategyAction(sols), payload)
      }
    }
    // 未カバー: ヒューリスティクスにフォールバック。trainer 相手なので GTO 寄りプロファイル
    // (ドンクベットを抑制) で打つ — fish のリーク profile は使わない。
    if (!decision) {
      decision = decideFishAction(state, this.playerId, validActions, callAmount, minRaiseToAmount, 'gto')
    }

    this.schedule(() => this.bus.emit('PLAYER_ACTION', { playerId: this.playerId, ...decision! }))
  }
}
