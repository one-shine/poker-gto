import type { Card, Rank, Suit } from '../../types/game'

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
}

export function cardToString(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`
}

export function parseCard(str: string): Card {
  // e.g. "As", "Kh", "Td", "2c"
  const rankChar = str[0].toUpperCase()
  const suitChar = str[1].toLowerCase()
  const rankMap: Record<string, Rank> = {
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', 'T': 'T', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
  }
  const suitMap: Record<string, Suit> = {
    's': 'spades', 'h': 'hearts', 'd': 'diamonds', 'c': 'clubs',
  }
  const rank = rankMap[rankChar]
  const suit = suitMap[suitChar]
  if (!rank || !suit) throw new Error(`Invalid card string: ${str}`)
  return { rank, suit }
}

export function parseCards(str: string): Card[] {
  // e.g. "As Kh Td 2c 7s"
  return str.trim().split(/\s+/).map(parseCard)
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit
}
