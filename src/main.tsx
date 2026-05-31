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
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 登録失敗は致命的でない */ })
  })
}
