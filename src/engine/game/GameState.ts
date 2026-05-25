import type { GameState, Player, AgentType, Card } from '../../types/game'
import { dealCards } from '../cards/Deck'
import { getPosition } from './PositionManager'

export interface PlayerConfig {
  id: string
  agentType: AgentType
  stackBB: number
  isHero: boolean
}

let _handCounter = 0

export function createInitialGameState(
  configs: PlayerConfig[],
  deck: Card[],
  buttonSeatIndex: number,
  handNumber: number,
): { state: GameState; remainingDeck: Card[] } {
  let remaining = deck

  const players: Player[] = configs.map((cfg, seatIndex) => {
    const { dealt, remaining: rem } = dealCards(remaining, 2)
    remaining = rem
    return {
      id: cfg.id,
      position: getPosition(seatIndex, buttonSeatIndex),
      seatIndex,
      stackBB: cfg.stackBB,
      holeCards: dealt,
      isHero: cfg.isHero,
      agentType: cfg.agentType,
      isFolded: false,
      isAllIn: false,
      currentBetBB: 0,
    }
  })

  // Post blinds
  const sb = players.find(p => p.position === 'SB')!
  const bb = players.find(p => p.position === 'BB')!
  sb.stackBB -= 0.5
  sb.currentBetBB = 0.5
  bb.stackBB -= 1
  bb.currentBetBB = 1

  const handId = `h${(++_handCounter).toString().padStart(4, '0')}_${Date.now().toString(36)}`

  return {
    state: {
      handId,
      street: 'preflop',
      players,
      board: [],
      pot: { mainPotBB: 1.5, sidePots: [] },
      actionHistory: [],
      currentActorId: null,
      buttonSeatIndex,
      bigBlindBB: 1,
      smallBlindBB: 0.5,
      handNumber,
      isHandComplete: false,
    },
    remainingDeck: remaining,
  }
}
