import type { ReactNode } from 'react'

// lucide 風の細線SVG (stroke / currentColor / 24 viewBox)。ナビアイコンと統一。
function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className ?? 'w-3.5 h-3.5'}
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// 関連理論: 開いた本 (理論ナビと同じグリフ)
export function BookIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7Z" />
    </Svg>
  )
}

// ドリル: 的 (target)
export function TargetIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </Svg>
  )
}
