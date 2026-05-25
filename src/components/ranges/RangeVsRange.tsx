import { useState } from 'react'
import type { RangeScenario } from '../../types/ranges'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { RangeGrid } from './RangeGrid'

const TOTAL_COMBOS = 1326 // C(52,2)

function combosForHand(hand: string): number {
  if (hand.length === 2) return 6 // ペア
  return hand.endsWith('s') ? 4 : 12 // スーテッド / オフスート
}

interface RangeStats {
  combos: number
  raiseCombos: number
  callCombos: number
  pair: number
  suited: number
  offsuit: number
  widthPct: number
}

// レンジを「コンボ数」基準で集計する(169ハンドでなく実コンボ重みで見る)。
function rangeStats(scenario: RangeScenario): RangeStats {
  let combos = 0, raiseCombos = 0, callCombos = 0, pair = 0, suited = 0, offsuit = 0
  for (const [hand, cell] of Object.entries(scenario.cells)) {
    const cc = combosForHand(hand)
    const inRange = cell.raise + cell.call
    if (inRange <= 0) continue
    const w = cc * inRange
    combos += w
    raiseCombos += cc * cell.raise
    callCombos += cc * cell.call
    if (hand.length === 2) pair += w
    else if (hand.endsWith('s')) suited += w
    else offsuit += w
  }
  return { combos, raiseCombos, callCombos, pair, suited, offsuit, widthPct: combos / TOTAL_COMBOS }
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-zinc-400">{label}</span>
      <div className="flex-1 h-3 rounded bg-base-900 overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-20 shrink-0 text-right font-data text-zinc-300">
        {Math.round(value)}c ({Math.round(pct)}%)
      </span>
    </div>
  )
}

function RangeColumn({ scenario }: { scenario: RangeScenario }) {
  const s = rangeStats(scenario)
  return (
    <div className="space-y-3">
      <RangeGrid scenario={scenario} />
      <div className="rounded-xl border border-white/10 bg-base-800/60 p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">レンジ幅</span>
          <span className="font-data font-bold text-brass-200">
            {Math.round(s.combos)} コンボ / {(s.widthPct * 100).toFixed(1)}%
          </span>
        </div>
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">構成</span>
          <Bar label="ペア" value={s.pair} total={s.combos} color="#a855f7" />
          <Bar label="スーテッド" value={s.suited} total={s.combos} color="#14b8a6" />
          <Bar label="オフスート" value={s.offsuit} total={s.combos} color="#64748b" />
        </div>
      </div>
    </div>
  )
}

function Picker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex-1 text-xs text-zinc-400">
      {label}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full min-h-10 px-3 rounded-lg bg-base-800 border border-white/10 text-sm text-zinc-100 focus:border-brass-500/50 focus:outline-none"
      >
        {PREFLOP_SCENARIOS.map(s => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </label>
  )
}

// 2レンジを並べて、幅と構成を比較する(GTO Wizard 流の概念理解)。
// ボード上のエクイティ分布(誰が強い手を多く持つか)は Phase 5 のエクイティ計算で追加。
export function RangeVsRange() {
  const [idA, setIdA] = useState(PREFLOP_SCENARIOS[0].id)
  const [idB, setIdB] = useState(PREFLOP_SCENARIOS[PREFLOP_SCENARIOS.length - 1].id)
  const a = PREFLOP_SCENARIOS.find(s => s.id === idA)!
  const b = PREFLOP_SCENARIOS.find(s => s.id === idB)!
  const sa = rangeStats(a)
  const sb = rangeStats(b)

  const wider = sa.combos > sb.combos ? a : b
  const widthDiff = Math.abs(sa.widthPct - sb.widthPct) * 100

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Picker label="レンジ A" value={idA} onChange={setIdA} />
        <Picker label="レンジ B" value={idB} onChange={setIdB} />
      </div>

      <div className="rounded-xl border border-brass-500/20 bg-base-800/40 p-3 text-sm text-zinc-300">
        <span className="font-bold text-brass-200">{wider.label}</span> の方が広く、
        差は約 <span className="font-data font-bold">{widthDiff.toFixed(1)} pt</span> です。
        広いレンジは平均的に弱く、相手のレンジ優位を許しやすい点に注意。
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-display font-bold text-zinc-200 mb-2">A: {a.label}</h3>
          <RangeColumn scenario={a} />
        </div>
        <div>
          <h3 className="text-sm font-display font-bold text-zinc-200 mb-2">B: {b.label}</h3>
          <RangeColumn scenario={b} />
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 leading-snug border-t border-white/10 pt-3">
        ※ 構成はコンボ数(ペア6・スーテッド4・オフスート12)を頻度で重み付けした近似です。
        ボード上のエクイティ分布(レンジ優位・ナッツ優位)は Phase 5 のエクイティ計算で追加予定です。
      </p>
    </div>
  )
}
