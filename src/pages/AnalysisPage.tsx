import { useState } from 'react'
import type { MistakeCategory } from '../types/stats'
import { useSessionStore } from '../stores/sessionStore'
import { useNavStore } from '../stores/navStore'
import { WeaknessCard } from '../components/analysis/WeaknessCard'
import { PositionStatsTable } from '../components/analysis/PositionStatsTable'

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

interface Agg { category: MistakeCategory; count: number; evLost: number }

function Weaknesses() {
  const mistakes = useSessionStore(s => s.mistakes)
  const goTo = useNavStore(s => s.goTo)

  const byCat = new Map<MistakeCategory, Agg>()
  for (const m of mistakes) {
    const a = byCat.get(m.category) ?? { category: m.category, count: 0, evLost: 0 }
    a.count++
    a.evLost += m.evLoss
    byCat.set(m.category, a)
  }
  const top3 = [...byCat.values()].sort((a, b) => b.count - a.count).slice(0, 3)

  if (top3.length === 0) {
    // D4: 静的な「Gameでプレイ」だけでなく、推奨パスとドリルCTAを提示する。
    return (
      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-4 space-y-3">
        <p className="text-sm text-zinc-300 leading-relaxed">
          まだミスの記録がありません。Game でプレイすると、繰り返しやすい弱点をここで分析します。
        </p>
        <div className="text-sm text-zinc-400 leading-relaxed">
          <p className="font-bold text-brass-200 mb-1">おすすめの始め方</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>まず基礎ドリルで主要スポットの感覚をつかむ</li>
            <li>理論でポジション・レンジの考え方を読む</li>
            <li>ゲームで実践 → ここに弱点が集まる</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => goTo('learn', { drillCategory: 'preflop_too_wide' })}
            className="inline-flex items-center gap-1.5 min-h-10 px-4 rounded-xl text-sm font-bold bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 transition-colors"
          >
            ドリルで練習する ▸
          </button>
          <button
            type="button"
            onClick={() => goTo('theory')}
            className="inline-flex items-center gap-1.5 min-h-10 px-4 rounded-xl text-sm font-bold bg-brass-500/15 text-brass-200 hover:bg-brass-500/25 transition-colors"
          >
            理論を読む ▸
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400">
        繰り返しやすいミスの上位です。各カードから関連理論を開いて、原因と対策を確認しましょう。
      </p>
      <div className="space-y-3">
        {top3.map((a, i) => (
          <WeaknessCard key={a.category} category={a.category} count={a.count} evLost={a.evLost} rank={i + 1} />
        ))}
      </div>
    </div>
  )
}

function PositionStats() {
  const handHistory = useSessionStore(s => s.handHistory)
  const mistakes = useSessionStore(s => s.mistakes)
  return <PositionStatsTable handHistory={handHistory} mistakes={mistakes} />
}

export function AnalysisPage() {
  const [tab, setTab] = useState<'weakness' | 'position'>('weakness')
  return (
    <div className="h-full overflow-auto p-4 sm:p-6 md:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-2xl font-extrabold text-zinc-50">分析</h1>
        <div className="flex gap-2">
          <Tab active={tab === 'weakness'} onClick={() => setTab('weakness')}>弱点分析</Tab>
          <Tab active={tab === 'position'} onClick={() => setTab('position')}>ポジション統計</Tab>
        </div>
        {tab === 'weakness' ? <Weaknesses /> : <PositionStats />}
      </div>
    </div>
  )
}
