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
    // 重い CFR ライブ求解 (turn 完全チャンスCFR=全48 runout はローカル ~10s) があり、
    // 2コアの CI ランナーでは並列ワーカーの CPU 競合で更に伸びる。
    // CI 緑を安定させるため余裕を持って 45s に拡張 (デフォルト 5s)。
    testTimeout: 45000,
  },
})
