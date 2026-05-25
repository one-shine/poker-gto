export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  suit: Suit
  rank: Rank
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type Position = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB'
export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'allin'
export type AgentType = 'human' | 'gto_ai' | 'exploitative_ai' | 'fish_ai' | 'nit_ai'
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'pro'

export interface Player {
  id: string
  position: Position
  seatIndex: number // 0-5, clockwise from dealer button
  stackBB: number
  holeCards: Card[] | null
  isHero: boolean
  agentType: AgentType
  isFolded: boolean
  isAllIn: boolean
  currentBetBB: number // amount bet in current street
}

export interface PotState {
  mainPotBB: number
  sidePots: SidePot[]
}

export interface SidePot {
  amountBB: number
  eligiblePlayerIds: string[]
}

export interface ActionRecord {
  handId: string
  street: Street
  playerId: string
  actorPosition?: Position // 行動したプレイヤーのポジション (リプレイ表示用)
  heroPosition: Position
  villainPositions: Position[]
  action: PlayerAction
  amountBB: number // to-amount: このアクションで到達したベット水準 (raise/call/allin)。fold/check は 0
  potBB: number // pot size before the action
  isIP: boolean
  timestamp: number
}

export interface GameState {
  handId: string
  street: Street
  players: Player[]
  board: Card[]
  pot: PotState
  actionHistory: ActionRecord[]
  currentActorId: string | null
  buttonSeatIndex: number
  bigBlindBB: number
  smallBlindBB: number
  handNumber: number
  isHandComplete: boolean
}

export type HandRank =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'one_pair'
  | 'high_card'

export interface HandEvalResult {
  rank: HandRank
  rankValue: number // lower = better (for comparison)
  description: string
}

export interface ShowdownResult {
  winnerId: string
  winnerIds: string[] // for splits
  handRank: HandRank
  amountWonBB: number
}
