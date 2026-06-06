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

  // Post blinds: スタックから出して「場の前のベット」(currentBetBB)に置く。
  // ⚠ ここで pot へは入れない。pot は街遷移/ハンド終了の collectBetsIntoPot で
  // currentBetBB を集約する単一経路に統一する(両方に入れるとブラインドを二重計上し
  // チップ保存則が壊れ、表示ポットも 2 倍になる)。
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
      pot: { mainPotBB: 0, sidePots: [] }, // ブラインドは currentBetBB にあり、collectBetsIntoPot で集約
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
