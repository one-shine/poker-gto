import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '../../stores/settingsStore'

interface OnboardingFlowProps {
  // 完了/スキップ時のコールバック (テスト用・App側の制御用)。省略時は settingsStore を更新。
  onComplete?: () => void
}

interface Slide {
  title: string
  body: React.ReactNode
}

// レンジグリッドの凡例。色だけに依存しない (CLAUDE.md ルール5): R/C/M の文字トークンを併記。
const LEGEND: { token: string; label: string; cls: string }[] = [
  { token: 'R', label: 'レイズ', cls: 'bg-emerald-600' },
  { token: 'C', label: 'コール', cls: 'bg-sky-600' },
  { token: 'M', label: 'ミックス', cls: 'bg-teal-600' },
  { token: '·', label: 'フォールド', cls: 'bg-zinc-700' },
]

const SLIDES: Slide[] = [
  {
    title: 'ようこそ',
    body: <p>6-max ノーリミットホールデムの GTO 学習アプリです。実戦に近いテーブルでプレイしながら、最適戦略との差を学びます。</p>,
  },
  {
    title: 'ポジション',
    body: (
      <div className="flex flex-col gap-2">
        <p>テーブルには6つの席があります。<strong className="text-zinc-100">BTN(ボタン)</strong> は最後に行動できる最強のポジションです。</p>
        <p className="text-zinc-400 text-sm">UTG → MP → CO → BTN → SB → BB の順に行動順が回ります。あなたは常に BTN 基準の席でプレイします。</p>
      </div>
    ),
  },
  {
    title: 'レンジグリッドの読み方',
    body: (
      <div className="flex flex-col gap-3">
        <p>13×13 グリッドは169種のスターティングハンドの戦略を表します。色とあわせて <strong className="text-zinc-100">文字トークン</strong> で行動を示します。</p>
        <ul className="flex flex-col gap-1.5">
          {LEGEND.map(l => (
            <li key={l.token} className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-white text-sm font-bold ${l.cls}`}>
                {l.token}
              </span>
              <span className="text-zinc-200">{l.label}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    title: 'プレイ vs スタディ',
    body: (
      <div className="flex flex-col gap-2">
        <p><strong className="text-zinc-100">プレイモード</strong>: ハンドが止まらず実戦感覚で回せます。critical なミスだけ短いトーストで知らせ、<span className="text-zinc-200">ハンド終了後にポストフロップをまとめて復習</span>できます。</p>
        <p><strong className="text-zinc-100">スタディモード</strong>: ミスをするとその場でパネルが開き、推奨と「なぜ」を解説します。GTO戦略バー(? キー)も表示でき、じっくり学べます。</p>
        <p className="text-zinc-400 text-sm">迷ったらスタディから。設定ページでいつでも切り替えられます。</p>
      </div>
    ),
  },
  {
    title: '学習の流れ',
    body: (
      <div className="flex flex-col gap-3">
        <p>このアプリは「回して終わり」ではなく、ミスを起点に学べるよう各ページがつながっています。</p>
        <ol className="flex flex-col gap-1.5 text-sm">
          {[
            ['ゲーム', 'ハンドを回してコーチの解説を受ける'],
            ['分析', '繰り返しやすい弱点(ミス傾向)を確認'],
            ['理論', '弱点に紐づく概念・用語を読む'],
            ['学習(ドリル)', '弱点スポットを反復練習(正解は頻度10%以上で判定)'],
          ].map(([step, desc], i) => (
            <li key={step} className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-brass-500/20 text-brass-200 font-data text-[11px] font-bold">{i + 1}</span>
              <span><strong className="text-zinc-100">{step}</strong> — <span className="text-zinc-400">{desc}</span></span>
            </li>
          ))}
        </ol>
        <p className="text-zinc-400 text-sm">→ 分析と理論とドリルを往復することで、同じミスが減っていきます。</p>
      </div>
    ),
  },
  {
    title: '最初のハンド',
    body: (
      <div className="flex flex-col gap-2">
        <p>Game ページで <strong className="text-zinc-100">New Hand</strong>(または Space キー)を押すとプリフロップが始まります。</p>
        <p className="text-zinc-400 text-sm">最初のハンドの後にコーチ解説が出ます。用語が分からなければ「理論」タブの用語集で確認しましょう。準備ができたらプレイ開始！</p>
      </div>
    ),
  },
]

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const completeOnboarding = useSettingsStore(s => s.completeOnboarding)
  const [index, setIndex] = useState(0)

  const finish = () => {
    completeOnboarding()
    onComplete?.()
  }

  const isLast = index === SLIDES.length - 1
  const slide = SLIDES[index]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
        bg-[radial-gradient(120%_100%_at_50%_0%,#16201b_0%,rgba(0,0,0,0.85)_60%)]"
      role="dialog"
      aria-modal="true"
      aria-label="チュートリアル"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="max-w-md w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-base-800/95 backdrop-blur-md border border-white/10 p-5 sm:p-7 flex flex-col gap-5 shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-data text-[11px] font-bold text-brass-400">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="h-px w-5 bg-brass-500/50" aria-hidden="true" />
            <h2 className="text-xl font-extrabold text-zinc-50">{slide.title}</h2>
          </div>
          <button
            type="button"
            onClick={finish}
            className="text-xs text-zinc-500 hover:text-brass-300 transition-colors shrink-0"
          >
            スキップ
          </button>
        </div>

        {/* キー付き motion: index 変化で旧スライドは即アンマウント(重複表示なし) */}
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="text-zinc-300 leading-relaxed min-h-32"
        >
          {slide.body}
        </motion.div>

        {/* ステップインジケーター */}
        <div className="flex justify-center gap-1.5" aria-label={`${index + 1} / ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-brass-400 shadow-[0_0_8px_rgba(212,175,55,0.6)]' : 'w-1.5 bg-zinc-700'
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={() => setIndex(i => i - 1)}
            disabled={index === 0}
            className="min-h-11 px-4 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
          >
            戻る
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="min-h-11 px-7 rounded-xl brass font-display font-extrabold tracking-wide shadow-[0_4px_16px_rgba(212,175,55,0.3)] hover:brightness-110 active:translate-y-px transition-all"
            >
              プレイ開始
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex(i => i + 1)}
              className="min-h-11 px-7 rounded-xl brass font-display font-extrabold tracking-wide shadow-[0_4px_16px_rgba(212,175,55,0.3)] hover:brightness-110 active:translate-y-px transition-all"
            >
              次へ
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
