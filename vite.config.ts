import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri 連携: dev ログを潰さない / dev サーバのポート固定 / TAURI_ENV_* を露出
  clearScreen: false,
  server: { strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
})
