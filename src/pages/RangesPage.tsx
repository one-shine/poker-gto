import { useState } from 'react'
import { RangeGrid } from '../components/ranges/RangeGrid'
import { RangeVsRange } from '../components/ranges/RangeVsRange'
import { PREFLOP_SCENARIOS } from '../data/ranges/preflop'

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
  const [selectedId, setSelectedId] = useState(PREFLOP_SCENARIOS[0].id)
  const scenario = PREFLOP_SCENARIOS.find(s => s.id === selectedId)!

  const openCount = Object.values(scenario.cells).filter(c => c.raise > 0 || c.call > 0).length
  const raiseCount = Object.values(scenario.cells).filter(c => c.raise > 0).length
  const callCount  = Object.values(scenario.cells).filter(c => c.call > 0).length

  return (
    <div className="space-y-6">
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

        {/* Scenario selector */}
        <div className="flex gap-2 flex-wrap">
          {PREFLOP_SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                selectedId === s.id
                  ? 'bg-white text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {s.label}
            </button>
          ))}
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

        {/* Grid */}
        <RangeGrid scenario={scenario} />

        {/* GTO disclaimer (CLAUDE.md ルール1: 「GTO最適」断定は不可。手作り近似は approximate と明示) */}
        <p className="text-xs text-zinc-600 border-t border-zinc-800 pt-4">
          ※ 表示中のレンジは GTO近似レンジ (一般理論ベースの手作り・source: approximate) です。
          自社ソルバー解 (solver_precomputed) への置換は Phase 3.5 以降で順次進めます。
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
