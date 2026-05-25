import type { GameState, Card } from '../../types/game'
import { collectBetsIntoPot } from './BettingEngine'

function nextStreet(state: GameState, street: GameState['street'], board: Card[]): GameState {
  const withPot = collectBetsIntoPot(state)
  return { ...withPot, street, board, currentActorId: null }
}

export function dealFlop(state: GameState, flop: Card[]): GameState {
  return nextStreet(state, 'flop', flop)
}

export function dealTurn(state: GameState, turn: Card): GameState {
  return nextStreet(state, 'turn', [...state.board, turn])
}

export function dealRiver(state: GameState, river: Card): GameState {
  return nextStreet(state, 'river', [...state.board, river])
}

export function goToShowdown(state: GameState): GameState {
  return nextStreet(state, 'showdown', state.board)
}
