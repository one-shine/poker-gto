import { useEffect, useMemo, useState } from 'react'
import type { PlayerAction } from '../../types/game'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import { getTotalPot } from '../../engine/game/BettingEngine'
import { HERO_ID } from '../../stores/gameStore'

interface ActionPanelProps {
  pending: ActionRequiredPayload
  onAction: (action: PlayerAction, amount?: number) => void
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const round2 = (n: number) => Math.round(n * 2) / 2
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

interface Preset {
  label: string
  toAmount: number
}

// プリフロップ = BB単位の絶対サイズ + Pot + All-in。ポストフロップ = ポット%。
function buildPresets(
  isPreflop: boolean,
  callLevel: number,
  callAmount: number,
  effPot: number,
  min: number,
  max: number,
): Preset[] {
  const presets: Preset[] = []
  if (isPreflop) {
    for (const bb of [2, 2.5, 3]) presets.push({ label: `${bb}BB`, toAmount: bb })
    presets.push({ label: 'Pot', toAmount: callLevel + effPot })
  } else {
    const pcts: [string, number][] = [
      ['33%', 33], ['50%', 50], ['66%', 66], ['75%', 75], ['Pot', 100], ['Overbet', 150],
    ]
    for (const [label, pct] of pcts) {
      // bet: ポット%。raise: コール後ポットに対する%上乗せ。
      const toAmount = callAmount === 0
        ? effPot * (pct / 100)
        : callLevel + (effPot + callAmount) * (pct / 100)
      presets.push({ label, toAmount })
    }
  }
  return presets
    .map(p => ({ ...p, toAmount: round2(p.toAmount) }))
    .filter(p => p.toAmount >= min && p.toAmount <= max)
}

export function ActionPanel({ pending, onAction }: ActionPanelProps) {
  const { state, validActions, callAmount, minRaiseToAmount } = pending
  const hero = state.players.find(p => p.id === HERO_ID)!

  const isPreflop = state.street === 'preflop'
  const callLevel = hero.currentBetBB + callAmount // コールに必要な到達額
  const maxRaiseTo = hero.currentBetBB + hero.stackBB // オールイン到達額
  const min = Math.min(minRaiseToAmount, maxRaiseTo)
  const effPot = getTotalPot(state) + state.players.reduce((s, p) => s + p.currentBetBB, 0)

  const canRaise = validActions.includes('raise') && maxRaiseTo > callLevel
  const canAllIn = validActions.includes('allin') || validActions.includes('raise')

  const presets = useMemo(
    () => buildPresets(isPreflop, callLevel, callAmount, effPot, min, maxRaiseTo),
    [isPreflop, callLevel, callAmount, effPot, min, maxRaiseTo],
  )

  const [amount, setAmount] = useState(min)
  // 新しい手番ごとにスライダーを最小レイズ額へリセット (レンダー中に検知=effect不要)
  const [prevPending, setPrevPending] = useState(pending)
  if (pending !== prevPending) {
    setPrevPending(pending)
    setAmount(min)
  }

  const raiseLabel = callAmount === 0 ? 'ベット' : 'レイズ'
  const submitRaise = () => onAction('raise', clamp(amount, min, maxRaiseTo))

  // キーボード: f=フォールド c=チェック/コール r=ベット/レイズ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key.toLowerCase()
      if (k === 'f' && validActions.includes('fold')) onAction('fold')
      else if (k === 'c' && callAmount === 0) onAction('check')
      else if (k === 'c' && validActions.includes('call')) onAction('call')
      else if ((k === 'r' || k === 'enter') && canRaise) submitRaise()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const btn = 'min-h-12 px-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all active:translate-y-px shadow-md flex items-center justify-center gap-1.5'

  return (
    <div className="flex flex-col gap-2.5 p-3.5 bg-base-800/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      <div className="flex gap-2">
        {validActions.includes('fold') && (
          <button className={`${btn} bg-gradient-to-b from-[#a5352e] to-[#7e2620] hover:brightness-110 text-rose-50 flex-1`}
            onClick={() => onAction('fold')} aria-label="フォールド (f)">
            <span aria-hidden="true">✕</span> フォールド
          </button>
        )}
        {callAmount === 0 ? (
          <button className={`${btn} bg-gradient-to-b from-[#2c6e8a] to-[#1f5266] hover:brightness-110 text-sky-50 flex-1`}
            onClick={() => onAction('check')} aria-label="チェック (c)">
            <span aria-hidden="true">〃</span> チェック
          </button>
        ) : (
          <button className={`${btn} bg-gradient-to-b from-[#2c6e8a] to-[#1f5266] hover:brightness-110 text-sky-50 flex-1`}
            onClick={() => onAction('call')} aria-label={`コール ${fmt(callAmount)}BB (c)`}>
            <span aria-hidden="true">✓</span> コール <span className="font-data">{fmt(callAmount)}BB</span>
          </button>
        )}
        {canRaise && (
          <button className={`${btn} bg-gradient-to-b from-[#2f8a5f] to-[#1f5c43] hover:brightness-110 text-emerald-50 flex-1`}
            onClick={submitRaise} aria-label={`${raiseLabel} ${fmt(amount)}BB (r)`}>
            <span aria-hidden="true">▲</span> {raiseLabel} <span className="font-data">{fmt(amount)}BB</span>
          </button>
        )}
      </div>

      {canRaise && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button key={p.label}
                className={`min-h-11 px-3 rounded-lg text-xs font-bold border transition-all ${
                  amount === p.toAmount
                    ? 'brass border-brass-300 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
                    : 'bg-base-700 border-white/10 text-zinc-300 hover:bg-base-700/60 hover:border-brass-500/40'
                }`}
                onClick={() => setAmount(p.toAmount)} aria-label={`${p.label} (${fmt(p.toAmount)}BB)`}>
                {p.label}
              </button>
            ))}
            {canAllIn && (
              <button className="min-h-11 px-3 rounded-lg text-xs font-extrabold bg-gradient-to-b from-[#a5352e] to-[#7e2620] hover:brightness-110 text-rose-50 border border-rose-400/40 flex items-center gap-1"
                onClick={() => onAction('allin', maxRaiseTo)} aria-label="オールイン">
                <span aria-hidden="true">★</span> All-in
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 px-1">
            <input type="range" min={min} max={maxRaiseTo} step={0.5} value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none bg-base-700 accent-brass-400 cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brass-400
                [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(212,175,55,0.6)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-brass-600"
              aria-label="ベット額スライダー" />
            <span className="font-data text-sm text-brass-200 font-bold w-16 text-right">{fmt(amount)}BB</span>
          </div>
        </>
      )}
    </div>
  )
}
