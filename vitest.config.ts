import { defineConfig } from 'vitest/config'

// テスト設定は vite.config.ts と分離する。
// rolldown ベースの vite 8 と vitest 同梱 vite の Plugin 型が衝突するため、
// プラグイン (react/tailwind) は vite.config.ts 側に置き、ここには test のみ書く。
// JSX 変換は tsconfig の jsx: react-jsx を vitest (esbuild) が解釈する。
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // R15-A: コンボ上限 100→200 で turn/river の live solve が ~3s に伸びる。
    // 並列実行時の余裕を含めて 15s に拡張 (デフォルト 5s)。
    testTimeout: 15000,
  },
})
