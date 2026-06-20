import { AgentBus } from './AgentBus'
import { decideFishAction } from './fishHeuristic'

// Fish AI: プリフロップ未オープン時は raise-or-fold (リンプ禁止)。
// 判断ロジックは fishHeuristic.decideFishAction に抽出 (GTOPlayerAgent のフォールバックと共有)。

// アクション送出のスケジューラ。エンジンは純粋・同期 (テスト決定的) を保つため
// デフォルトは同期実行。UI 側 (gameStore) が setTimeout 版を注入して "間" を演出する。
export type ActionScheduler = (emit: () => void) => void
const SYNC_SCHEDULER: ActionScheduler = emit => emit()

// 衝動的に見せる Fish 用の遅延スケジューラ (UI から注入)
export const fishDelayScheduler: ActionScheduler = emit =>
  setTimeout(emit, 100 + Math.random() * 300)

export class AIPlayerAgent {
  private bus: AgentBus
  private playerId: string
  private schedule: ActionScheduler

  constructor(bus: AgentBus, playerId: string, schedule: ActionScheduler = SYNC_SCHEDULER) {
    this.bus = bus
    this.playerId = playerId
    this.schedule = schedule
    bus.on('ACTION_REQUIRED', payload => {
      if (payload.playerId !== this.playerId) return
      const { state, validActions, callAmount, minRaiseToAmount } = payload
      this.schedule(() => {
        const decision = decideFishAction(state, this.playerId, validActions, callAmount, minRaiseToAmount, 'fish')
        this.bus.emit('PLAYER_ACTION', { playerId: this.playerId, ...decision })
      })
    })
  }
}
