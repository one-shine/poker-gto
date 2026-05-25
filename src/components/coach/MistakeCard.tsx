import type { CoachFeedback } from '../../types/coach'
import type { MistakeSeverity } from '../../types/stats'
import { StrategyDetail } from './StrategyDetail'

// 重大度ごとの見出し (色 + 形状で色覚配慮)。
const SEVERITY: Record<MistakeSeverity, { icon: string; label: string; cls: string }> = {
  critical: { icon: '◆', label: 'ブランダー', cls: 'text-rose-300' },
  major: { icon: '▲', label: 'ミス', cls: 'text-amber-300' },
  minor: { icon: '●', label: 'インアキュラシー', cls: 'text-yellow-300' },
}

// ミス時のフィードバックカード本体。EV損失(実解時)と推奨を示す。
// 枠/背景は親 CoachPanel が head.cls で付与するので、ここでは中身のみ描画する。
export function MistakeCard({ feedback }: { feedback: CoachFeedback }) {
  const sev = SEVERITY[feedback.severity ?? 'minor']
  return (
    <>
      <span className={`flex items-center gap-2 font-display font-extrabold ${sev.cls}`}>
        <span aria-hidden="true" className="text-lg">{sev.icon}</span>
        {sev.label}
        {feedback.showEv && (
          <span className="font-data text-sm font-bold">-{feedback.evLoss.toFixed(1)}BB</span>
        )}
      </span>
      <p className="text-sm text-zinc-200 leading-relaxed my-2">{feedback.message}</p>
      <StrategyDetail feedback={feedback} />
    </>
  )
}
