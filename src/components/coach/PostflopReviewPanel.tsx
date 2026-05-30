import { useState } from 'react'
import type { HeroDecision } from '../../stores/gameStore'
import { HERO_ID } from '../../stores/gameStore'
import { evaluateHeroDecision } from '../../engine/agents/CoachAgent'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import { boardTexture, postflopPrinciple, conceptIdForCategory } from '../../lib/coach/coachConcepts'
import type { CoachFeedback } from '../../types/coach'
import type { GameState, PlayerAction, Street } from '../../types/game'
import { StrategyDetail } from './StrategyDetail'
import { ConceptLink } from '../common/TermChips'
import { CardDisplay } from '../game/CardDisplay'

// play モードはハンドを止めないので postflop をライブ求解しない。代わりにハンド後、
// 捕捉した hero の postflop 決定を「実ボードのまま」on-demand で live solve して復習する。
// ボードアブストラクション無し (実ボードを解く) ＝ 事前計算ライブラリより honest。

const STREET_JP: Partial<Record<Street, string>> = { flop: 'フロップ', turn: 'ターン', river: 'リバー' }
const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'ベット/レイズ', allin: 'オールイン',
}

interface ReviewResult { decision: HeroDecision; feedback: CoachFeedback | null }

// 解の戦略から最頻アクション (= GTO推奨) を取り出す。
function recommendedAction(feedback: CoachFeedback): PlayerAction {
  let best = feedback.strategy[0]
  for (const s of feedback.strategy) if (s.frequency > (best?.frequency ?? -1)) best = s
  return best?.action ?? feedback.chosen
}

// hero のホールカード + ボードから現状の役を評価する (一般原則を述べるため)。
function heroMadeRank(state: GameState) {
  const hero = state.players.find(p => p.id === HERO_ID)
  if (!hero?.holeCards || hero.holeCards.length < 2) return null
  return evaluateBestHand([...hero.holeCards, ...state.board]).rank
}

// D8: 各決定の 💡 展開。一般原則 (近似なので断定しない) + 理論ディープリンク。
function DecisionInsight({ result }: { result: ReviewResult }) {
  const [open, setOpen] = useState(false)
  const fb = result.feedback
  if (!fb) return null

  const texture = boardTexture(result.decision.state.board)
  const rank = heroMadeRank(result.decision.state)
  const principle = rank ? postflopPrinciple(rank, recommendedAction(fb)) : null
  const conceptId = fb.category ? conceptIdForCategory(fb.category) : null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 min-h-7 text-[11px] font-bold text-brass-300 hover:text-brass-200 transition-colors"
      >
        <span aria-hidden="true">💡</span> {open ? '解説を閉じる' : 'なぜ? 解説を見る'}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg bg-black/30 p-2.5 space-y-1.5 text-[12px] leading-relaxed text-zinc-300">
          <p>
            <span className="font-bold text-zinc-200">{texture.label}</span>
            <span className="text-zinc-400"> — {texture.note}</span>
          </p>
          {principle && <p className="text-zinc-300">{principle}</p>}
          {/* 近似/簡易求解のため、一般原則として提示する旨を明記 (断定を避ける) */}
          <p className="text-[10px] text-zinc-500">※ 一般原則です。盤面・相手・スタックで変わります。</p>
          {conceptId && <ConceptLink conceptId={conceptId} label="関連理論を読む ▶" />}
        </div>
      )}
    </div>
  )
}

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
              <DecisionInsight result={r} />
            </>
          ) : (
            <p className="text-xs text-zinc-500">この局面は評価対象外でした(未対応スポット)。</p>
          )}
        </div>
      ))}
    </div>
  )
}
