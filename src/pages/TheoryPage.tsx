import { useEffect, useMemo, useState } from 'react'
import type { SkillLevel } from '../types/game'
import { CONCEPTS, CONCEPT_CATEGORY_JP, type ConceptCategory, type TheoryConcept } from '../data/theory/concepts'
import { GLOSSARY } from '../data/theory/glossary'
import { useNavStore } from '../stores/navStore'
import { TargetIcon } from '../components/icons/ActionIcons'
import { TermChips } from '../components/common/TermChips'

const LEVEL_JP: Record<SkillLevel, string> = {
  beginner: '入門', intermediate: '中級', advanced: '上級', pro: 'プロ',
}
const LEVEL_CLS: Record<SkillLevel, string> = {
  beginner: 'bg-emerald-900/40 text-emerald-300',
  intermediate: 'bg-sky-900/40 text-sky-300',
  advanced: 'bg-amber-900/40 text-amber-300',
  pro: 'bg-rose-900/40 text-rose-300',
}
const CATEGORIES: ConceptCategory[] = ['preflop', 'postflop', 'math', 'mental']

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

function ConceptArticle({ concept, onClose }: { concept: TheoryConcept; onClose: () => void }) {
  const goTo = useNavStore(s => s.goTo)
  const drillCat = concept.relatedMistakes[0]
  // D5: 本文中に登場する用語集の語をチップ化して即時に定義へアクセスできるようにする。
  const terms = useMemo(
    () => GLOSSARY.filter(e => concept.body.includes(e.term) || concept.summary.includes(e.term)).map(e => e.term),
    [concept],
  )
  return (
    <article className="rounded-2xl border border-brass-500/30 bg-base-800/70 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${LEVEL_CLS[concept.skillLevel]}`}>
              {LEVEL_JP[concept.skillLevel]}
            </span>
            <span className="text-[11px] text-zinc-500">{CONCEPT_CATEGORY_JP[concept.category]}</span>
          </div>
          <h2 className="text-xl font-display font-extrabold text-zinc-50">{concept.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 min-h-11 px-3 py-2 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass-300"
        >
          一覧へ
        </button>
      </div>
      {concept.body.split('\n\n').map((para, i) => (
        <p key={i} className="text-sm text-zinc-200 leading-relaxed">{para}</p>
      ))}
      {terms.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-bold text-brass-300/80 uppercase tracking-wider mb-1.5">この概念の用語</p>
          <TermChips terms={terms} />
        </div>
      )}
      {drillCat && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => goTo('learn', { drillCategory: drillCat })}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-200 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors"
          >
            <TargetIcon /> このコンセプトをドリルで練習
          </button>
        </div>
      )}
    </article>
  )
}

function ConceptLibrary() {
  const theoryFocusId = useNavStore(s => s.theoryFocusId)
  const clearTheoryFocus = useNavStore(s => s.clearTheoryFocus)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ConceptCategory | 'all'>('all')

  // 弱点カードからの導線(外部ナビ信号)に同期して指定コンセプトを開く。
  // 外部ストアの一過性シグナルへの購読であり、cascading render の懸念はない。
  useEffect(() => {
    if (theoryFocusId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenId(theoryFocusId)
      clearTheoryFocus()
    }
  }, [theoryFocusId, clearTheoryFocus])

  const open = openId ? CONCEPTS.find(c => c.id === openId) : undefined
  const list = useMemo(
    () => (filter === 'all' ? CONCEPTS : CONCEPTS.filter(c => c.category === filter)),
    [filter],
  )

  if (open) return <ConceptArticle concept={open} onClose={() => setOpenId(null)} />

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Tab active={filter === 'all'} onClick={() => setFilter('all')}>すべて</Tab>
        {CATEGORIES.map(c => (
          <Tab key={c} active={filter === c} onClick={() => setFilter(c)}>{CONCEPT_CATEGORY_JP[c]}</Tab>
        ))}
      </div>
      <ul className="grid sm:grid-cols-2 gap-3">
        {list.map(c => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpenId(c.id)}
              className="w-full h-full text-left rounded-xl border border-white/10 bg-base-800/60 hover:border-brass-500/40 p-3.5 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${LEVEL_CLS[c.skillLevel]}`}>
                  {LEVEL_JP[c.skillLevel]}
                </span>
                <span className="text-[11px] text-zinc-500">{CONCEPT_CATEGORY_JP[c.category]}</span>
              </div>
              <h3 className="font-display font-bold text-zinc-100 mb-0.5">{c.title}</h3>
              <p className="text-xs text-zinc-400 leading-snug">{c.summary}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Glossary() {
  const [q, setQ] = useState('')
  const norm = q.trim().toLowerCase()
  const entries = useMemo(() => {
    if (!norm) return GLOSSARY
    return GLOSSARY.filter(e =>
      e.term.toLowerCase().includes(norm) ||
      e.reading?.toLowerCase().includes(norm) ||
      e.definition.toLowerCase().includes(norm),
    )
  }, [norm])

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="用語を検索 (例: GTO, ポジション, ブラフ)"
        aria-label="用語を検索"
        className="w-full min-h-11 px-4 rounded-xl bg-base-800 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-brass-500/50 focus:outline-none"
      />
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">「{q}」に一致する用語が見つかりません。</p>
      ) : (
        <dl className="space-y-2.5">
          {entries.map(e => (
            <div key={e.term} className="rounded-xl border border-white/10 bg-base-800/60 p-3.5">
              <dt className="font-display font-bold text-brass-200">{e.term}</dt>
              <dd className="text-sm text-zinc-300 leading-relaxed mt-0.5">{e.definition}</dd>
              {e.relatedTerms.length > 0 && (
                <dd className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500">関連:</span>
                  {e.relatedTerms.map(rt => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setQ(rt)}
                      className="inline-flex items-center text-[11px] font-bold text-brass-300 underline decoration-dotted underline-offset-2 hover:text-brass-200 transition-colors min-h-9 px-2 py-1 rounded"
                    >
                      {rt}
                    </button>
                  ))}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function TheoryPage() {
  // 既定は戦略理論タブ。弱点からのディープリンクは TheoryPage の再マウントで
  // この既定に乗るため、タブ同期の effect は不要。
  const [tab, setTab] = useState<'concepts' | 'glossary'>('concepts')

  return (
    <div className="h-full overflow-auto p-4 sm:p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <h1 className="text-2xl font-extrabold text-zinc-50">理論</h1>
        <div className="flex gap-2">
          <Tab active={tab === 'concepts'} onClick={() => setTab('concepts')}>戦略理論</Tab>
          <Tab active={tab === 'glossary'} onClick={() => setTab('glossary')}>用語集</Tab>
        </div>
        {tab === 'concepts' ? <ConceptLibrary /> : <Glossary />}
      </div>
    </div>
  )
}
