// クラッシュ報告。既定はローカル完結 (console のみ)。
// VITE_SENTRY_DSN が設定されている場合のみ @sentry/browser を動的 import する。
// @sentry/browser は依存に追加しない (バンドル禁止)。未インストールでも致命的にしない。

interface SentryLike {
  init: (options: { dsn: string }) => void
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void
}

let sentryInit: Promise<SentryLike | null> | null = null

// @sentry/browser は依存に追加しない。バンドラが静的に解決できないよう
// 実行時に組み立てた specifier で動的 import する (未インストールでも非致命)。
async function loadSentry(dsn: string): Promise<SentryLike | null> {
  if (sentryInit) return sentryInit
  sentryInit = (async () => {
    try {
      const specifier = ['@sentry', 'browser'].join('/')
      const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>
      const mod = (await dynamicImport(specifier)) as SentryLike
      mod.init({ dsn })
      return mod
    } catch {
      return null
    }
  })()
  return sentryInit
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  // 常に console へ。これがプライバシー既定 (リモート送信なし)。
  console.error('[crash]', error, context)

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  // 送信は best-effort。失敗しても呼び出し元へ例外を伝播させない。
  void loadSentry(dsn)
    .then(sentry => {
      sentry?.captureException(error, context ? { extra: context } : undefined)
    })
    .catch(() => { /* 報告失敗は致命的でない */ })
}

let registered = false

export function initErrorReporting(): void {
  if (registered) return
  registered = true

  if (typeof window === 'undefined') return

  window.addEventListener('error', event => {
    captureError(event.error ?? event.message, { type: 'window.error' })
  })
  window.addEventListener('unhandledrejection', event => {
    captureError(event.reason, { type: 'unhandledrejection' })
  })
}
