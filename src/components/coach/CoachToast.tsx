import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { CoachFeedback } from '../../types/coach'

interface Props {
  feedback: CoachFeedback
  onDismiss: () => void
  durationMs?: number
}

// play モード用の非ブロッキング・トースト (critical のみ)。ハンドは止めない。
export function CoachToast({ feedback, onDismiss, durationMs = 4500 }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [feedback, durationMs, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)]
        rounded-xl border border-rose-500/50 bg-rose-950/90 backdrop-blur-md px-4 py-2.5
        shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex items-start gap-2"
    >
      <span aria-hidden="true" className="text-rose-300 text-lg leading-none mt-0.5">◆</span>
      <div className="flex-1 min-w-0">
        <p className="text-rose-200 font-display font-extrabold text-sm flex items-center gap-2">
          ブランダー
          {feedback.showEv && <span className="font-data">-{feedback.evLoss.toFixed(1)}BB</span>}
        </p>
        <p className="text-zinc-300 text-xs leading-snug">{feedback.message}</p>
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
