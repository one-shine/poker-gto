import { useEffect, useRef, useState } from 'react'
import {
  NO_REAL_MONEY,
  NON_AFFILIATION,
  PRIVACY_POLICY_SECTIONS,
} from '../../data/legal/privacyPolicy'

// 「アプリについて / 法務」セクション。
// - 常設: 実マネー無し・非提携 (常に見える。GameFooter モーダルと整合)。
// - プライバシーポリシーはオーバーレイで表示 (GameFooter の a11y パターンを踏襲)。
export function AboutLegalSection() {
  const [policyOpen, setPolicyOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // aria-modal を名乗る以上、開いている間はフォーカスをダイアログ内に閉じ込め、
  // 閉じたらトリガーへ戻す。背景スクロール伝播も止める。
  useEffect(() => {
    if (!policyOpen) return
    const prevFocus = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPolicyOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [policyOpen])

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold text-brass-300 uppercase tracking-wider">
        アプリについて / 法務
      </h2>

      {/* 常設: 実マネー無し・非提携。色だけに依存しない (アイコンは aria-hidden + テキスト併記) */}
      <div className="rounded-xl border border-white/10 bg-base-800/60 p-3 space-y-2">
        <p className="flex gap-2 text-[13px] text-zinc-200 leading-relaxed">
          <span aria-hidden="true" className="text-emerald-300 shrink-0">
            ◆
          </span>
          <span>{NO_REAL_MONEY}</span>
        </p>
        <p className="flex gap-2 text-[13px] text-zinc-200 leading-relaxed">
          <span aria-hidden="true" className="text-zinc-400 shrink-0">
            ◇
          </span>
          <span>{NON_AFFILIATION}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPolicyOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-white/10 bg-base-800/60 hover:border-brass-500/40 text-sm font-semibold text-zinc-200"
      >
        <span aria-hidden="true">§</span>
        <span className="whitespace-nowrap">プライバシーポリシー</span>
      </button>

      {policyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="プライバシーポリシー"
          onClick={() => setPolicyOpen(false)}
        >
          <div
            ref={panelRef}
            tabIndex={-1}
            className="max-w-lg w-full max-h-[85vh] flex flex-col rounded-xl bg-base-900 border border-white/10 text-sm outline-none"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 p-5 pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-zinc-100 whitespace-nowrap">
                プライバシーポリシー
              </h3>
              <button
                type="button"
                onClick={() => setPolicyOpen(false)}
                aria-label="閉じる"
                className="min-h-11 min-w-11 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-base-800/60"
              >
                ✕
              </button>
            </div>

            <div className="overflow-auto overscroll-contain p-5 pt-4 space-y-4">
              {PRIVACY_POLICY_SECTIONS.map(sec => (
                <div key={sec.heading} className="space-y-1.5">
                  <h4 className="text-sm font-bold text-brass-300">{sec.heading}</h4>
                  {sec.paragraphs?.map((p, i) => (
                    <p key={i} className="text-[13px] text-zinc-300 leading-relaxed">
                      {p}
                    </p>
                  ))}
                  {sec.bullets && (
                    <ul className="list-disc pl-5 space-y-1">
                      {sec.bullets.map((b, i) => (
                        <li key={i} className="text-[13px] text-zinc-300 leading-relaxed">
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  {sec.fields && (
                    <dl className="flex flex-col gap-1.5 pt-1">
                      {sec.fields.map(f => (
                        <div key={f.label} className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <dt className="text-[13px] font-semibold text-zinc-400 whitespace-nowrap">
                            {f.label}:
                          </dt>
                          <dd className="text-[13px] text-zinc-300">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {sec.note && (
                    <p className="text-[11px] text-zinc-500 leading-relaxed">{sec.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
