import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { captureError } from '../../lib/monitoring/reporter'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  // jsdom には location.reload が無いためテストで差し替え可能にする。
  onReload?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

// React 19 でもエラー境界はクラスコンポーネントが必須 (本リポ唯一のクラス)。
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { componentStack: info.componentStack })
  }

  handleReload = (): void => {
    if (this.props.onReload) {
      this.props.onReload()
      return
    }
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center p-4 text-zinc-200"
      >
        <div className="w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-700 p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-amber-300" aria-hidden="true">⚠</span>
            <h1 className="text-lg font-bold text-zinc-100">問題が発生しました</h1>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed mb-5">
            予期しないエラーで画面の表示を続けられませんでした。
            データは端末内に保存されているため失われていません。
            ページを再読み込みしてください。
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="min-h-11 w-full rounded-lg brass font-semibold px-4 hover:brightness-110 active:brightness-95"
          >
            再読み込み
          </button>

          {import.meta.env.DEV && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-[11px] text-zinc-500">
                エラー詳細 (開発時のみ)
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-zinc-950 border border-zinc-800 p-2 text-[11px] text-zinc-400 whitespace-pre-wrap break-words">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ''}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
