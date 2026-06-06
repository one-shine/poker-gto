// ビルド後フック: public/sw.js のプレースホルダ (__CACHE_VERSION__ / __PRECACHE_FONTS__) を
// dist の実値へ置換する。@fontsource の woff2 は Vite がハッシュ付きで emit するため、
// SHELL への手書き列挙は不可。ここで dist/assets/*.woff2 を走査してプリキャッシュ配列へ注入する。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const swPath = join(dist, 'sw.js')

if (!existsSync(swPath)) {
  console.error(`[inject-sw-precache] ${swPath} が見つかりません。vite build が完了しているか確認してください。`)
  process.exit(1)
}

const assetsDir = join(dist, 'assets')
const fonts = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter(f => f.endsWith('.woff2')).map(f => `./assets/${f}`)
  : []

let sw = readFileSync(swPath, 'utf8')
sw = sw
  .replace('__CACHE_VERSION__', `gto-lab-${Date.now()}`)
  .replace('__PRECACHE_FONTS__', JSON.stringify(fonts))
writeFileSync(swPath, sw)

console.log(`[inject-sw-precache] sw.js に ${fonts.length} 件のフォント資産をプリキャッシュ注入しました。`)
