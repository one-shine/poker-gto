import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
// ポップオーバーは Portal で body に fixed 配置 → overflow 親(卓領域/ドリルカード等)でクリップしない。
function TermChip({ term }: ChipProps) {
  const entry = findEntry(term)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!entry) return null

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const W = 240
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8)) // 画面端からはみ出さない
      setPos({ top: r.bottom + 4, left })
    }
    setOpen(o => !o)
  }

  return (
    <span className="relative inline-block align-baseline">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 min-h-9 px-2 rounded-md text-[11px] font-bold
          border border-brass-500/40 bg-brass-500/10 text-brass-200 underline decoration-dotted
          underline-offset-2 hover:bg-brass-500/20 transition-colors
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass-300"
      >
        {entry.term}
        <span aria-hidden="true" className="text-brass-400/70">?</span>
      </button>
      {open && pos && createPortal(
        <span
          ref={popRef}
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240, maxWidth: 'calc(100vw - 1rem)' }}
          className="z-[60] block rounded-lg border border-white/15 bg-base-900/95 p-2.5 text-left shadow-xl backdrop-blur"
        >
          <span className="block font-display font-bold text-brass-200 text-xs">{entry.term}</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-300">{entry.definition}</span>
        </span>,
        document.body,
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
      className={`inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-bold
        bg-brass-500/15 text-brass-200 hover:bg-brass-500/25 transition-colors
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass-300 ${className ?? ''}`}
    >
      <BookIcon /> {label}
    </button>
  )
}
