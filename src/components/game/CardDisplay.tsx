import type { Suit } from '../../types/game'
import type { Card } from '../../types/game'
import { SUIT_SYMBOLS } from '../../engine/cards/Card'

type CardSize = 'xs' | 'sm' | 'md' | 'lg'

interface CardDisplayProps {
  card?: Card | null
  faceDown?: boolean
  size?: CardSize
}

// hearts/diamonds = 赤、spades/clubs = 黒。色だけに依存させず記号(♠♥♦♣)を必ず併記する。
const isRed = (s: Suit) => s === 'hearts' || s === 'diamonds'

const SUIT_LABEL: Record<Suit, string> = {
  spades: 'スペード', hearts: 'ハート', diamonds: 'ダイヤ', clubs: 'クラブ',
}

// 柄(ピップ)は使わない。他のポーカーアプリ同様、ランク + スートを大きく明快に。
const SIZE: Record<CardSize, { box: string; rank: string; suit: string; back: string }> = {
  xs: { box: 'w-7 h-[2.6rem] rounded',      rank: 'text-sm',  suit: 'text-[10px]', back: '0.5rem' },
  sm: { box: 'w-10 h-[3.5rem] rounded',     rank: 'text-lg',  suit: 'text-sm',  back: '0.6rem' },
  md: { box: 'w-[3.5rem] h-20 rounded-md',  rank: 'text-3xl', suit: 'text-xl',  back: '0.85rem' },
  lg: { box: 'w-[5rem] h-28 rounded-lg',    rank: 'text-5xl', suit: 'text-3xl', back: '1.1rem' },
}

export function CardDisplay({ card, faceDown = false, size = 'md' }: CardDisplayProps) {
  const sz = SIZE[size]

  if (faceDown || !card) {
    return (
      <div
        className={`${sz.box} relative overflow-hidden grain bg-felt-700 ring-1 ring-brass-600/40 shadow-[0_2px_6px_rgba(0,0,0,0.5)] flex items-center justify-center select-none`}
        aria-label="裏向きのカード"
        role="img"
      >
        <div className="absolute inset-[2px] rounded-[inherit] bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(212,175,55,0.16)_4px,rgba(212,175,55,0.16)_5px),repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(212,175,55,0.16)_4px,rgba(212,175,55,0.16)_5px)]" />
        <span className="relative font-display font-extrabold text-brass-400/70 leading-none" style={{ fontSize: sz.back }}>G</span>
      </div>
    )
  }

  const displayRank = card.rank === 'T' ? '10' : card.rank
  const ink = isRed(card.suit) ? 'text-vermilion' : 'text-ink'
  const symbol = SUIT_SYMBOLS[card.suit]

  return (
    <div
      className={`${sz.box} relative overflow-hidden select-none flex flex-col items-center justify-center leading-none
        bg-gradient-to-br from-ivory-50 to-ivory-100
        ring-1 ring-black/15 shadow-[0_3px_8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.7)] ${ink}`}
      aria-label={`${displayRank} ${SUIT_LABEL[card.suit]}`}
      role="img"
    >
      <span className={`font-display font-extrabold tracking-tight ${sz.rank}`}>{displayRank}</span>
      <span className={`${sz.suit} leading-none mt-0.5`}>{symbol}</span>
    </div>
  )
}
