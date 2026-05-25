import type { ActionSolution, SolutionSource } from '../../types/solver'
import type { PlayerAction } from '../../types/game'

const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}
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
}

// GTO 戦略の頻度バー (GTO Wizard 流)。各アクションを頻度幅のバー + % (+ EV) で表示。
export function StrategyBars({ strategy, showEv, chosen }: Props) {
  const sorted = [...strategy].sort((a, b) => b.frequency - a.frequency)
  return (
    <ul className="flex flex-col gap-1">
      {sorted.map((s, i) => {
        const isChosen = s.action === chosen || (chosen === 'allin' && s.action === 'raise')
        return (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className={`w-16 shrink-0 text-right ${isChosen ? 'font-bold text-zinc-50' : 'text-zinc-300'}`}>
              {ACTION_JP[s.action]}{s.sizeBB ? ` ${s.sizeBB}` : ''}
            </span>
            <span className="relative flex-1 h-3.5 rounded-full bg-base-900/60 overflow-hidden">
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${BAR_CLS[s.action]} ${isChosen ? '' : 'opacity-70'}`}
                style={{ width: `${Math.max(s.frequency * 100, 2)}%` }}
              />
              {isChosen && <span className="absolute inset-0 ring-1 ring-inset ring-brass-300/70 rounded-full" />}
            </span>
            <span className="font-data w-9 text-right text-zinc-200 font-bold">{Math.round(s.frequency * 100)}%</span>
            {showEv && (
              <span className="font-data w-14 text-right text-zinc-400">
                {s.ev > 0 ? '+' : ''}{s.ev.toFixed(2)}BB
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
