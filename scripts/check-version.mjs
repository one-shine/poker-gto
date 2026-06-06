#!/usr/bin/env node
/**
 * バージョン整合チェック。package.json を単一の正とし、tauri.conf.json と一致することを保証する。
 * 引数に tag (例 v0.1.0) を渡すと tag とも照合する (release.yml が利用)。
 *
 *   node scripts/check-version.mjs            # package.json === tauri.conf.json
 *   node scripts/check-version.mjs v0.1.0     # ↑ + tag(0.1.0) === package.json
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

const pkg = read('package.json').version
const tauri = read('src-tauri/tauri.conf.json').version
const tag = process.argv[2]?.replace(/^v/, '')

const problems = []
if (pkg !== tauri) problems.push(`package.json(${pkg}) != src-tauri/tauri.conf.json(${tauri})`)
if (tag && tag !== pkg) problems.push(`tag(${tag}) != package.json(${pkg})`)

if (problems.length) {
  console.error('✗ version mismatch:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log(`✓ version OK: ${pkg}${tag ? ` (tag v${tag})` : ''}`)
