import { useEffect, useRef } from 'react'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import { getTotalPot } from '../../engine/game/BettingEngine'
import { handCategory } from '../../engine/cards/handCategory'
import { HERO_ID } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSolution } from '../../hooks/useSolution'
import { useEquity } from '../../hooks/useEquity'
import { StrategyBars } from './StrategyBars'

interface Props {
  pending: ActionRequiredPayload
  allowLiveSolve: boolean
  showPotOdds: boolean // UIComplexity (intermediate+)
}

// A1: study モードでアクション直下に GTO 戦略を常時表示 (頻度バー)。
// A2: showPotOdds のとき ポットオッズ / 必要勝率を表示。
// 戦略を見せる = 答えを見せるため、このハンドは精度サンプルから除外 (markHinted)。
export function LiveStrategyPanel({ pending, allowLiveSolve, showPotOdds }: Props) {
  const markHinted = useSessionStore(s => s.markHinted)
  const { node, loading } = useSolution(pending.state, HERO_ID, allowLiveSolve)
  // R8: 自分の vs相手レンジ・エクイティ (必要勝率と並べて「片手落ち」を解消)
  const { equity, loading: eqLoading } = useEquity(pending.state, HERO_ID, showPotOdds)

  const hero = pending.state.players.find(p => p.id === HERO_ID)
  const handKey = hero?.holeCards ? handCategory(hero.holeCards) : null

  // 常時表示=答えを見せるので、表示できたハンドは精度サンプルから除外
  const hintedRef = useRef<string | null>(null)
  useEffect(() => {
    const id = pending.state.handId
    if (node && handKey && node.strategy[handKey] && hintedRef.current !== id) {
      hintedRef.current = id
      markHinted(id)
    }
  }, [node, handKey, pending.state.handId, markHinted])

  // A2: ポットオッズ / 必要勝率 (純算術。コールが必要なときのみ)
  const callAmount = pending.callAmount
  const effPot = getTotalPot(pending.state) + pending.state.players.reduce((s, p) => s + p.currentBetBB, 0)
  const reqEquity = callAmount > 0 ? callAmount / (effPot + callAmount) : 0

  const strategy = node && handKey ? node.strategy[handKey] ?? null : null

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-brass-500/25 bg-base-800/85 backdrop-blur-md p-3 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-brass-300 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="0.5" /><rect x="12" y="7" width="3" height="10" rx="0.5" /><rect x="17" y="13" width="3" height="4" rx="0.5" /></svg> GTO 戦略
          {handKey && node && <span className="text-zinc-400 font-normal">{handKey} @ {node.spotId}</span>}
        </span>
        {node && node.source === 'approximate' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">参考: GTO近似</span>
        )}
        {node && node.source === 'approximate_with_ev' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">GTO近似 + 概算EV</span>
        )}
      </div>

      {/* A2: ポットオッズ / 必要勝率 / 自分のエクイティ (R8) */}
      {showPotOdds && (callAmount > 0 || equity != null || eqLoading) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs font-data">
          {callAmount > 0 && (
            <>
              <span className="text-zinc-400">ポットオッズ <span className="text-zinc-100 font-bold">{(effPot / callAmount).toFixed(1)} : 1</span></span>
              <span className="text-zinc-400">必要勝率 <span className="text-emerald-300 font-bold">{Math.round(reqEquity * 100)}%</span></span>
            </>
          )}
          <span className="text-zinc-400">
            あなたの勝率{' '}
            {eqLoading ? (
              <span className="text-zinc-500">計算中…</span>
            ) : equity != null ? (
              <span className={`font-bold ${callAmount > 0 && equity >= reqEquity ? 'text-emerald-300' : 'text-sky-300'}`}>
                {Math.round(equity * 100)}%
              </span>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </span>
          {callAmount > 0 && equity != null && (
            <span className={equity >= reqEquity ? 'text-emerald-400/80' : 'text-rose-400/80'}>
              {equity >= reqEquity ? '✓ オッズ足りる' : '✗ オッズ不足'}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <span className="text-xs text-brass-300/80 flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-brass-400/40 border-t-brass-300 animate-spin" />
          GTO解を求めています…
        </span>
      ) : !node || !strategy ? (
        <span className="text-xs text-zinc-500">このスポットは評価対象外です(未対応スポット)</span>
      ) : (
        <StrategyBars strategy={strategy} source={node.source} showEv={node.source !== 'approximate'} approxEv={node.source === 'approximate_with_ev'} />
      )}
    </div>
  )
}
