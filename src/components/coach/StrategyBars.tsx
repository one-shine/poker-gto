import type { ActionSolution, SolutionSource } from '../../types/solver'
import type { PlayerAction } from '../../types/game'
import { recommendedSolution, actionSizeLabel } from '../../lib/coach/recommendation'

// アクション別の色 (バー)。色のみ非依存のためラベル文字を必ず併記。
const BAR_CLS: Record<PlayerAction, string> = {
  fold: 'bg-zinc-500', check: 'bg-sky-500', call: 'bg-sky-500',
  raise: 'bg-emerald-500', allin: 'bg-brass-400',
}

interface Props {
  strategy: ActionSolution[]
  source: SolutionSource
  showEv: boolean
  chosen?: PlayerAction // 選択したアクションを強調
  approxEv?: boolean    // approximate_with_ev: EV はヒューリスティック (~ プレフィックス)
  // 推奨(最頻)アクションに ★ マーカーを付ける。⚠ 既定 false: 行動前に答えを漏らさない (U8)。
  // review / 答えを開いた後(revealed)の呼び出し元でのみ true。
  showRecommended?: boolean
}

// GTO 戦略の頻度バー (GTO Wizard 流)。各アクションを頻度幅のバー + % (+ EV) で表示。
export function StrategyBars({ strategy, showEv, chosen, approxEv, showRecommended }: Props) {
  const sorted = [...strategy].sort((a, b) => b.frequency - a.frequency)
  const recommended = showRecommended ? recommendedSolution(strategy) : null
  return (
    <ul className="flex flex-col gap-1">
      {sorted.map((s, i) => {
        const isChosen = s.action === chosen || (chosen === 'allin' && s.action === 'raise')
        const isRecommended = recommended != null && s.action === recommended.action && s.sizeBB === recommended.sizeBB
        return (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className={`w-20 shrink-0 text-right ${isChosen ? 'font-bold text-zinc-50' : 'text-zinc-300'}`}>
              {actionSizeLabel(s)}
            </span>
            <span className="relative flex-1 h-3.5 rounded-full bg-base-900/60 overflow-hidden">
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${BAR_CLS[s.action]} ${isChosen ? '' : 'opacity-70'}`}
                style={{ width: `${Math.max(s.frequency * 100, 2)}%` }}
              />
              {isChosen && <span className="absolute inset-0 ring-1 ring-inset ring-brass-300/70 rounded-full" />}
              {/* 推奨マーカーは絶対配置でバー幅を変えない(行間でバーの比較性を保つ)。★=色非依存の形状。 */}
              {isRecommended && (
                <span className="absolute inset-y-0 right-1.5 flex items-center text-[9px] font-bold text-zinc-50 drop-shadow" aria-label="推奨アクション">
                  ★推奨
                </span>
              )}
            </span>
            <span className="font-data w-9 text-right text-zinc-200 font-bold">{Math.round(s.frequency * 100)}%</span>
            {showEv && (
              <span className="font-data w-14 text-right text-zinc-400" title={approxEv ? '概算EV (戦略は手作り)。被覆スポット=フロップサブゲームモデル解、未被覆/4bet枝=ヒューリスティック(equity近似)' : undefined}>
                {approxEv ? '~' : ''}{s.ev > 0 ? '+' : ''}{s.ev.toFixed(2)}BB
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
