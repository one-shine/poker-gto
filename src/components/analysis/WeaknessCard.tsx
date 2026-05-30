import type { MistakeCategory } from '../../types/stats'
import { conceptsForMistake } from '../../data/theory/concepts'
import { CATEGORY_JP } from '../../data/mistakeLabels'
import { useNavStore } from '../../stores/navStore'
import { BookIcon, TargetIcon } from '../icons/ActionIcons'

interface Props {
  category: MistakeCategory
  count: number
  evLost: number
  rank: number
}

// 弱点カード: ミスカテゴリ + 回数/EV損失 + 関連理論への導線 (Theory↔Practice ループ)。
export function WeaknessCard({ category, count, evLost, rank }: Props) {
  const goTo = useNavStore(s => s.goTo)
  const concepts = conceptsForMistake(category)
  const top = concepts[0]

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-data text-rose-400/70 font-bold text-lg" aria-hidden="true">#{rank}</span>
          <span className="font-display font-bold text-zinc-100">{CATEGORY_JP[category]}</span>
        </div>
        <div className="text-right shrink-0">
          <div className="font-data text-rose-300 font-bold">{count}回</div>
          {evLost > 0 && <div className="font-data text-[11px] text-rose-400/80">-{evLost.toFixed(1)}BB</div>}
        </div>
      </div>

      {top && <p className="text-xs text-zinc-400 leading-snug mb-3">{top.summary}</p>}

      {/* D3-extra: 関連理論をトップだけでなく「読む順」で全件提示する。 */}
      {concepts.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold text-brass-300/80 uppercase tracking-wider mb-1.5">関連理論を読む順</p>
          <ol className="space-y-1">
            {concepts.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => goTo('theory', { theoryConceptId: c.id })}
                  className="w-full flex items-center gap-2 text-left min-h-8 px-2 rounded-lg text-xs font-bold text-brass-200 bg-brass-500/10 hover:bg-brass-500/20 transition-colors"
                >
                  <span aria-hidden="true" className="font-data text-brass-400/70">{i + 1}.</span>
                  <BookIcon />
                  <span className="text-zinc-100">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => goTo('learn', { drillCategory: category })}
          className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 transition-colors"
        >
          <TargetIcon /> ドリルで練習
        </button>
      </div>
    </div>
  )
}
