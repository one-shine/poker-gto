import { motion } from 'framer-motion'
import type { MistakeCategory } from '../../types/stats'
import { useSessionStore } from '../../stores/sessionStore'
import { useNavStore } from '../../stores/navStore'
import { CATEGORY_JP } from '../../data/mistakeLabels'
import { TargetIcon } from '../icons/ActionIcons'

// セッション振り返りモーダル。100ハンドごと / 手動(設定の「セッション終了」)で表示。
export function ReflectionModal() {
  const open = useNavStore(s => s.reflectionOpen)
  const close = useNavStore(s => s.closeReflection)
  const goTo = useNavStore(s => s.goTo)

  const hands = useSessionStore(s => s.sessionHandCount)
  const evaluated = useSessionStore(s => s.evaluatedCount)
  const accuracy = useSessionStore(s => s.gtoAccuracy())
  const mistakes = useSessionStore(s => s.mistakes)

  if (!open) return null

  const byCat = new Map<MistakeCategory, number>()
  let evLost = 0
  for (const m of mistakes) {
    byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1)
    evLost += m.evLoss
  }
  const topLeak = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]

  const goAnalysis = () => { close(); goTo('analysis') }
  const goDrill = () => { close(); goTo('learn', topLeak ? { drillCategory: topLeak[0] } : undefined) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-label="セッション振り返り"
        className="w-full max-w-md rounded-2xl border border-brass-500/30 bg-base-800 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)] space-y-5"
      >
        <div className="text-center">
          <p className="text-xs text-brass-300 uppercase tracking-widest font-bold">セッション振り返り</p>
          <h2 className="text-2xl font-display font-extrabold text-zinc-50 mt-1">{hands} ハンド達成</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-base-900/60 p-3 text-center">
            <div className="text-xs text-zinc-400 mb-1">GTO精度</div>
            <div className="font-data text-2xl font-bold text-emerald-300">
              {accuracy == null ? '—' : `${Math.round(accuracy * 100)}%`}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{evaluated} 判断を測定</div>
          </div>
          <div className="rounded-xl bg-base-900/60 p-3 text-center">
            <div className="text-xs text-zinc-400 mb-1">EV損失合計</div>
            <div className="font-data text-2xl font-bold text-rose-300">
              {evLost > 0 ? `-${evLost.toFixed(1)}` : '0'}<span className="text-sm">BB</span>
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{mistakes.length} ミス</div>
          </div>
        </div>

        <div className="rounded-xl bg-base-900/60 p-3">
          <div className="text-xs text-zinc-400 mb-1">最大のリーク</div>
          {topLeak ? (
            <div className="flex items-center justify-between">
              <span className="text-zinc-100 font-bold">{CATEGORY_JP[topLeak[0]]}</span>
              <span className="font-data text-rose-300">{topLeak[1]}回</span>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">大きなリークはありません。好調です。</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {topLeak && (
            <button type="button" onClick={goDrill} className="inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl brass font-display font-extrabold">
              <TargetIcon className="w-4 h-4" /> 弱点をドリルで練習
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={goAnalysis} className="flex-1 min-h-10 px-4 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/20 text-zinc-100">
              詳しく分析
            </button>
            <button type="button" onClick={close} className="flex-1 min-h-10 px-4 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/20 text-zinc-100">
              続ける
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
