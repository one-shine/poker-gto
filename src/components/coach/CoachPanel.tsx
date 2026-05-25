import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { CoachFeedback } from '../../types/coach'
import { MistakeCard } from './MistakeCard'
import { MomentLesson } from './MomentLesson'
import { severityFrameClass, momentFrameClass } from './feedbackFrame'

interface CoachPanelProps {
  feedback: CoachFeedback
  onDismiss: () => void
  // study mode で自動再開する秒数 (0 = 自動再開しない)
  autoAdvanceSeconds?: number
}

// study モードのブロッキング・フィードバックパネル。
// 枠/自動再開/「次へ」だけを担い、中身は kind ごとに MistakeCard / MomentLesson へ委譲する。
export function CoachPanel({ feedback, onDismiss, autoAdvanceSeconds = 0 }: CoachPanelProps) {
  // 自動再開タイマー (study mode)
  useEffect(() => {
    if (autoAdvanceSeconds <= 0) return
    const t = setTimeout(onDismiss, autoAdvanceSeconds * 1000)
    return () => clearTimeout(t)
  }, [autoAdvanceSeconds, onDismiss, feedback])

  const isMistake = feedback.kind === 'mistake'
  const frame = isMistake ? severityFrameClass(feedback.severity) : momentFrameClass(feedback.kind)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      role="status"
      className={`relative w-full max-w-2xl rounded-2xl border p-4 pr-20 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.5)] ${frame}`}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 min-h-8 px-3 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-zinc-100"
      >
        次へ →
      </button>
      {isMistake ? <MistakeCard feedback={feedback} /> : <MomentLesson feedback={feedback} />}
    </motion.div>
  )
}
