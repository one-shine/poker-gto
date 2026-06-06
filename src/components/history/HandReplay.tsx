import { useMemo, useState } from 'react'
import type { ActionRecord, PlayerAction, Street } from '../../types/game'
import type { HandSummary, MistakeRecord } from '../../types/stats'
import { HERO_ID } from '../../stores/gameStore'
import { useNavStore } from '../../stores/navStore'
import { CATEGORY_JP } from '../../data/mistakeLabels'
import { conceptsForMistake } from '../../data/theory/concepts'

const STREET_JP: Record<Street, string> = {
  preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー', showdown: 'ショーダウン',
}
const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

interface Props {
  actions: ActionRecord[]
  summary?: HandSummary       // U5: 勝敗/純損益
  mistakes?: MistakeRecord[]  // U5: このハンドのミス (理論/ドリルへ導線)
}

// ハンドのアクション列をストリート別に表示。ステップ実行で1手ずつ送る。
export function HandReplay({ actions, summary, mistakes }: Props) {
  const goTo = useNavStore(s => s.goTo)
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold text-zinc-300">
          ハンド <span className="font-data">#{actions[0]?.handId ?? '—'}</span>
          {heroPos && <span className="text-zinc-500"> (あなた: {heroPos})</span>}
        </span>
        <span className="flex items-center gap-2">
          {summary && (
            <span className={`inline-flex items-center gap-0.5 font-data text-xs font-bold ${
              summary.netBB > 0.05 ? 'text-emerald-300' : summary.netBB < -0.05 ? 'text-rose-300' : 'text-zinc-400'
            }`}>
              <span aria-hidden="true">{summary.netBB > 0.05 ? '▲' : summary.netBB < -0.05 ? '▼' : '＝'}</span>
              {summary.netBB > 0 ? '+' : ''}{summary.netBB.toFixed(1)}BB
              {summary.showdown && <span className="text-zinc-500 font-normal">·SD</span>}
            </span>
          )}
          <span className="font-data text-[11px] text-brass-200">ポット {fmt(potAtStreet)}BB</span>
        </span>
      </div>

      {/* U5: ミス → 該当理論 / ドリルへの導線 */}
      {mistakes && mistakes.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 space-y-1.5">
          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
            <span aria-hidden="true">⚠</span> このハンドのミス ({mistakes.length})
          </span>
          {mistakes.map((m, i) => {
            const concept = conceptsForMistake(m.category)[0]
            return (
              <div key={i} className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-zinc-200">{STREET_JP[m.street]} · {CATEGORY_JP[m.category]}</span>
                {concept && (
                  <button
                    type="button"
                    onClick={() => goTo('theory', { theoryConceptId: concept.id })}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-base-800 border border-white/10 text-zinc-200 hover:border-brass-400 hover:text-brass-200"
                  >
                    <span aria-hidden="true">📖</span>理論
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => goTo('learn', { drillCategory: m.category })}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-base-800 border border-white/10 text-zinc-200 hover:border-brass-400 hover:text-brass-200"
                >
                  <span aria-hidden="true">🎯</span>ドリル
                </button>
              </div>
            )
          })}
        </div>
      )}

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
