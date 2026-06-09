import { useEffect, useMemo, useState } from 'react'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import { getTotalPot } from '../../engine/game/BettingEngine'
import { handCategory } from '../../engine/cards/handCategory'
import { HERO_ID } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSolution } from '../../hooks/useSolution'
import { useEquity } from '../../hooks/useEquity'
import { buildDecisionGuidance } from '../../lib/coach/decisionGuidance'
import { conceptById } from '../../data/theory/concepts'
import { StrategyBars } from './StrategyBars'
import { OddsGuide } from './OddsGuide'
import { TermChips, ConceptLink } from '../common/TermChips'
import { BookIcon } from '../icons/ActionIcons'
import { recommendedSolution, actionSizeLabel, recommendLabel } from '../../lib/coach/recommendation'
import type { PlayerAction } from '../../types/game'
import type { ActionSolution } from '../../types/solver'

// 手作りプリフロップレンジは「降り100%」の手をデータから省く。収録スポット(node あり)でも
// handKey が無い=レンジ外=純フォールド。これを「対象外」ではなく「フォールド100%」と表示する。
const FOLD_ONLY: ActionSolution[] = [{ action: 'fold', frequency: 1, ev: 0 }]

const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}

interface Props {
  pending: ActionRequiredPayload
  // decision = アクション前(折りたたみ・答えは「答えを見る」で任意表示)
  // review   = アクション後(自動展開・答え合わせを表示)
  phase: 'decision' | 'review'
  actedAction?: PlayerAction // review で「あなた: ◯◯」に出す
}

// 局面の説明を1パネルに統合: 考え方観点 / オッズ目安(1回) / GTOの答え / 関連理論。
// U8: アクション前は答え(GTO頻度)を自動表示しない。見るには明示操作 → その手は精度測定から除外。
export function SpotPanel({ pending, phase, actedAction }: Props) {
  const review = phase === 'review'
  const [open, setOpen] = useState(review)
  const [revealed, setRevealed] = useState(review)
  const [theoryOpen, setTheoryOpen] = useState(false) // 関連理論・用語は既定折りたたみ(場所を取りすぎる)
  const [thinkOpen, setThinkOpen] = useState(false)   // review での「考え方(観点)」折りたたみ
  const markHinted = useSessionStore(s => s.markHinted)
  const studyShowStrategy = useSettingsStore(s => s.studyShowStrategy)

  // decision モーダルは Escape で閉じる(review はインライン表示なので対象外)。
  useEffect(() => {
    if (review || !open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [review, open])

  // allowLiveSolve は revealed に連動: 答えを見るまで postflop の live solve を走らせない。
  const { node, loading } = useSolution(pending.state, HERO_ID, revealed, true)
  const { equity, loading: eqLoading, reference, reason } = useEquity(pending.state, HERO_ID, true)

  const hero = pending.state.players.find(p => p.id === HERO_ID)
  const handKey = hero?.holeCards ? handCategory(hero.holeCards) : null
  const rawStrategy = node && handKey ? node.strategy[handKey] ?? null : null
  // preflop の収録スポットで handKey 無し = レンジ外 = フォールド100%(降りの手はデータ省略)。
  const foldOut = !rawStrategy && !!node && node.street === 'preflop' &&
    (node.source === 'approximate' || node.source === 'approximate_with_ev')
  const strategy = rawStrategy ?? (foldOut ? FOLD_ONLY : null)
  const recommended = strategy ? recommendedSolution(strategy) : null
  const activeCount = pending.state.players.filter(p => !p.isFolded).length

  const callAmount = pending.callAmount
  const effPot = getTotalPot(pending.state) + pending.state.players.reduce((s, p) => s + p.currentBetBB, 0)
  const reqEquity = callAmount > 0 ? callAmount / (effPot + callAmount) : 0

  const guidance = useMemo(
    () => buildDecisionGuidance(pending.state, HERO_ID, { callAmount, reqEquity, equity, reference, equityReason: reason }),
    [pending.state, callAmount, reqEquity, equity, reference, reason],
  )
  // 理論/用語は「関連理論・用語」に集約: 観点由来 + オッズ由来(pot-odds・用語)を1箇所に。
  const allConceptIds = [...new Set([...guidance.conceptIds, 'pot-odds'])]
  const conceptLinks = allConceptIds
    .map(id => ({ id, title: conceptById(id)?.title }))
    .filter((c): c is { id: string; title: string } => !!c.title)
    .slice(0, 4)
  const allTerms = [...new Set([...guidance.terms, 'ポットオッズ', '必要勝率', 'エクイティ'])]

  // decision で答えを開いた手は精度測定から除外(review は既に打ったので不要)。
  function reveal() {
    if (!review) markHinted(pending.state.handId)
    setRevealed(true)
  }

  const odds = (
    <OddsGuide callAmount={callAmount} reqEquity={reqEquity} equity={equity}
      eqLoading={eqLoading} effPot={effPot} reference={reference} reason={reason} />
  )

  const sourceBadge = node?.source === 'approximate'
    ? '参考: GTO近似' : node?.source === 'approximate_with_ev' ? 'GTO近似 + 概算EV' : null

  let answer: React.ReactNode = null
  if (!revealed) {
    // decision かつ study(答え表示ON)のときだけ「答えを見る」を出す。純テスト時は出さない。
    if (!review && studyShowStrategy) {
      answer = (
        <button type="button" onClick={reveal}
          className="min-h-11 px-3 rounded-lg text-xs font-bold bg-brass-500/15 text-brass-200 hover:bg-brass-500/25
            transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass-300">
          ▸ GTO の答えを見る <span className="text-zinc-400 font-normal">(この手は精度測定から除外)</span>
        </button>
      )
    }
  } else if (loading) {
    answer = (
      <span className="text-xs text-brass-300/80 flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-brass-400/40 border-t-brass-300 animate-spin" />
        GTO 解を求めています…
      </span>
    )
  } else if (!node || !strategy) {
    answer = (
      <span className="block text-xs text-zinc-500">
        GTO 解の<strong className="text-zinc-400">対象外</strong>
        <span className="text-zinc-600">{activeCount >= 3 ? '(マルチウェイ)' : '(未収録スポット)'}</span>
      </span>
    )
  } else {
    answer = (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-brass-300">GTO 戦略</span>
          {handKey && node && <span className="text-[10px] text-zinc-400">{handKey} @ {node.spotId}</span>}
          {node.multiwayReference && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300"
              title="3人以上(マルチウェイ)。ヘッズアップのレンジを参考表示(厳密解ではない・精度測定対象外)。">マルチウェイ=参考値</span>
          )}
          {sourceBadge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">{sourceBadge}</span>}
        </div>
        <StrategyBars
          strategy={strategy}
          source={node.source}
          showEv={!foldOut && !node.multiwayReference && node.source !== 'approximate'}
          approxEv={!foldOut && !node.multiwayReference && node.source === 'approximate_with_ev'}
          showRecommended={revealed}
        />
        {node.multiwayReference && (
          <p className="text-[11px] text-amber-300/80 leading-snug">
            ※ 3人以上(マルチウェイ)のため、相手レイザーに対する<strong className="text-amber-200">ヘッズアップのレンジを参考</strong>として表示しています。
            実際の最適頻度はこれより気持ちタイトになります。厳密解ではないため精度測定には含めません。
          </p>
        )}
      </div>
    )
  }

  // 関連理論・用語は既定で畳む(大ボタン+チップで縦に伸び、卓を圧迫し場所を取りすぎるため)。
  const theory = (conceptLinks.length > 0 || allTerms.length > 0) ? (
    <div className="border-t border-white/5 pt-1.5">
      <button
        type="button"
        onClick={() => setTheoryOpen(o => !o)}
        aria-expanded={theoryOpen}
        className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-300"
      >
        <BookIcon className="inline w-3.5 h-3.5" /> 関連理論・用語 <span aria-hidden="true">{theoryOpen ? '▲' : '▾'}</span>
      </button>
      {theoryOpen && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {conceptLinks.map(c => <ConceptLink key={c.id} conceptId={c.id} label={`${c.title} ▶`} />)}
          <TermChips terms={allTerms} />
        </div>
      )}
    </div>
  ) : null

  // 考え方(観点): 状況 + 観点リスト。decision は常時 / review は折りたたみで「見れる」。
  const considerationsBlock = (
    <>
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
    </>
  )

  // 本文(共有)。オッズは常に1回。
  // decision: 観点を常時表示(このシート自体が「考え方」)。
  // review: 観点を折りたたみで提供(打った後も振り返れる・既定は答え主体でコンパクト)。
  const bodyInner = (
    <div className="space-y-2">
      {!review && considerationsBlock}
      {review && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-950/10">
          <button
            type="button"
            onClick={() => setThinkOpen(o => !o)}
            aria-expanded={thinkOpen}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-300"
          >
            <span className="text-[11px] font-bold text-sky-300"><span aria-hidden="true">💡</span> この局面の考え方(観点)</span>
            <span className="text-zinc-400 text-xs" aria-hidden="true">{thinkOpen ? '▲' : '▾'}</span>
          </button>
          {thinkOpen && <div className="px-2 pb-2 space-y-1.5">{considerationsBlock}</div>}
        </div>
      )}
      {odds}
      {answer}
      {theory}
    </div>
  )

  // review: インライン・自動展開。
  if (review) {
    // 高さ上限+内部スクロール: パネルが伸びても卓の高さを奪い座席が重なるのを防ぐ(防御)。
    return (
      <div className="w-full max-w-2xl max-h-[48vh] overflow-auto rounded-2xl border border-brass-500/25 bg-base-800/85 backdrop-blur-md p-3 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <svg className="w-3.5 h-3.5 shrink-0 text-brass-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="0.5" /><rect x="12" y="7" width="3" height="10" rx="0.5" /><rect x="17" y="13" width="3" height="4" rx="0.5" /></svg>
          <span className="text-[11px] font-bold text-brass-300">答え合わせ</span>
          {actedAction && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-700 text-zinc-200 border border-white/10">
              あなた: <span className="font-bold text-zinc-100">{ACTION_JP[actedAction]}</span>
            </span>
          )}
          {recommended && node && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brass-500/15 text-brass-200 border border-brass-400/30 inline-flex items-center gap-1">
              <span aria-hidden="true">★</span>
              {recommendLabel(node.source)}: <span className="font-bold">{actionSizeLabel(recommended)}</span>
            </span>
          )}
        </div>
        {bodyInner}
      </div>
    )
  }

  // decision: 1行バー + 開くと「固定ボトムシート」。固定にすることで上端が祖先の overflow に
  // クリップされず(「上が見切れて戻れない」回避)、卓の高さも奪わない(座席の重なり回避)。
  return (
    <div className="w-full max-w-2xl">
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
            <span className="text-zinc-500 font-normal">(タップで開く・答えは出ません)</span>
          </span>
          <span className="text-zinc-400 text-xs shrink-0" aria-hidden="true">▼ 開く</span>
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="この局面の考え方"
            onClick={e => e.stopPropagation()}
            className="w-[92vw] max-w-md max-h-[70vh] overflow-auto rounded-2xl border border-sky-500/30
              bg-base-900/98 backdrop-blur-md p-3 shadow-[0_8px_30px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-sky-300"><span aria-hidden="true">💡</span> この局面の考え方</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-8 px-2 text-xs text-zinc-300 hover:text-zinc-100
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-300"
              >
                ✕ 閉じる
              </button>
            </div>
            {bodyInner}
          </div>
        </div>
      )}
    </div>
  )
}
