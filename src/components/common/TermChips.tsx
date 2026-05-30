import { useEffect, useRef, useState } from 'react'
import { GLOSSARY } from '../../data/theory/glossary'
import { useNavStore } from '../../stores/navStore'
import { BookIcon } from '../icons/ActionIcons'

// 用語集チップ + 理論ディープリンク。coach/drill/pages が共有する小さな再利用部品。
// hover 依存にせずタップでもポップオーバーが開く (モバイル対応)。色だけに頼らず
// 下線つきテキスト + アイコンで識別する (ルール5)。

function findEntry(term: string) {
  return GLOSSARY.find(e => e.term === term)
}

interface ChipProps {
  term: string
}

// 単一チップ。クリック/タップで定義ポップオーバーをトグル。未登録の用語は描画しない。
function TermChip({ term }: ChipProps) {
  const entry = findEntry(term)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!entry) return null

  return (
    <span ref={ref} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 min-h-7 px-2 rounded-md text-[11px] font-bold
          border border-brass-500/40 bg-brass-500/10 text-brass-200 underline decoration-dotted
          underline-offset-2 hover:bg-brass-500/20 transition-colors"
      >
        {entry.term}
        <span aria-hidden="true" className="text-brass-400/70">?</span>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 block w-60 max-w-[80vw] rounded-lg border
            border-white/15 bg-base-900/95 p-2.5 text-left shadow-xl backdrop-blur"
        >
          <span className="block font-display font-bold text-brass-200 text-xs">{entry.term}</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-300">{entry.definition}</span>
        </span>
      )}
    </span>
  )
}

interface TermChipsProps {
  terms: string[]
  className?: string
}

// 用語チップの集合。GLOSSARY に無い用語は黙って除外する。
export function TermChips({ terms, className }: TermChipsProps) {
  const known = terms.filter(t => findEntry(t))
  if (known.length === 0) return null
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {known.map(t => (
        <TermChip key={t} term={t} />
      ))}
    </span>
  )
}

interface ConceptLinkProps {
  conceptId: string
  label?: string
  className?: string
}

// 理論コンセプトへのディープリンク (WeaknessCard の goTo('theory', ...) を踏襲)。
export function ConceptLink({ conceptId, label = '関連理論 ▶', className }: ConceptLinkProps) {
  const goTo = useNavStore(s => s.goTo)
  return (
    <button
      type="button"
      onClick={() => goTo('theory', { theoryConceptId: conceptId })}
      className={`inline-flex items-center gap-1.5 min-h-8 px-2.5 rounded-lg text-xs font-bold
        bg-brass-500/15 text-brass-200 hover:bg-brass-500/25 transition-colors ${className ?? ''}`}
    >
      <BookIcon /> {label}
    </button>
  )
}
