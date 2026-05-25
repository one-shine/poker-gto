import { motion } from 'framer-motion'
import type { Player, ShowdownResult } from '../../types/game'
import { HERO_ID } from '../../stores/gameStore'

interface Props {
  results: ShowdownResult[]
  players: Player[]
}

// ハンド終了時の勝者・獲得額カード。生ID ではなくポジション名 (あなた/BB) で表示する。
export function HandResultOverlay({ results, players }: Props) {
  if (results.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-xl bg-base-800/95 border border-brass-500/30 px-5 py-2.5 text-sm text-center shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      role="status"
    >
      {results.map((r, i) => {
        const pos = players.find(p => p.id === r.winnerId)?.position
        const name = r.winnerId === HERO_ID ? 'あなた' : pos ?? r.winnerId
        return (
          <p key={i} className="text-zinc-100">
            <span className="font-display font-bold text-brass-300">{name}</span> の勝ち
            <span className="font-data text-emerald-300 font-bold"> +{r.amountWonBB}BB</span>
            <span className="text-zinc-500 text-xs"> ({r.handRank})</span>
          </p>
        )
      })}
    </motion.div>
  )
}
