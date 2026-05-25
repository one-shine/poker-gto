import type { ReactNode } from 'react'
import { NAV_ITEMS, type NavItem, type PageId } from './navItems'

interface AppShellProps {
  active: PageId
  onNavigate: (id: PageId) => void
  children: ReactNode
}

export function AppShell({ active, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-screen text-zinc-100">
      {/* desktop: 左サイドバー */}
      <nav
        className="hidden md:flex flex-col w-20 shrink-0 border-r border-white/8 bg-base-900/60 py-4 gap-1"
        aria-label="メインナビゲーション"
      >
        {/* ブランドマーク */}
        <div className="flex flex-col items-center gap-0.5 pb-4 mb-2 border-b border-white/8 mx-2">
          <span className="w-9 h-9 rounded-xl brass flex items-center justify-center font-display font-extrabold text-base shadow-[0_2px_8px_rgba(212,175,55,0.35)]">
            ♠
          </span>
          <span className="font-display text-[9px] font-bold tracking-widest text-brass-300/80">GTO LAB</span>
        </div>
        {NAV_ITEMS.map(item => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onNavigate(item.id)}
            layout="vertical"
          />
        ))}
      </nav>

      {/* メインコンテンツ (mobile はボトムタブ分の余白を確保) */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>

      {/* mobile: ボトムタブバー */}
      <nav
        className="flex md:hidden fixed bottom-0 inset-x-0 h-16 border-t border-white/8 bg-base-900/95 backdrop-blur-md z-40"
        aria-label="メインナビゲーション"
      >
        {NAV_ITEMS.map(item => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onNavigate(item.id)}
            layout="horizontal"
          />
        ))}
      </nav>
    </div>
  )
}

function NavButton({
  item,
  active,
  onClick,
  layout,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
  layout: 'vertical' | 'horizontal'
}) {
  // アクティブ表示は色だけに頼らず、ブラスバー + 塗り背景 + 太字 + aria-current で示す
  const base =
    'relative flex flex-col items-center justify-center gap-0.5 transition-all min-h-11 ' +
    (layout === 'vertical' ? 'mx-2 py-2 rounded-xl' : 'flex-1')
  const state = active
    ? 'bg-brass-400/12 text-brass-200 font-bold'
    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      className={`${base} ${state}`}
    >
      {/* アクティブインジケーター: 縦バー(desktop) / 横バー(mobile) のブラス発光 */}
      {active && (
        <span
          aria-hidden="true"
          className={
            layout === 'vertical'
              ? 'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full bg-brass-400 shadow-[0_0_8px_rgba(212,175,55,0.7)]'
              : 'absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-brass-400 shadow-[0_0_8px_rgba(212,175,55,0.7)]'
          }
        />
      )}
      <item.Icon className="w-[1.35rem] h-[1.35rem]" />
      <span className="text-[10px] font-display tracking-wide">{item.label}</span>
    </button>
  )
}
