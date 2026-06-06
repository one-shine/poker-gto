import { useState } from 'react'
import { RangeGrid, type HeatmapMode } from '../components/ranges/RangeGrid'
import { RangeVsRange } from '../components/ranges/RangeVsRange'
import { PREFLOP_SCENARIOS, scenariosOfKind, SCENARIO_KIND_LABEL, type ScenarioKind } from '../data/ranges/preflop'

const KINDS: ScenarioKind[] = ['open', 'defense', '3bet']

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-4 min-h-10 rounded-lg text-sm font-bold transition-colors ${
        active ? 'brass' : 'bg-base-800 text-zinc-400 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function SingleRange() {
  const [kind, setKind] = useState<ScenarioKind>('open')
  const [selectedId, setSelectedId] = useState(PREFLOP_SCENARIOS[0].id)
  const [heatmap, setHeatmap] = useState<HeatmapMode>('off')
  const scenario = PREFLOP_SCENARIOS.find(s => s.id === selectedId)!
  const list = scenariosOfKind(kind)
  const hasCall = Object.values(scenario.cells).some(c => c.call > 0)

  // call が無いスポットでは 'コール頻度' を出さない。切替時に矛盾したら 'off' へ。
  const selectScenario = (id: string) => {
    setSelectedId(id)
    const sc = PREFLOP_SCENARIOS.find(s => s.id === id)!
    if (heatmap === 'call' && !Object.values(sc.cells).some(c => c.call > 0)) setHeatmap('off')
  }
  // 種別タブ: 現選択がその種別に無ければ先頭シナリオへ。
  const pickKind = (k: ScenarioKind) => {
    setKind(k)
    const next = scenariosOfKind(k)
    if (!next.some(s => s.id === selectedId)) selectScenario(next[0].id)
  }

  const heatOptions: [HeatmapMode, string][] = [
    ['off', '通常'], ['raise', 'レイズ頻度'], ...(hasCall ? [['call', 'コール頻度'] as [HeatmapMode, string]] : []),
  ]

  const openCount = Object.values(scenario.cells).filter(c => c.raise > 0 || c.call > 0).length
  const raiseCount = Object.values(scenario.cells).filter(c => c.raise > 0).length
  const callCount  = Object.values(scenario.cells).filter(c => c.call > 0).length

  return (
    <div className="space-y-5">
        {/* Header */}
        <div>
          <p className="text-sm text-zinc-400">
            100BB・6-max テーブル。セル内の塗り分けが各行動の頻度比 (混合戦略) です。
            セルにカーソルで詳細頻度を表示。
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            GTO近似レンジ (一般理論ベースの手作り・source: approximate)
          </p>
        </div>

        {/* Scenario selector — 第1段: 種別 / 第2段: シナリオ (U12) */}
        <div className="space-y-2">
          <div className="flex gap-2">
            {KINDS.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                aria-pressed={kind === k}
                className={`px-4 min-h-10 rounded-lg text-sm font-bold transition-colors ${
                  kind === k ? 'brass' : 'bg-base-800 text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {SCENARIO_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {list.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectScenario(s.id)}
                aria-pressed={selectedId === s.id}
                className={`px-3 min-h-9 rounded text-sm font-medium transition-colors ${
                  selectedId === s.id
                    ? 'bg-white text-zinc-900'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scenario info */}
        <div className="flex items-center gap-6 text-sm">
          <span className="text-zinc-400">
            ポジション: <span className="text-white font-semibold">{scenario.position}</span>
          </span>
          <span className="text-zinc-400">
            レイズサイズ: <span className="text-white font-semibold">{scenario.raiseSize}BB</span>
          </span>
          <span className="text-zinc-400">
            アクティブハンド: <span className="text-white font-semibold">{openCount}</span>/169
          </span>
          {callCount > 0 && (
            <>
              <span className="text-zinc-400">
                {scenario.id.endsWith('-3bet') ? '4-Bet' : '3-Bet'}: <span className="text-green-400 font-semibold">{raiseCount}</span>
              </span>
              <span className="text-zinc-400">
                コール: <span className="text-blue-400 font-semibold">{callCount}</span>
              </span>
            </>
          )}
        </div>

        {/* 表示モード切替 (U6: 通常 / 頻度ヒートマップ) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500">表示:</span>
          {heatOptions.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setHeatmap(mode)}
              aria-pressed={heatmap === mode}
              className={`px-3 min-h-9 rounded-lg text-xs font-bold transition-colors ${
                heatmap === mode ? 'brass' : 'bg-base-800 text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <RangeGrid scenario={scenario} heatmap={heatmap} />

        {/* GTO disclaimer (CLAUDE.md ルール1: 「GTO最適」断定は不可。手作り近似は approximate と明示) */}
        <p className="text-xs text-zinc-600 border-t border-zinc-800 pt-4">
          ※ 表示中のレンジは一般理論ベースの GTO 近似 (手作り・source: approximate) です。
          100BB の厳密な Nash 解はサーバ規模の事前計算が前提のため別軸の課題で、現状は近似で提供しています
          (「GTO最適」とは断定しません)。push/fold(≤25BB)のドリルは自社ソルバーの厳密解です。
        </p>
    </div>
  )
}

export function RangesPage() {
  const [tab, setTab] = useState<'single' | 'compare'>('single')
  return (
    <div className="h-full overflow-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <h1 className="text-2xl font-extrabold text-zinc-50">GTOプリフロップレンジ</h1>
        <div className="flex gap-2">
          <Tab active={tab === 'single'} onClick={() => setTab('single')}>レンジ表</Tab>
          <Tab active={tab === 'compare'} onClick={() => setTab('compare')}>レンジ比較</Tab>
        </div>
        {tab === 'single' ? <SingleRange /> : <RangeVsRange />}
      </div>
    </div>
  )
}
