import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { CoachFeedback } from '../../types/coach'
import type { SolutionSource } from '../../types/solver'
import { CATEGORY_EXPLAIN } from '../../lib/coach/coachConcepts'

interface Props {
  feedback: CoachFeedback
  onDismiss: () => void
  durationMs?: number
}

// source の正直表示 (✓本物 / △近似)。色だけに頼らず記号 + 語で識別 (ルール5)。
const SOURCE_BADGE: Record<SolutionSource, { mark: string; text: string; cls: string }> = {
  solver_precomputed: { mark: '✓', text: 'GTOソルバー解', cls: 'bg-sky-900/50 text-sky-200' },
  solver_live: { mark: '✓', text: 'GTOソルバー解 (ローカル求解·簡易)', cls: 'bg-sky-900/50 text-sky-200' },
  approximate_with_ev: { mark: '△', text: 'GTO近似 +概算EV', cls: 'bg-amber-900/50 text-amber-200' },
  approximate: { mark: '△', text: 'GTO近似', cls: 'bg-amber-900/50 text-amber-200' },
}

// play モード用の非ブロッキング・トースト (critical のみ)。ハンドは止めない。
export function CoachToast({ feedback, onDismiss, durationMs = 8000 }: Props) {
  // ホバー中は自動消滅を一時停止 (読みきれない問題の解消)。✕ で手動クローズも可。
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [feedback, durationMs, onDismiss, paused])

  const badge = SOURCE_BADGE[feedback.source]
  const subtitle = feedback.category ? CATEGORY_EXPLAIN[feedback.category].label : null

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)]
        rounded-xl border border-rose-500/50 bg-rose-950/90 backdrop-blur-md px-4 py-2.5
        shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex items-start gap-2"
    >
      <span aria-hidden="true" className="text-rose-300 text-lg leading-none mt-0.5">◆</span>
      <div className="flex-1 min-w-0">
        <p className="text-rose-200 font-display font-extrabold text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
          ブランダー
          {feedback.showEv && <span className="font-data">-{feedback.evLoss.toFixed(1)}BB</span>}
          {/* A9: source バッジ (正直表示)。 */}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
            <span aria-hidden="true">{badge.mark} </span>{badge.text}
          </span>
        </p>
        {/* A9: カテゴリ副題。 */}
        {subtitle && <p className="text-rose-200/70 text-xs font-bold mt-0.5">{subtitle}</p>}
        <p className="text-zinc-200 text-sm leading-snug mt-0.5">{feedback.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="閉じる"
        className="text-zinc-400 hover:text-zinc-100 text-xs shrink-0"
      >
        ✕
      </button>
    </motion.div>
  )
}
