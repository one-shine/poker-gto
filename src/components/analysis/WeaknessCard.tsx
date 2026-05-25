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

      <div className="flex flex-wrap gap-2">
        {top && (
          <button
            type="button"
            onClick={() => goTo('theory', { theoryConceptId: top.id })}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-xs font-bold bg-brass-500/20 text-brass-200 hover:bg-brass-500/30 transition-colors"
          >
            <BookIcon /> 関連理論を読む
          </button>
        )}
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
