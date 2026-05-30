import { useState } from 'react'
import type { HeroDecision } from '../../stores/gameStore'
import { HERO_ID } from '../../stores/gameStore'
import { evaluateHeroDecision } from '../../engine/agents/CoachAgent'
import type { CoachFeedback } from '../../types/coach'
import type { PlayerAction, Street } from '../../types/game'
import { StrategyDetail } from './StrategyDetail'
import { CardDisplay } from '../game/CardDisplay'

// play モードはハンドを止めないので postflop をライブ求解しない。代わりにハンド後、
// 捕捉した hero の postflop 決定を「実ボードのまま」on-demand で live solve して復習する。
// ボードアブストラクション無し (実ボードを解く) ＝ 事前計算ライブラリより honest。

const STREET_JP: Partial<Record<Street, string>> = { flop: 'フロップ', turn: 'ターン', river: 'リバー' }
const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'ベット/レイズ', allin: 'オールイン',
}

interface ReviewResult { decision: HeroDecision; feedback: CoachFeedback | null }

export function PostflopReviewPanel({ decisions }: { decisions: HeroDecision[] }) {
  const [results, setResults] = useState<ReviewResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    setResults([])
    for (const d of decisions) {
      // 実ボードをそのまま求解 (allowLiveSolve=true)。Worker 実行なので UI はブロックしない。
      const feedback = await evaluateHeroDecision(d.state, HERO_ID, d.action, d.amount, true)
      setResults(prev => [...(prev ?? []), { decision: d, feedback }])
    }
    setLoading(false)
  }

  if (results === null) {
    return (
      <div className="rounded-xl bg-base-900/70 border border-brass-400/30 p-3 text-sm text-zinc-300 flex items-center justify-between gap-3">
        <span>このハンドのポストフロップ {decisions.length} 件をソルバーで復習できます(実ボードを求解)。</span>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="shrink-0 min-h-9 px-4 rounded-lg brass font-display font-bold disabled:opacity-60"
        >
          {loading ? '求解中…' : `復習する (${decisions.length}) ▸`}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-base-900/70 border border-brass-400/30 p-3 space-y-3">
      <h3 className="text-sm font-display font-bold text-zinc-100">
        ポストフロップ復習
        {loading && <span className="ml-2 text-xs text-zinc-400">求解中… ({results.length}/{decisions.length})</span>}
      </h3>
      {results.map((r, i) => (
        <div key={i} className="space-y-1.5 border-t border-white/5 pt-2 first:border-0 first:pt-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-200">{STREET_JP[r.decision.state.street] ?? r.decision.state.street}</span>
            <span className="flex gap-0.5">
              {r.decision.state.board.map((c, j) => <CardDisplay key={j} card={c} size="xs" />)}
            </span>
            <span>· あなた: <span className="text-zinc-200">{ACTION_JP[r.decision.action]}</span></span>
          </div>
          {r.feedback ? (
            <>
              <p className={`text-sm ${r.feedback.kind === 'mistake' ? 'text-rose-300' : 'text-emerald-300'}`}>
                {r.feedback.message}
              </p>
              <StrategyDetail feedback={r.feedback} />
            </>
          ) : (
            <p className="text-xs text-zinc-500">この局面は評価対象外でした(未対応スポット)。</p>
          )}
        </div>
      ))}
    </div>
  )
}
