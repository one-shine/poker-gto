import { useState } from 'react'
import type { Card, Rank, Suit } from '../../types/game'
import { RANKS, SUITS, SUIT_SYMBOLS } from '../../engine/cards/Card'
import { CardDisplay } from '../game/CardDisplay'

// ソルバータブのカード設定を視覚的に行うピッカー。手札(2枚)+ 盤面(street で枚数可変)を
// 52枚グリッドのタップで選ぶ。テキスト記法の手打ちを置き換える。色だけに依存せず記号(♠♥♦♣)を
// 併記する(設計ルール5)。汎用部品として将来の盤面指定 UI でも再利用可。

const SUIT_JP: Record<Suit, string> = { spades: 'スペード', hearts: 'ハート', diamonds: 'ダイヤ', clubs: 'クラブ' }
const isRed = (s: Suit) => s === 'hearts' || s === 'diamonds'
const cardKey = (c: Card): string => `${c.rank}${c.suit}`
const dispRank = (r: Rank): string => (r === 'T' ? '10' : r)
const RANKS_DESC = [...RANKS].reverse() // A→2(レンジ表と同じ並び)

interface CardSelectorProps {
  boardNeed: number              // 盤面に必要な枚数(preflop=0 / flop=3 / turn=4 / river=5)
  heroCards: Card[]
  boardCards: Card[]
  onHero: (cards: Card[]) => void
  onBoard: (cards: Card[]) => void
}

type Target = 'hero' | 'board'

export function CardSelector({ boardNeed, heroCards, boardCards, onHero, onBoard }: CardSelectorProps) {
  const [target, setTarget] = useState<Target>('hero')
  const heroFull = heroCards.length >= 2
  const boardFull = boardCards.length >= boardNeed

  // 有効な編集対象に自動で寄せる(満杯のフィールドにタップしても進まないように)。
  const effTarget: Target =
    boardNeed === 0 ? 'hero'
      : target === 'hero' && heroFull && !boardFull ? 'board'
        : target === 'board' && boardFull && !heroFull ? 'hero'
          : target

  const used = new Set<string>([...heroCards, ...boardCards].map(cardKey))

  const pick = (card: Card) => {
    if (used.has(cardKey(card))) return
    if (effTarget === 'hero') { if (heroCards.length < 2) onHero([...heroCards, card]) }
    else if (boardCards.length < boardNeed) onBoard([...boardCards, card])
  }
  const removeFrom = (cards: Card[], setter: (c: Card[]) => void, c: Card) =>
    setter(cards.filter(x => cardKey(x) !== cardKey(c)))

  return (
    <div className="space-y-2">
      <SlotRow
        label="自分の2枚" need={2} cards={heroCards} active={effTarget === 'hero'}
        onActivate={() => setTarget('hero')} onRemove={c => removeFrom(heroCards, onHero, c)}
      />
      {boardNeed > 0 && (
        <SlotRow
          label={`盤面(${boardNeed}枚)`} need={boardNeed} cards={boardCards} active={effTarget === 'board'}
          onActivate={() => setTarget('board')} onRemove={c => removeFrom(boardCards, onBoard, c)}
        />
      )}

      {/* 52枚グリッド(使用済みは淡色で選択不可) */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[21rem] space-y-1">
          {SUITS.map(suit => (
            <div key={suit} className="flex items-center gap-1">
              <span className={`w-4 text-center text-sm ${isRed(suit) ? 'text-vermilion' : 'text-zinc-300'}`} aria-hidden="true">
                {SUIT_SYMBOLS[suit]}
              </span>
              <div className="flex gap-0.5">
                {RANKS_DESC.map(rank => {
                  const card: Card = { rank, suit }
                  const u = used.has(cardKey(card))
                  return (
                    <button
                      key={rank} type="button" disabled={u} onClick={() => pick(card)}
                      aria-label={`${dispRank(rank)}${SUIT_JP[suit]}を選択`}
                      className={`min-w-[1.9rem] h-9 rounded flex items-center justify-center gap-0.5 border text-xs font-bold leading-none
                        ${u
                          ? 'opacity-25 border-white/5 bg-base-900 cursor-not-allowed'
                          : `bg-ivory-50 border-black/15 hover:ring-2 hover:ring-brass-300 ${isRed(suit) ? 'text-vermilion' : 'text-ink'}`}`}
                    >
                      {dispRank(rank)}<span className="text-[9px]" aria-hidden="true">{SUIT_SYMBOLS[suit]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 1フィールド(手札 or 盤面)の選択スロット。タップで編集対象に切替・選択済みカードのタップで外す。
function SlotRow({ label, need, cards, active, onActivate, onRemove }: {
  label: string; need: number; cards: Card[]; active: boolean
  onActivate: () => void; onRemove: (c: Card) => void
}) {
  return (
    <div
      className={`rounded-lg p-2 border transition-colors ${active ? 'border-brass-400/60 bg-brass-500/10' : 'border-white/5 bg-base-900/40'}`}
      onClick={onActivate}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400">{label}</span>
        {active && <span className="text-[10px] text-brass-300">編集中 — 下のカードをタップ</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: need }).map((_, i) => {
          const c = cards[i]
          return c ? (
            <button
              key={i} type="button"
              onClick={e => { e.stopPropagation(); onRemove(c) }}
              aria-label={`${c.rank === 'T' ? '10' : c.rank}${SUIT_JP[c.suit]}を外す`}
              className="rounded hover:opacity-70"
            >
              <CardDisplay card={c} size="xs" />
            </button>
          ) : (
            <div
              key={i} aria-hidden="true"
              className="w-7 h-[2.6rem] rounded border border-dashed border-white/15 bg-base-800/40"
            />
          )
        })}
      </div>
    </div>
  )
}
