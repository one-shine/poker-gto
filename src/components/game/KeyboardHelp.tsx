import { useEffect, useState } from 'react'

// D6: キー操作の一覧をアプリ内で開示する小モーダル。
// CLAUDE.md のキーボードショートカット表と整合させる (f/c/r/Enter/Esc/Space/?)。
const KEYS: { key: string; label: string }[] = [
  { key: 'F', label: 'フォールド' },
  { key: 'C', label: 'チェック / コール' },
  { key: 'R', label: 'ベット / レイズ' },
  { key: 'Enter', label: 'アクションを確定' },
  { key: 'Space', label: '次のハンドへ' },
  { key: '?', label: 'GTO戦略パネルの表示切替 (スタディ)' },
  { key: 'Esc', label: 'パネル / モーダルを閉じる' },
]

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="キー操作の一覧を表示"
        className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold
          border border-white/10 bg-base-800/70 text-zinc-300 hover:text-brass-200 hover:border-brass-500/40 transition-colors"
      >
        <KeyboardGlyph />
        <span className="hidden sm:inline">キー操作</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="キー操作"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-sm w-full rounded-2xl bg-base-800/95 border border-white/10 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-display font-extrabold text-zinc-50 flex items-center gap-2">
                <KeyboardGlyph /> キー操作
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 px-3 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-zinc-100"
              >
                閉じる
              </button>
            </div>
            <dl className="space-y-1.5">
              {KEYS.map(k => (
                <div key={k.key} className="flex items-center justify-between gap-3 text-sm">
                  <dd className="text-zinc-300">{k.label}</dd>
                  <dt>
                    <kbd className="font-data text-[11px] font-bold text-brass-200 bg-base-900 border border-white/15 rounded-md px-2 py-1 min-w-7 inline-flex justify-center">
                      {k.key}
                    </kbd>
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  )
}

function KeyboardGlyph() {
  return (
    <svg className="w-[1.1rem] h-[1.1rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  )
}
