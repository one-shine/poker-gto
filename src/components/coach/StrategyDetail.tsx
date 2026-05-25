import type { CoachFeedback } from '../../types/coach'
import { StrategyBars } from './StrategyBars'

// MistakeCard / MomentLesson 共通の「GTO戦略 + 信頼度バッジ」ブロック。
// source/exploitability の正直な表示はここに集約する (CLAUDE.md 規約: source 常時明示)。
export function StrategyDetail({ feedback }: { feedback: CoachFeedback }) {
  return (
    <div className="rounded-xl bg-black/30 p-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-bold text-zinc-400">
          {feedback.handKey} @ {feedback.spotId} の GTO 戦略
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {!feedback.showEv ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">参考: GTO近似</span>
          ) : (
            <>
              {/* turn/flop の solver_live はエクイティ近似(以降の賭け未考慮)= river より信頼度低い (R14) */}
              {feedback.source === 'solver_live' && feedback.street !== 'river' && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300"
                  title="ターン/フロップは「オールイン相当」のエクイティ近似で、以降のベッティングを考慮しません。リバーより精度は低めです。"
                >
                  簡易: 賭け未考慮
                </span>
              )}
              {feedback.exploitability != null && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900/40 text-sky-300 font-data"
                  title="均衡からのズレ (小さいほど高精度)。ローカル簡易求解の収束度。"
                >
                  収束 {(feedback.exploitability * 100).toFixed(1)}%
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <StrategyBars
        strategy={feedback.strategy}
        source={feedback.source}
        showEv={feedback.showEv}
        chosen={feedback.chosen}
      />
    </div>
  )
}
