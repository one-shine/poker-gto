/* eslint-disable react-refresh/only-export-components --
   ナビ定義(データ + SVGアイコン)モジュール。コンポーネント本体ではなく Fast Refresh 対象外。 */
import type { ReactNode } from 'react'

export type PageId = 'game' | 'learn' | 'analysis' | 'theory' | 'ranges' | 'settings'

type IconProps = { className?: string }
export type IconComponent = (props: IconProps) => ReactNode

// lucide 風の細線SVG (stroke / currentColor / 24 viewBox)。色のみ非依存: アイコン + ラベル併用。
function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ICONS: Record<PageId, IconComponent> = {
  // ゲーム: スペード
  game: p => <Svg {...p}><path d="M5 9c-1.5 1.5-3 3.2-3 5.5A5.5 5.5 0 0 0 7.5 20c1.8 0 3-.5 4.5-2 1.5 1.5 2.7 2 4.5 2A5.5 5.5 0 0 0 22 14.5c0-2.3-1.5-4-3-5.5l-7-7-7 7Z" /><path d="M12 18v4" /></Svg>,
  // 学習: 学帽
  learn: p => <Svg {...p}><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2.5 9 2.5 12 0v-5" /></Svg>,
  // 分析: 棒グラフ
  analysis: p => <Svg {...p}><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="0.5" /><rect x="12" y="7" width="3" height="10" rx="0.5" /><rect x="17" y="13" width="3" height="4" rx="0.5" /></Svg>,
  // 理論: 開いた本
  theory: p => <Svg {...p}><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Z" /><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7Z" /></Svg>,
  // レンジ: グリッド
  ranges: p => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></Svg>,
  // 設定: 歯車
  settings: p => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></Svg>,
}

export interface NavItem {
  id: PageId
  label: string
  Icon: IconComponent
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'game', label: 'ゲーム', Icon: ICONS.game },
  { id: 'learn', label: '学習', Icon: ICONS.learn },
  { id: 'analysis', label: '分析', Icon: ICONS.analysis },
  { id: 'theory', label: '理論', Icon: ICONS.theory },
  { id: 'ranges', label: 'レンジ', Icon: ICONS.ranges },
  { id: 'settings', label: '設定', Icon: ICONS.settings },
]
