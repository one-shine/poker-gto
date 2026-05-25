import type { GameState, PlayerAction, ShowdownResult } from '../../types/game'
import type { CoachFeedback } from '../../types/coach'

export interface ActionRequiredPayload {
  state: GameState
  playerId: string
  validActions: PlayerAction[]
  callAmount: number
  minRaiseToAmount: number
}

export interface PlayerActionPayload {
  playerId: string
  action: PlayerAction
  amount: number
}

export interface HandCompletePayload {
  state: GameState
  results: ShowdownResult[]
}

export interface AgentBusEvents {
  HAND_START: { state: GameState }
  STREET_DEALT: { state: GameState }
  ACTION_REQUIRED: ActionRequiredPayload
  HAND_COMPLETE: HandCompletePayload
  PLAYER_ACTION: PlayerActionPayload
  NEW_HAND_REQUEST: Record<string, never>
  FEEDBACK_READY: { playerId: string; feedback: CoachFeedback }
  MISTAKE_RECORDED: { playerId: string; category: string; evLoss: number }
}

type Listener<T> = (payload: T) => void

export class AgentBus {
  private listeners = new Map<string, Listener<unknown>[]>()

  on<K extends keyof AgentBusEvents>(event: K, fn: Listener<AgentBusEvents[K]>): void {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(event, [...list, fn as Listener<unknown>])
  }

  off<K extends keyof AgentBusEvents>(event: K, fn: Listener<AgentBusEvents[K]>): void {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(event, list.filter(l => l !== fn))
  }

  emit<K extends keyof AgentBusEvents>(event: K, payload: AgentBusEvents[K]): void {
    for (const l of this.listeners.get(event) ?? []) l(payload)
  }
}
