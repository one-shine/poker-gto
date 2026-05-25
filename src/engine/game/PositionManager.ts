import type { Position, Player } from '../../types/game'

// Seat offset from button: 0=BTN 1=SB 2=BB 3=UTG 4=MP 5=CO
const OFFSET_TO_POSITION: Record<number, Position> = {
  0: 'BTN', 1: 'SB', 2: 'BB', 3: 'UTG', 4: 'MP', 5: 'CO',
}

export function getPosition(seatIndex: number, buttonSeatIndex: number): Position {
  return OFFSET_TO_POSITION[(seatIndex - buttonSeatIndex + 6) % 6]
}

// Postflop order: SB(1)→BB(2)→UTG(3)→MP(4)→CO(5)→BTN(0)
function postflopKey(offset: number): number {
  return offset === 0 ? 6 : offset
}

export function getPreflopActionOrder(players: Player[], buttonSeatIndex: number): Player[] {
  return [...players].sort((a, b) => {
    // Preflop: UTG(3) first → offsets 3,4,5,0,1,2
    const oA = (a.seatIndex - buttonSeatIndex + 6) % 6
    const oB = (b.seatIndex - buttonSeatIndex + 6) % 6
    return (oA - 3 + 6) % 6 - (oB - 3 + 6) % 6
  })
}

export function getPostflopActionOrder(players: Player[], buttonSeatIndex: number): Player[] {
  return [...players].sort((a, b) => {
    const oA = (a.seatIndex - buttonSeatIndex + 6) % 6
    const oB = (b.seatIndex - buttonSeatIndex + 6) % 6
    return postflopKey(oA) - postflopKey(oB)
  })
}

// IP = acts last postflop among active players
export function isHeroIP(
  heroSeatIndex: number,
  buttonSeatIndex: number,
  activePlayerSeatIndices: number[],
): boolean {
  const heroKey = postflopKey((heroSeatIndex - buttonSeatIndex + 6) % 6)
  const maxKey = Math.max(...activePlayerSeatIndices.map(s => postflopKey((s - buttonSeatIndex + 6) % 6)))
  return heroKey === maxKey
}
