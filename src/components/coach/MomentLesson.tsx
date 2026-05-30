import type { CoachFeedback } from '../../types/coach'
import { TermChips, ConceptLink } from '../common/TermChips'
import { StrategyDetail } from './StrategyDetail'

// 正解 / ミックス戦略の「学習機会」カード。ミスではないので咎めず、
// ミックス時は "なぜ複数アクションが正解になるのか" を一言で補足して理解を促す。
export function MomentLesson({ feedback }: { feedback: CoachFeedback }) {
  const head =
    feedback.kind === 'mixed'
      ? { icon: '💡', label: 'ミックス戦略 (学習機会)', cls: 'text-teal-200' }
      : { icon: '✓', label: '正解', cls: 'text-emerald-300' }

  // ストリート文脈で関連用語を選ぶ (A10)。GLOSSARY に無い語は黙って除外される。
  const terms =
    feedback.kind === 'mixed'
      ? ['ミックス戦略', 'ポラライズ', 'ブロッカー']
      : feedback.street === 'preflop'
        ? ['レンジ', 'ポジション', 'バリューベット']
        : ['レンジ優位', 'バリューベット', 'ブラフ']

  return (
    <>
      <span className={`flex items-center gap-2 font-display font-extrabold ${head.cls}`}>
        <span aria-hidden="true" className="text-lg">{head.icon}</span>
        {head.label}
      </span>
      <p className="text-sm text-zinc-200 leading-relaxed my-2">{feedback.message}</p>
      {feedback.kind === 'mixed' && (
        <p className="text-xs text-teal-200/80 leading-relaxed mb-2">
          GTOは相手に読まれないよう同じ手を複数アクションに割り振ります。どちらを選んでも正解で、
          頻度通りに散らすほど均衡に近づきます。
        </p>
      )}
      <StrategyDetail feedback={feedback} />

      {/* A10: 用語チップ + 関連理論へのディープリンク。 */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TermChips terms={terms} />
        {feedback.kind === 'mixed' && <ConceptLink conceptId="mixed-strategy" />}
      </div>
    </>
  )
}
