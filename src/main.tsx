import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// セルフホストフォント: @font-face を Tailwind 出力(index.css)より先に登録するためここで集約 import
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/zen-kaku-gothic-new/japanese-400.css'
import '@fontsource/zen-kaku-gothic-new/japanese-500.css'
import '@fontsource/zen-kaku-gothic-new/japanese-700.css'
import '@fontsource/zen-kaku-gothic-new/latin-400.css'
import '@fontsource/zen-kaku-gothic-new/latin-500.css'
import '@fontsource/zen-kaku-gothic-new/latin-700.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/error/ErrorBoundary.tsx'
import { initErrorReporting } from './lib/monitoring/reporter.ts'

initErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA: Service Worker 登録 (本番ビルドのみ。dev では HMR 干渉を避ける)
// Tauri(ネイティブ)配下では登録しない: 資産はバイナリ同梱で SW 不要、かつ tauri:// で stale/ルーティング問題を避ける。
const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || 'isTauri' in window)
if (import.meta.env.PROD && !isTauri && 'serviceWorker' in navigator) {
  // 新版デプロイを確実に取り込む (旧版が stale キャッシュで残る問題の対策):
  //  - updateViaCache:'none' で sw.js を常にネットワークから取得 (HTTP キャッシュ越しの更新遅延を防ぐ)
  //  - 新 SW が制御を握ったら一度だけ自動リロードして新チャンクに差し替える (初回インストール時は除く)
  //  - 復帰/フォーカス時に update() で更新チェック (アプリを開きっぱなしでも新版を拾う)
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    // 初回インストール(最初から未制御)の claim はリロード不要。更新時のみリロードする。
    if (!hadController) return
    refreshing = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    // base 配下に配信される sw.js を登録(Pages のサブパス配信に対応)。scope も base に合わせる。
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
      .then(reg => {
        reg.update().catch(() => {}) // 起動直後に一度チェック
        // アプリ復帰/可視化のたびに更新チェック (開きっぱなしの PWA でも新版を拾う)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      })
      .catch(() => { /* 登録失敗は致命的でない */ })
  })
}
