import { useState } from 'react'
import type { MistakeCategory } from '../types/stats'
import type { SkillLevel } from '../types/game'
import type { PageId } from '../components/layout/navItems'
import { XP_THRESHOLDS } from '../types/stats'
import { CATEGORY_JP } from '../data/mistakeLabels'
import { useProgressStore } from '../stores/progressStore'
import { useSessionStore } from '../stores/sessionStore'
import { useNavStore } from '../stores/navStore'
import { SampleSizeBadge } from '../components/stats/SampleSizeBadge'
import { HandReplay } from '../components/history/HandReplay'
import { DrillPanel } from '../components/drill/DrillPanel'
import { PushFoldDrillPanel } from '../components/drill/PushFoldDrillPanel'
import { PostflopDrillPanel } from '../components/drill/PostflopDrillPanel'

// D3/D4: 初回ユーザーに理論↔ドリル↔分析のループを可視化する学習パス。
// 各ステップは該当ページへディープリンクし、孤立しがちな学習資産を結ぶ。
const PATH_STEPS: { page: PageId; label: string; desc: string }[] = [
  { page: 'game', label: 'ゲーム', desc: 'ハンドを回してコーチの「なぜ」を受ける' },
  { page: 'analysis', label: '分析', desc: '繰り返しやすい弱点を確認する' },
  { page: 'theory', label: '理論', desc: '弱点に紐づく概念・用語を読む' },
  { page: 'learn', label: 'ドリル', desc: '弱点スポットを反復練習する' },
]

function LearningPath() {
  const goTo = useNavStore(s => s.goTo)
  return (
    <div className="rounded-2xl border border-brass-500/30 bg-base-800/60 p-4">
      <h3 className="text-xs font-bold text-brass-300 uppercase tracking-wider mb-1">学習パス</h3>
      <p className="text-[11px] text-zinc-400 mb-3 leading-snug">
        ゲーム → 分析 → 理論 → ドリル を往復すると、同じミスが減っていきます。各ステップをタップで移動できます。
      </p>
      <ol className="flex flex-col gap-1.5">
        {PATH_STEPS.map((s, i) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => goTo(s.page)}
              className="w-full flex items-start gap-2.5 text-left min-h-11 px-2.5 py-1.5 rounded-xl border border-white/10 bg-base-900/40 hover:border-brass-500/40 transition-colors"
            >
              <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-brass-500/20 text-brass-200 font-data text-[11px] font-bold">
                {i + 1}
              </span>
              <span className="text-sm">
                <span className="font-bold text-zinc-100">{s.label}</span>
                <span className="text-zinc-400"> — {s.desc}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

const LEVEL_JP: Record<SkillLevel, string> = {
  beginner: 'ビギナー', intermediate: 'インターミディエイト', advanced: 'アドバンス', pro: 'プロ',
}
const LEVEL_ORDER: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'pro']

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

function Dashboard() {
  const progress = useProgressStore(s => s.progress)
  const accuracy = useSessionStore(s => s.gtoAccuracy())
  const evaluated = useSessionStore(s => s.evaluatedCount)
  const sessionHandCount = useSessionStore(s => s.sessionHandCount)

  // 初回判定: ほぼプレイしておらず、まだミス記録もない (= 学習ループ未体験) 状態。
  const hasMistakes = Object.values(progress.mistakesByCategory).some(n => n > 0)
  const isNew = sessionHandCount < 5 && !hasMistakes

  const idx = LEVEL_ORDER.indexOf(progress.level)
  const nextLevel = LEVEL_ORDER[idx + 1]
  const curT = XP_THRESHOLDS[progress.level]
  const nextT = nextLevel ? XP_THRESHOLDS[nextLevel] : curT
  const pct = nextLevel ? Math.min(100, ((progress.xp - curT) / (nextT - curT)) * 100) : 100

  const topMistakes = (Object.entries(progress.mistakesByCategory) as [MistakeCategory, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div className="space-y-5">
      {/* D3: 初回ユーザーには学習ループを最上部に提示 (発見性) */}
      {isNew && <LearningPath />}

      {/* XP / レベル */}
      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display font-extrabold text-lg text-brass-200">{LEVEL_JP[progress.level]}</span>
          <span className="font-data text-sm text-zinc-300">{progress.xp} XP</span>
        </div>
        <div className="h-2.5 rounded-full bg-base-900 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          {nextLevel ? `次のレベル (${LEVEL_JP[nextLevel]}) まで ${Math.max(0, nextT - progress.xp)} XP` : '最高レベル到達'}
        </p>
      </div>

      {/* 主要スタッツ */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-base-800/60 p-4">
          <div className="text-xs text-zinc-400 mb-1 flex items-center gap-2">
            GTO精度 <SampleSizeBadge n={evaluated} />
          </div>
          <div className="font-data text-2xl font-bold text-emerald-300">
            {accuracy == null ? '—' : `${Math.round(accuracy * 100)}%`}
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
            {accuracy == null
              ? '戦略を見ずに判断すると測定されます(play / スタディの戦略OFF)'
              : '戦略を見たハンドは除外されます'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-base-800/60 p-4">
          <div className="text-xs text-zinc-400 mb-1">プレイ済みハンド</div>
          <div className="font-data text-2xl font-bold text-zinc-100">{progress.handsPlayed}</div>
        </div>
      </div>

      {/* ミス傾向 TOP3 */}
      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-4">
        <h3 className="text-xs font-bold text-brass-300 uppercase tracking-wider mb-2">ミス傾向 TOP3</h3>
        {topMistakes.length === 0 ? (
          <p className="text-sm text-zinc-500">
            まだミスの記録がありません。<span className="text-zinc-400">ゲームを回すか、下のドリルで基礎から練習できます。</span>
          </p>
        ) : (
          <ul className="space-y-1.5">
            {topMistakes.map(([cat, n]) => (
              <li key={cat} className="flex items-center justify-between text-sm">
                <span className="text-zinc-200">{CATEGORY_JP[cat]}</span>
                <span className="font-data text-rose-300 font-bold">{n}回</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function History({ onGoToDrill }: { onGoToDrill: () => void }) {
  const handHistory = useSessionStore(s => s.handHistory)
  const [selected, setSelected] = useState<number | null>(null)
  const recent = handHistory.map((h, i) => ({ h, i })).reverse().slice(0, 20)

  if (handHistory.length === 0) {
    // D4: 静的な「Gameでプレイ」だけでなく、ドリルへの代替CTAも提示する。
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">まだハンド履歴がありません。Game でプレイすると、ここに記録され振り返れます。</p>
        <button
          type="button"
          onClick={onGoToDrill}
          className="inline-flex items-center gap-1.5 min-h-10 px-4 rounded-xl text-sm font-bold bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 transition-colors"
        >
          ドリルで練習する ▸
        </button>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <ul className="space-y-1.5">
        {recent.map(({ h, i }) => {
          const heroPos = h[0]?.heroPosition ?? '—'
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={selected === i}
                className={`w-full text-left px-3 min-h-11 rounded-xl border text-sm transition-colors ${
                  selected === i ? 'border-brass-400 bg-brass-400/10' : 'border-white/10 bg-base-800/60 hover:border-brass-500/40'
                }`}
              >
                <span className="font-data text-zinc-400">#{i + 1}</span>
                <span className="text-zinc-200 ml-2">あなた: {heroPos}</span>
                <span className="text-zinc-500 ml-2 text-xs">{h.length}アクション</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div>
        {selected != null && handHistory[selected]
          ? <HandReplay actions={handHistory[selected]} />
          : <p className="text-sm text-zinc-500 p-3">ハンドを選ぶとリプレイを表示します。</p>}
      </div>
    </div>
  )
}

// C5: ドリルの趣旨と正解判定(頻度10%以上)の初回説明。折りたたみでノイズを抑える。
function DrillIntro() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/10 bg-base-800/60">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 min-h-11 px-3.5 text-left text-sm font-bold text-brass-200"
      >
        <span>ドリルとは / 正解判定について</span>
        <span aria-hidden="true" className="text-zinc-400 text-xs">{open ? '閉じる ▲' : '開く ▼'}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 text-sm text-zinc-300 leading-relaxed space-y-2 border-t border-white/5 pt-3">
          <p>ドリルは、ランダムなスポット(状況)に対して最適なアクションを答える反復練習です。実戦のゲームと違い、苦手スポットを集中的に繰り返せます。</p>
          <p>
            <strong className="text-zinc-100">正解判定はミックス戦略に対応</strong>しています。GTOでは1つの手に複数のアクションを混ぜることが多いため、<strong className="text-zinc-100">推奨頻度が10%以上</strong>あるアクションはすべて正解として扱います(単一の「唯一の正解」を強制しません)。
          </p>
          <p className="text-zinc-400 text-[13px]">
            プリフロップ/プッシュ・フォールドは事前計算解、ポストフロップは局面ごとの簡易求解です。各設問のバッジで出典(信頼度)を確認できます。
          </p>
        </div>
      )}
    </div>
  )
}

// ドリルタブ: プリフロップ(近似) / ポストフロップ(自前CFR) / プッシュフォールド(厳密解) の切替。
function DrillTab({ deepLinked }: { deepLinked: boolean }) {
  // 弱点ディープリンク(プリフロップのMistakeCategory)で来たら必ずプリフロップを表示。
  const [mode, setMode] = useState<'preflop' | 'postflop' | 'pushfold'>('preflop')
  return (
    <div className="space-y-4">
      <DrillIntro />
      {!deepLinked && (
        <div className="flex flex-wrap gap-2">
          <Tab active={mode === 'preflop'} onClick={() => setMode('preflop')}>プリフロップ</Tab>
          <Tab active={mode === 'postflop'} onClick={() => setMode('postflop')}>ポストフロップ</Tab>
          <Tab active={mode === 'pushfold'} onClick={() => setMode('pushfold')}>プッシュ/フォールド</Tab>
        </div>
      )}
      {mode === 'preflop' ? <DrillPanel /> : mode === 'postflop' ? <PostflopDrillPanel /> : <PushFoldDrillPanel />}
    </div>
  )
}

export function LearnPage() {
  const drillCategory = useNavStore(s => s.drillCategory)
  // 弱点ドリルのディープリンクで来たらドリルタブを初期表示 (LearnPage は遷移で再マウント)
  const [tab, setTab] = useState<'dashboard' | 'drill' | 'history'>(() => (drillCategory ? 'drill' : 'dashboard'))
  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-2xl font-extrabold text-zinc-50">学習</h1>
        <div className="flex gap-2">
          <Tab active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>ダッシュボード</Tab>
          <Tab active={tab === 'drill'} onClick={() => setTab('drill')}>ドリル</Tab>
          <Tab active={tab === 'history'} onClick={() => setTab('history')}>ハンド履歴</Tab>
        </div>
        {tab === 'dashboard' ? <Dashboard /> : tab === 'drill' ? <DrillTab deepLinked={!!drillCategory} /> : <History onGoToDrill={() => setTab('drill')} />}
      </div>
    </div>
  )
}
