import { useMemo, useState } from 'react'
import type { ActionRecord, PlayerAction, Street } from '../../types/game'
import { HERO_ID } from '../../stores/gameStore'

const STREET_JP: Record<Street, string> = {
  preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー', showdown: 'ショーダウン',
}
const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

interface Props {
  actions: ActionRecord[]
}

// ハンドのアクション列をストリート別に表示。ステップ実行で1手ずつ送る。
export function HandReplay({ actions }: Props) {
  const streets = useMemo(() => {
    const order: Street[] = ['preflop', 'flop', 'turn', 'river']
    return order.filter(st => actions.some(a => a.street === st))
  }, [actions])

  const [street, setStreet] = useState<Street>(streets[0] ?? 'preflop')
  const streetActions = actions.filter(a => a.street === street)
  const [step, setStep] = useState(streetActions.length)

  const heroPos = actions[0]?.heroPosition
  const potAtStreet = streetActions[0]?.potBB ?? 0

  return (
    <div className="rounded-xl bg-base-900/60 border border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-300">
          ハンド <span className="font-data">#{actions[0]?.handId ?? '—'}</span>
          {heroPos && <span className="text-zinc-500"> (あなた: {heroPos})</span>}
        </span>
        <span className="font-data text-[11px] text-brass-200">ポット {fmt(potAtStreet)}BB</span>
      </div>

      {/* ストリートタブ */}
      <div className="flex gap-1">
        {streets.map(st => (
          <button
            key={st}
            type="button"
            onClick={() => { setStreet(st); setStep(actions.filter(a => a.street === st).length) }}
            aria-pressed={st === street}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              st === street ? 'brass' : 'bg-base-800 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {STREET_JP[st]}
          </button>
        ))}
      </div>

      {/* アクション列 */}
      <ul className="space-y-1 min-h-20">
        {streetActions.slice(0, step).map((a, i) => {
          const isHero = a.playerId === HERO_ID
          const who = isHero ? 'あなた' : a.actorPosition ?? a.playerId
          return (
            <li key={i} className={`text-sm flex items-center gap-2 ${isHero ? 'text-brass-200 font-semibold' : 'text-zinc-300'}`}>
              <span className="w-12 shrink-0 text-xs text-zinc-500">{who}</span>
              <span>{ACTION_JP[a.action]}{a.amountBB > 0 ? ` ${fmt(a.amountBB)}BB` : ''}</span>
            </li>
          )
        })}
      </ul>

      {/* ステップ実行 */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          className="min-h-9 px-3 rounded-lg bg-base-800 text-zinc-300 disabled:opacity-30 text-sm">⏮ 戻る</button>
        <button type="button" onClick={() => setStep(s => Math.min(streetActions.length, s + 1))} disabled={step >= streetActions.length}
          className="min-h-9 px-3 rounded-lg bg-base-800 text-zinc-300 disabled:opacity-30 text-sm">送る ⏭</button>
        <span className="font-data text-[11px] text-zinc-500 ml-auto">{step}/{streetActions.length}</span>
      </div>
    </div>
  )
}
