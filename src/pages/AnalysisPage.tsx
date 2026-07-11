import { useMemo, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useNavStore } from '../stores/navStore'
import { CATEGORY_JP } from '../data/mistakeLabels'
import { aggregateRecentWeaknesses, aggregateAllTimeWeaknesses, WEAKNESS_WINDOW_DAYS, WEAKNESS_WINDOW_MAX, type WeaknessAgg } from '../lib/analysis/weaknessWindow'
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

function Weaknesses() {
  const mistakes = useSessionStore(s => s.mistakes)
  const goTo = useNavStore(s => s.goTo)

  // 主表示は直近ウィンドウ (克服済みが永久に居座らない)。全期間は補助で残す。
  const recent = useMemo(() => aggregateRecentWeaknesses(mistakes), [mistakes])
  const allTime = useMemo(() => aggregateAllTimeWeaknesses(mistakes), [mistakes])
  const top3 = recent.slice(0, 3)

  if (mistakes.length === 0) {
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
      {top3.length > 0 ? (
        <>
          <p className="text-xs text-zinc-400">
            直近{WEAKNESS_WINDOW_DAYS}日(最大{WEAKNESS_WINDOW_MAX}件)で繰り返しているミスの上位です。克服したミスは自然に薄れます。各カードから関連理論を開けます。
          </p>
          <div className="space-y-3">
            {top3.map((a, i) => (
              <WeaknessCard key={a.category} category={a.category} count={a.count} evLost={a.evLost} rank={i + 1} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          <p className="font-bold mb-1 flex items-center gap-1.5">
            <span aria-hidden="true">✓</span>直近{WEAKNESS_WINDOW_DAYS}日は繰り返しミスがありません
          </p>
          <p className="text-emerald-200/80 leading-relaxed">最近のプレイは安定しています。下は全期間の傾向(参考)です。</p>
        </div>
      )}

      {allTime.length > 0 && <AllTimeSummary rows={allTime.slice(0, 5)} />}
    </div>
  )
}

// 全期間のミス傾向 (補助表示)。主表示は直近ウィンドウ、こちらは通算の参考。
function AllTimeSummary({ rows }: { rows: WeaknessAgg[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-base-800/60 p-4">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">全期間の傾向(参考)</h3>
      <ul className="space-y-1">
        {rows.map(r => (
          <li key={r.category} className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">{CATEGORY_JP[r.category]}</span>
            <span className="font-data text-zinc-500 font-bold">{r.count}回</span>
          </li>
        ))}
      </ul>
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
