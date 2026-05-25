import { useSettingsStore, type AppMode, type OpponentMode } from '../stores/settingsStore'
import { useProgressStore } from '../stores/progressStore'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
import { useNavStore } from '../stores/navStore'

// セグメント切替ボタン (色 + 選択リングで色覚配慮)
function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string; desc: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`text-left rounded-xl border p-3 transition-all ${
              active
                ? 'border-brass-400 bg-brass-400/10 shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                : 'border-white/10 bg-base-800/60 hover:border-brass-500/40'
            }`}
          >
            <div className="flex items-center gap-1.5 font-display font-bold text-sm">
              {active && <span aria-hidden="true" className="text-brass-300">✓</span>}
              {o.label}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{o.desc}</p>
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold text-brass-300 uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  )
}

export function SettingsPage() {
  const s = useSettingsStore()
  const resetProgress = useProgressStore(st => st.resetProgress)
  const resetGame = useGameStore(st => st.resetGame)
  const sessionHandCount = useSessionStore(st => st.sessionHandCount)
  const openReflection = useNavStore(st => st.openReflection)

  const setAppMode = (m: AppMode) => s.setAppMode(m)
  // 対戦相手/スタックはエンジン再初期化が必要
  const setOpponent = (m: OpponentMode) => { s.setOpponentMode(m); resetGame() }
  const setStack = (n: number) => { s.setStackBB(n); resetGame() }

  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-xl mx-auto space-y-7">
        <h1 className="text-2xl font-extrabold text-zinc-50">設定</h1>

        <Section title="フィードバックの濃さ">
          <Segmented<AppMode>
            value={s.appMode}
            onChange={setAppMode}
            options={[
              { value: 'study', label: 'スタディ', desc: 'GTO戦略を常時表示・ミスで一時停止して解説。学習向け(精度は測定しない)。' },
              { value: 'play', label: 'プレイ', desc: '戦略は非表示。ハンドは止まらず、重大なミスのみ通知。実力測定向け。' },
            ]}
          />
        </Section>

        <Section title="対戦相手">
          <Segmented<OpponentMode>
            value={s.opponentMode}
            onChange={setOpponent}
            options={[
              { value: 'trainer', label: 'GTO (trainer)', desc: '相手もGTO解で打つ。最適解との乖離を正しく測れる。GTO Wizard 流。' },
              { value: 'exploit', label: 'Fish (exploit)', desc: 'リーク持ちの相手。実戦的だが固定解突合は「GTO近似に照らすと」の参考値。' },
            ]}
          />
        </Section>

        <Section title="スタック深さ">
          <div className="flex gap-2">
            {[50, 100, 200].map(bb => (
              <button
                key={bb}
                type="button"
                onClick={() => setStack(bb)}
                aria-pressed={s.stackBB === bb}
                className={`flex-1 min-h-11 rounded-xl border font-data font-bold transition-all ${
                  s.stackBB === bb
                    ? 'border-brass-400 bg-brass-400/10 text-brass-200'
                    : 'border-white/10 bg-base-800/60 text-zinc-300 hover:border-brass-500/40'
                }`}
              >
                {bb}BB
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">※ 解は 100BB 前提。他の深さは近似精度が下がります。</p>
        </Section>

        <Section title="スタディ: GTO戦略の表示">
          <button
            type="button"
            onClick={() => s.setStudyShowStrategy(!s.studyShowStrategy)}
            aria-pressed={s.studyShowStrategy}
            className={`w-full text-left rounded-xl border p-3 transition-all ${
              s.studyShowStrategy
                ? 'border-brass-400 bg-brass-400/10'
                : 'border-white/10 bg-base-800/60 hover:border-brass-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm">
                {s.studyShowStrategy ? '常時表示 ON' : '常時表示 OFF(テスト)'}
              </span>
              <span className={`text-xs font-bold ${s.studyShowStrategy ? 'text-brass-300' : 'text-emerald-300'}`}>
                {s.studyShowStrategy ? '学習' : '精度測定'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
              ON: 解答(GTO戦略)を常に表示して学ぶ(精度は測定しない)。
              OFF: 戦略を隠し、自分の判断の GTO精度を測定する。
            </p>
          </button>
        </Section>

        <Section title="スタディ: 自動再開">
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={15} step={1} value={s.autoAdvanceSeconds}
              onChange={e => s.setAutoAdvanceSeconds(Number(e.target.value))}
              className="flex-1 accent-brass-400" aria-label="自動再開の秒数"
            />
            <span className="font-data text-sm text-brass-200 w-16 text-right">
              {s.autoAdvanceSeconds === 0 ? '手動' : `${s.autoAdvanceSeconds}秒`}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">学習機会(ミックス)カード後に自動で次へ進む秒数。0=手動。</p>
        </Section>

        <Section title="その他">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={sessionHandCount < 20}
              onClick={openReflection}
              className="min-h-11 rounded-xl border border-brass-500/30 bg-brass-500/10 hover:bg-brass-500/20 text-sm font-medium text-brass-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title={sessionHandCount < 20 ? '20ハンド以上プレイすると振り返りできます' : undefined}
            >
              セッションを振り返る{sessionHandCount < 20 ? `(あと${20 - sessionHandCount}ハンド)` : ''}
            </button>
            <button
              type="button"
              onClick={() => s.resetOnboarding()}
              className="min-h-11 rounded-xl border border-white/10 bg-base-800/60 hover:border-brass-500/40 text-sm font-medium text-zinc-200"
            >
              チュートリアルを再表示
            </button>
            <button
              type="button"
              onClick={() => { if (confirm('XP・レベル・統計をリセットします。よろしいですか?')) resetProgress() }}
              className="min-h-11 rounded-xl border border-rose-500/30 bg-rose-950/30 hover:bg-rose-950/50 text-sm font-medium text-rose-300"
            >
              進捗(XP・統計)をリセット
            </button>
          </div>
        </Section>
      </div>
    </div>
  )
}
