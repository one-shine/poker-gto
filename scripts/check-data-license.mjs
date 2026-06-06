#!/usr/bin/env node
/**
 * データライセンス検証(DATA_LICENSE.md L1)。同梱する全ソルバー解 JSON の
 * meta.license が自社所有(self-generated / original)であることをビルド/CI で強制する。
 * 他社ソルバー出力(GTO Wizard 等)の誤混入を仕組みで防ぐ。
 *
 *   node scripts/check-data-license.mjs
 *
 * ※ 将来、正当にライセンスされた外部データセットを同梱する場合は ALLOWED に
 *    その license 名(例 'CC-BY-4.0')を追加する。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOLUTIONS_DIR = resolve(root, 'src/data/solutions')
const ALLOWED = new Set(['self-generated', 'original'])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}

const files = walk(SOLUTIONS_DIR)
const violations = []
for (const f of files) {
  let json
  try {
    json = JSON.parse(readFileSync(f, 'utf8'))
  } catch {
    violations.push(`${f}: JSON parse 失敗`)
    continue
  }
  const license = json.meta?.license ?? json.license ?? json.metadata?.license
  if (!license) violations.push(`${f.replace(root + '/', '')}: license 欠落`)
  else if (!ALLOWED.has(license)) {
    violations.push(`${f.replace(root + '/', '')}: license="${license}" は許可外(self-generated / original のみ)`)
  }
}

if (violations.length) {
  console.error(`✗ データライセンス違反 ${violations.length} 件(DATA_LICENSE.md L1):`)
  for (const v of violations.slice(0, 20)) console.error('  ' + v)
  if (violations.length > 20) console.error(`  ...他 ${violations.length - 20} 件`)
  process.exit(1)
}
console.log(`✓ data license OK: ${files.length} ファイル全て self-generated / original`)
