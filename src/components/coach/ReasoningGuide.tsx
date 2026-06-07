import { useMemo, useState } from 'react'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import { getTotalPot } from '../../engine/game/BettingEngine'
import { HERO_ID } from '../../stores/gameStore'
import { useEquity } from '../../hooks/useEquity'
import { buildDecisionGuidance } from '../../lib/coach/decisionGuidance'
import { conceptById } from '../../data/theory/concepts'
import { TermChips, ConceptLink } from '../common/TermChips'

// アクション「前」に出す「この局面の考え方」ガイド (答え中立=GTO頻度は出さない・U8維持)。
// 既定は折りたたみ: 手番が来た瞬間にヒント(観点)を見てしまわないよう、開くのはユーザー操作のみ。
export function ReasoningGuide({ pending }: { pending: ActionRequiredPayload }) {
  const [open, setOpen] = useState(false)
  const { equity, reference, reason } = useEquity(pending.state, HERO_ID, true)

  const callAmount = pending.callAmount
  const effPot = getTotalPot(pending.state) + pending.state.players.reduce((s, p) => s + p.currentBetBB, 0)
  const reqEquity = callAmount > 0 ? callAmount / (effPot + callAmount) : 0

  const guidance = useMemo(
    () => buildDecisionGuidance(pending.state, HERO_ID, { callAmount, reqEquity, equity, reference, equityReason: reason }),
    [pending.state, callAmount, reqEquity, equity, reference, reason],
  )

  // 理論リンクは概念ごとに「タイトル」を出して区別する(同一ラベルの羅列を避ける)。最大3件。
  const conceptLinks = guidance.conceptIds
    .map(id => ({ id, title: conceptById(id)?.title }))
    .filter((c): c is { id: string; title: string } => !!c.title)
    .slice(0, 3)

  return (
    // relative: 展開部は絶対配置で卓の上に重ねる(レイアウト高を増やさない=卓を潰さない)。
    <div className="relative w-full max-w-2xl">
      <div className="rounded-2xl border border-sky-500/25 bg-base-800/70 backdrop-blur-md overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-300"
        >
          <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
            <span aria-hidden="true">💡</span> この局面の考え方
            {!open && <span className="text-zinc-500 font-normal">(タップで開く・答えは出ません)</span>}
          </span>
          <span className="text-zinc-400 text-xs shrink-0" aria-hidden="true">{open ? '▲ 閉じる' : '▼ 開く'}</span>
        </button>
      </div>

      {open && (
        // 卓の上に上方向へ重ねる(absolute=actionRef の高さに加算されない→卓は常にフルサイズ)。
        <div className="absolute left-0 right-0 bottom-full mb-2 z-20 max-h-[55vh] overflow-auto
          rounded-2xl border border-sky-500/30 bg-base-900/95 backdrop-blur-md p-3 space-y-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
          <p className="text-[11px] text-zinc-400">{guidance.situation}</p>
          <ul className="space-y-1.5">
            {guidance.considerations.map((c, i) => (
              <li key={i} className="text-xs text-zinc-300 leading-snug flex gap-2">
                <span className="shrink-0 text-sky-300/90 font-bold min-w-[3.5rem]">{c.label}</span>
                <span>
                  {c.value && <span className="font-data text-zinc-100">{c.value}</span>}
                  {c.value && c.note && <span className="text-zinc-500"> — </span>}
                  {c.note && <span className="text-zinc-400">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-zinc-500 leading-snug">
            ※ 考えるべき観点のみ(GTO の答えは打った後に表示)。
          </p>
          {(conceptLinks.length > 0 || guidance.terms.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {conceptLinks.map(c => (
                <ConceptLink key={c.id} conceptId={c.id} label={`${c.title} ▶`} />
              ))}
              <TermChips terms={guidance.terms} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
