import type { GameState, PlayerAction, ShowdownResult } from '../../types/game'
import type { Card } from '../../types/game'
import { AgentBus } from './AgentBus'
import type { PlayerConfig } from '../game/GameState'
import { createInitialGameState } from '../game/GameState'
import { createShuffledDeck, dealCards } from '../cards/Deck'
import {
  applyAction,
  collectBetsIntoPot,
  getCurrentCallAmount,
  getMinRaiseToAmount,
  getTotalPot,
} from '../game/BettingEngine'
import { dealFlop, dealTurn, dealRiver, goToShowdown } from '../game/GameStateMachine'
import { getPreflopActionOrder, getPostflopActionOrder } from '../game/PositionManager'
import { determineWinners } from '../game/Showdown'

export class DealerAgent {
  private state: GameState | null = null
  private deck: Card[] = []
  private actionQueue: string[] = []
  private handNumber = 0

  private bus: AgentBus
  private configs: PlayerConfig[]
  private buttonSeatIndex: number

  constructor(bus: AgentBus, configs: PlayerConfig[], buttonSeatIndex = 0) {
    this.bus = bus
    this.configs = configs
    this.buttonSeatIndex = buttonSeatIndex
    bus.on('PLAYER_ACTION', ({ playerId, action, amount }) => {
      this.handleAction(playerId, action, amount)
    })
    bus.on('NEW_HAND_REQUEST', () => this.startNewHand())
  }

  startNewHand(): void {
    this.handNumber++
    this.deck = createShuffledDeck()
    const { state, remainingDeck } = createInitialGameState(
      this.configs, this.deck, this.buttonSeatIndex, this.handNumber,
    )
    this.state = state
    this.deck = remainingDeck
    this.bus.emit('HAND_START', { state: this.state })
    this.beginStreet()
  }

  private beginStreet(): void {
    const state = this.state!
    this.bus.emit('STREET_DEALT', { state })

    const active = state.players.filter(p => !p.isFolded)
    if (active.length <= 1) { this.resolveHand(); return }

    const canAct = active.filter(p => !p.isAllIn)
    if (canAct.length <= 1) { this.advanceStreet(); return }

    this.buildQueue()
    this.requestAction()
  }

  private buildQueue(): void {
    const { players, street, buttonSeatIndex } = this.state!
    const active = players.filter(p => !p.isFolded && !p.isAllIn)
    const ordered = street === 'preflop'
      ? getPreflopActionOrder(active, buttonSeatIndex)
      : getPostflopActionOrder(active, buttonSeatIndex)
    this.actionQueue = ordered.map(p => p.id)
  }

  private requestAction(): void {
    // Skip folded/allin players at front of queue
    while (this.actionQueue.length > 0) {
      const pid = this.actionQueue[0]
      const p = this.state!.players.find(x => x.id === pid)!
      if (!p.isFolded && !p.isAllIn) break
      this.actionQueue.shift()
    }

    if (this.actionQueue.length === 0) { this.advanceStreet(); return }

    const state = this.state!
    const playerId = this.actionQueue[0]
    const callAmount = getCurrentCallAmount(state, playerId)
    const validActions: PlayerAction[] = callAmount === 0
      ? ['check', 'raise', 'allin']
      : ['call', 'fold', 'raise', 'allin']

    this.state = { ...state, currentActorId: playerId }
    this.bus.emit('ACTION_REQUIRED', {
      state: this.state,
      playerId,
      validActions,
      callAmount,
      minRaiseToAmount: getMinRaiseToAmount(state),
    })
  }

  private handleAction(playerId: string, action: PlayerAction, amount: number): void {
    if (!this.state || this.actionQueue[0] !== playerId) return

    this.state = applyAction(this.state, playerId, action, amount)
    this.actionQueue.shift()

    const active = this.state.players.filter(p => !p.isFolded)
    if (active.length <= 1) { this.resolveHand(); return }

    if (action === 'raise' || action === 'allin') {
      this.rebuildQueueAfterAggression(playerId)
    }

    this.requestAction()
  }

  private rebuildQueueAfterAggression(aggressorId: string): void {
    const state = this.state!
    const isPreflop = state.street === 'preflop'
    const newMax = Math.max(...state.players.map(p => p.currentBetBB))
    const active = state.players.filter(p => !p.isFolded && !p.isAllIn)

    // Players who need to act: not the aggressor, and haven't matched the new bet
    const needToAct = new Set(
      active.filter(p => p.id !== aggressorId && p.currentBetBB < newMax).map(p => p.id),
    )

    const fullOrder = isPreflop
      ? getPreflopActionOrder(active, state.buttonSeatIndex)
      : getPostflopActionOrder(active, state.buttonSeatIndex)

    const aggressorIdx = fullOrder.findIndex(p => p.id === aggressorId)
    // Rotate so next player after aggressor is first
    const rotated = [
      ...fullOrder.slice(aggressorIdx + 1),
      ...fullOrder.slice(0, aggressorIdx),
    ]

    this.actionQueue = rotated.filter(p => needToAct.has(p.id)).map(p => p.id)
  }

  private advanceStreet(): void {
    const state = this.state!
    switch (state.street) {
      case 'preflop': {
        const { dealt, remaining } = dealCards(this.deck, 3)
        this.deck = remaining
        this.state = dealFlop(state, dealt)
        this.beginStreet()
        break
      }
      case 'flop': {
        const { dealt, remaining } = dealCards(this.deck, 1)
        this.deck = remaining
        this.state = dealTurn(state, dealt[0])
        this.beginStreet()
        break
      }
      case 'turn': {
        const { dealt, remaining } = dealCards(this.deck, 1)
        this.deck = remaining
        this.state = dealRiver(state, dealt[0])
        this.beginStreet()
        break
      }
      case 'river':
        this.state = goToShowdown(state)
        this.resolveHand()
        break
    }
  }

  private resolveHand(): void {
    const finalState = collectBetsIntoPot(this.state!)
    this.state = { ...finalState, isHandComplete: true }

    const active = finalState.players.filter(p => !p.isFolded && p.holeCards)
    let results: ShowdownResult[]

    if (active.length <= 1 || finalState.street !== 'showdown') {
      const winner = active[0] ?? finalState.players.find(p => !p.isFolded)!
      results = [{
        winnerId: winner.id,
        winnerIds: [winner.id],
        handRank: 'high_card',
        amountWonBB: getTotalPot(finalState),
      }]
    } else {
      results = determineWinners(finalState)
    }

    this.bus.emit('HAND_COMPLETE', { state: this.state, results })
    // Rotate button for next hand
    this.buttonSeatIndex = (this.buttonSeatIndex + 1) % 6
  }
}
