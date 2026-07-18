import { useRef, useState } from 'react'
import { useSettingsStore, type AppMode, type OpponentMode, type AiSpeed, type StackMode } from '../stores/settingsStore'
import { useProgressStore } from '../stores/progressStore'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
import { useNavStore } from '../stores/navStore'
import { exportAll, importAll } from '../lib/storage/dataTransfer'
import { AboutLegalSection } from '../components/settings/AboutLegalSection'

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

// ON/OFF トグル (色 + テキスト + ✓ 記号で色覚配慮、タップ域 >=44px)。
function Toggle({ checked, onChange, label, desc }: {
  checked: boolean
  onChange: (b: boolean) => void
  label: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`w-full text-left rounded-xl border p-3 min-h-12 transition-all ${
        checked
          ? 'border-brass-400 bg-brass-400/10'
          : 'border-white/10 bg-base-800/60 hover:border-brass-500/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-display font-bold text-sm">
          {checked && <span aria-hidden="true" className="text-brass-300">✓</span>}
          {label}
        </span>
        <span className={`text-xs font-bold ${checked ? 'text-brass-300' : 'text-zinc-500'}`}>
          {checked ? 'ON' : 'OFF'}
        </span>
      </div>
      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{desc}</p>
    </button>
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
  const setStackMode = (m: StackMode) => { s.setStackMode(m); resetGame() }
  const setStack = (n: number) => { s.setBuyInBB(n); resetGame() }

  // U11: データ書き出し/読み込み (完全ローカル・外部送信なし)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dataBusy, setDataBusy] = useState(false)
  const [dataMsg, setDataMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const handleExport = async () => {
    setDataBusy(true)
    try {
      const json = await exportAll()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      a.href = url
      a.download = `poker-gto-backup-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
      setDataMsg({ kind: 'ok', text: 'データを書き出しました。' })
    } catch {
      setDataMsg({ kind: 'err', text: '書き出しに失敗しました。' })
    } finally {
      setDataBusy(false)
    }
  }

  const handleImportFile = async (file: File) => {
    if (!confirm('現在の設定・進捗・学習統計を、選んだファイルの内容で上書きします。よろしいですか?')) return
    setDataBusy(true)
    try {
      const res = await importAll(await file.text())
      if (res.ok) {
        // 反映を確実にするためリロード (各ストアの rehydrate を初期化経路で行う)。
        setDataMsg({ kind: 'ok', text: '読み込みました。反映のため再読み込みします…' })
        setTimeout(() => location.reload(), 700)
      } else {
        setDataMsg({ kind: 'err', text: res.errors.join(' ') || '読み込めませんでした。' })
      }
    } catch {
      setDataMsg({ kind: 'err', text: '読み込みに失敗しました。' })
    } finally {
      setDataBusy(false)
    }
  }

  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-xl mx-auto space-y-7">
        <h1 className="text-2xl font-extrabold text-zinc-50">設定</h1>

        <Section title="フィードバックの濃さ">
          <Segmented<AppMode>
            value={s.appMode}
            onChange={setAppMode}
            options={[
              { value: 'study', label: 'スタディ', desc: '自分が打った後にGTO戦略で答え合わせ・ミスで一時停止して解説。学習向け。' },
              { value: 'play', label: 'プレイ', desc: '戦略は非表示。ハンドは止まらず、重大なミスのみ通知。実力測定向け。' },
            ]}
          />
        </Section>

        <Section title="対戦相手">
          <Segmented<OpponentMode>
            value={s.opponentMode}
            onChange={setOpponent}
            options={[
              { value: 'trainer', label: 'GTO (trainer)', desc: '相手は本アプリの解を頻度サンプリングして打つ(GTO Wizard 流)。解の精度はスポット次第で、100BBプリフロップの多くは GTO近似(フッターの △/✓ source バッジ参照)。' },
              { value: 'exploit', label: 'Fish (exploit)', desc: 'リーク持ちの相手。実戦的だが固定解突合は「GTO近似に照らすと」の参考値。' },
            ]}
          />
        </Section>

        <Section title="スタック方式">
          <Segmented<StackMode>
            value={s.stackMode}
            onChange={setStackMode}
            options={[
              { value: 'reset', label: 'リセット', desc: '各ハンド開始時に全員バイインに戻す。毎ハンド独立=GTO評価が最もクリーン(既定)。' },
              { value: 'cash', label: 'キャッシュ繰り越し', desc: '前ハンドの終了スタックを次に持ち越し、バストで自動リバイ。実戦的だが実効スタックが100BBから外れると精度が下がる。' },
            ]}
          />
          <div className="mt-2 flex gap-2">
            {[50, 100, 200].map(bb => (
              <button
                key={bb}
                type="button"
                onClick={() => setStack(bb)}
                aria-pressed={s.buyInBB === bb}
                className={`flex-1 min-h-11 rounded-xl border font-data font-bold transition-all ${
                  s.buyInBB === bb
                    ? 'border-brass-400 bg-brass-400/10 text-brass-200'
                    : 'border-white/10 bg-base-800/60 text-zinc-300 hover:border-brass-500/40'
                }`}
              >
                {bb}BB
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">
            {s.stackMode === 'cash' ? '※ バイイン額。' : '※ 各ハンドの開始スタック。'}解は 100BB 前提。他の深さは近似精度が下がります。
          </p>
        </Section>

        <Section title="スタディ: アクション後の答え合わせ">
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
                {s.studyShowStrategy ? '答え合わせ ON' : '答え合わせ OFF'}
              </span>
              <span className={`text-xs font-bold ${s.studyShowStrategy ? 'text-brass-300' : 'text-emerald-300'}`}>
                {s.studyShowStrategy ? '解説あり' : '解説なし'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
              ON: 自分がアクションした後に GTO戦略を表示して答え合わせする(事前には見せないので精度も測定)。
              OFF: 答え合わせも非表示。純粋に自分の判断だけで進める。
            </p>
          </button>
        </Section>

        <Section title="スタディ: アクション前の考え方ガイド">
          <button
            type="button"
            onClick={() => s.setShowReasoningGuide(!s.showReasoningGuide)}
            aria-pressed={s.showReasoningGuide}
            className={`w-full text-left rounded-xl border p-3 transition-all ${
              s.showReasoningGuide
                ? 'border-brass-400 bg-brass-400/10'
                : 'border-white/10 bg-base-800/60 hover:border-brass-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm">
                {s.showReasoningGuide ? '考え方ガイド ON' : '考え方ガイド OFF'}
              </span>
              <span className={`text-xs font-bold ${s.showReasoningGuide ? 'text-brass-300' : 'text-zinc-400'}`}>
                {s.showReasoningGuide ? '表示' : '非表示'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
              ON: 自分が打つ前に「この局面の考え方」(位置・オッズ・相手レンジ・ボード等の観点)を表示。
              GTOの答え(頻度)は見せないので測定には影響しません。OFF: 非表示。
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

        <Section title="相手アクションの速さ">
          <div className="flex gap-2">
            {([['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', '速い']] as [AiSpeed, string][]).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => s.setAiSpeed(val)}
                aria-pressed={s.aiSpeed === val}
                className={`flex-1 min-h-11 rounded-xl border font-display font-bold text-sm transition-all ${
                  s.aiSpeed === val
                    ? 'border-brass-400 bg-brass-400/10 text-brass-200'
                    : 'border-white/10 bg-base-800/60 text-zinc-300 hover:border-brass-500/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">相手が打つまでの「間」。速すぎて追えないときは「ゆっくり」に。</p>
        </Section>

        <Section title="サウンド・ハプティクス">
          <div className="flex flex-col gap-2">
            <Toggle
              checked={s.soundEnabled}
              onChange={s.setSoundEnabled}
              label="効果音"
              desc="ベット/チェック/フォールド/配布/勝利を短い合成音で知らせる(既定OFF)。"
            />
            <Toggle
              checked={s.hapticsEnabled}
              onChange={s.setHapticsEnabled}
              label="ハプティクス(振動)"
              desc="対応端末で配布・勝利時に短く振動する。モバイル向け(既定OFF)。"
            />
          </div>
        </Section>

        <Section title="データの引き継ぎ・バックアップ">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-zinc-500 leading-snug">
              設定・進捗・学習統計を JSON ファイルに書き出し/読み込みできます。
              <strong className="text-zinc-300">この端末内で完結し、外部送信は一切ありません。</strong>
              別端末への引き継ぎや、データ削除前のバックアップに。※過去ハンドの損益履歴は含みません(設定・進捗・統計のみ)。
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={dataBusy}
                onClick={handleExport}
                className="flex-1 min-h-11 rounded-xl border border-brass-500/30 bg-brass-500/10 hover:bg-brass-500/20 text-sm font-semibold text-brass-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span aria-hidden="true">⤓ </span>データを書き出す
              </button>
              <button
                type="button"
                disabled={dataBusy}
                onClick={() => fileRef.current?.click()}
                className="flex-1 min-h-11 rounded-xl border border-white/10 bg-base-800/60 hover:border-brass-500/40 text-sm font-semibold text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span aria-hidden="true">⤒ </span>データを読み込む
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); e.target.value = '' }}
            />
            {dataMsg && (
              <p className={`text-xs ${dataMsg.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
                <span aria-hidden="true">{dataMsg.kind === 'ok' ? '✓ ' : '⚠ '}</span>{dataMsg.text}
              </p>
            )}
          </div>
        </Section>

        <Section title="その他">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={sessionHandCount < 20}
              onClick={openReflection}
              className="min-h-11 rounded-xl border border-brass-500/30 bg-brass-500/10 hover:bg-brass-500/20 text-sm font-semibold text-brass-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title={sessionHandCount < 20 ? '20ハンド以上プレイすると振り返りできます' : undefined}
            >
              セッションを振り返る{sessionHandCount < 20 ? `(あと${20 - sessionHandCount}ハンド)` : ''}
            </button>
            <button
              type="button"
              onClick={() => s.resetOnboarding()}
              className="min-h-11 rounded-xl border border-white/10 bg-base-800/60 hover:border-brass-500/40 text-sm font-semibold text-zinc-200"
            >
              チュートリアルを再表示
            </button>
            <button
              type="button"
              onClick={() => { if (confirm('XP・レベル・統計をリセットします。よろしいですか?')) resetProgress() }}
              className="min-h-11 rounded-xl border border-rose-500/30 bg-rose-950/30 hover:bg-rose-950/50 text-sm font-semibold text-rose-300"
            >
              進捗(XP・統計)をリセット
            </button>
          </div>
        </Section>

        <AboutLegalSection />
      </div>
    </div>
  )
}
