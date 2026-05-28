#!/usr/bin/env node
/**
 * PWA / favicon の PNG アイコン生成 (R27)。
 *
 *   npx tsx scripts/build-icons.ts
 *
 * `public/favicon.svg` をベースに、PWA 必須サイズ (192 / 512) を maskable に対応した PNG として書き出す。
 * maskable では OS が任意の形 (円・squircle 等) でクロップするため、安全域 = 中央 80% の中だけにアイコンを置く。
 * 背景はテーマ色 (`manifest.json` theme_color = #18181b) で塗り、余白を確保する。
 *
 * 出力:
 *   public/icon-192.png  (192×192, maskable)
 *   public/icon-512.png  (512×512, maskable)
 *   public/apple-touch-icon.png (180×180, iOS, 透過不要)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const SVG_PATH = resolve(process.cwd(), 'public/favicon.svg')
const OUT_192 = resolve(process.cwd(), 'public/icon-192.png')
const OUT_512 = resolve(process.cwd(), 'public/icon-512.png')
const OUT_APPLE = resolve(process.cwd(), 'public/apple-touch-icon.png')

const BG = '#18181b' // base-900 (テーマ色)
const SAFE_RATIO = 0.65 // 安全域 (maskable で OS クロップ後に常に見える領域)

async function buildIcon(size: number, outPath: string, bg = BG): Promise<void> {
  const svg = readFileSync(SVG_PATH)
  const iconPx = Math.round(size * SAFE_RATIO)
  const offset = Math.round((size - iconPx) / 2)
  const fg = await sharp(svg).resize(iconPx, iconPx, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: fg, top: offset, left: offset }])
    .png()
    .toFile(outPath)
  console.log(`  wrote ${outPath} (${size}×${size}, safe=${iconPx}px)`)
}

async function main() {
  await buildIcon(192, OUT_192)
  await buildIcon(512, OUT_512)
  await buildIcon(180, OUT_APPLE) // Apple Touch (透過/maskable 共に動作)
  // SVG はそのまま残す (Chrome の "any" 用途 + ベクター)
  writeFileSync(SVG_PATH, readFileSync(SVG_PATH)) // touch (no-op)
  console.log('done.')
}

main().catch(e => { console.error(e); process.exit(1) })
