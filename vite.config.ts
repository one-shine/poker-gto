import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages プロジェクトサイトはサブパス配信(/poker-gto/)。資産参照をこの接頭辞で解決する。
  // custom domain で root 配信にする場合は '/' に戻すだけ(manifest/sw は相対パスで base 非依存)。
  base: '/poker-gto/',
  plugins: [react(), tailwindcss()],
  // Tauri 連携: dev ログを潰さない / dev サーバのポート固定 / TAURI_ENV_* を露出
  clearScreen: false,
  server: { strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
})
