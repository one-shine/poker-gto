import type { CoachFeedback } from '../../types/coach'
import type { MistakeSeverity } from '../../types/stats'

// フィードバック種別ごとのカード枠色 (CoachPanel が付与)。色 + 形状で色覚配慮。
export function severityFrameClass(severity: MistakeSeverity | undefined): string {
  switch (severity) {
    case 'critical': return 'border-rose-500/50 bg-rose-950/40'
    case 'major': return 'border-amber-500/50 bg-amber-950/30'
    default: return 'border-yellow-500/40 bg-yellow-950/20'
  }
}

export function momentFrameClass(kind: CoachFeedback['kind']): string {
  return kind === 'mixed'
    ? 'border-teal-500/50 bg-teal-950/30'
    : 'border-emerald-500/50 bg-emerald-950/30'
}
