#!/usr/bin/env node
/**
 * プリフロップ実ソルバー解の取込スクリプト (ビルド時・Node 実行)。
 *
 *   npx tsx scripts/import-ranges.ts <input.csv> <spotId> --source <名前> --license <ライセンス> [--raise <BB>] [--url <URL>]
 *
 * CSV → NodeSolution(JSON, source: 'solver_precomputed') に変換し
 * src/data/solutions/preflop/<spotId>.json に出力する。
 * getSolution はこの JSON があれば手作り近似 (approximate) より優先採用する。
 *
 * ⚠ ライセンス (docs/DATA_LICENSE.md / docs/archive/RELEASE_READINESS.md L1):
 *    本アプリの方針は「自社ソルバーのみ」。他社ソルバー出力 (GTO Wizard / PioSOLVER 等) の
 *    商用再配布は規約・著作権違反の恐れがあるため **同梱禁止**。
 *    このスクリプトは --source / --license を必須とし、既知のプロプライエタリ出所は拒否する。
 *    自前生成データは --source 'self CFR' --license self-generated を使う。
 *
 * 期待する CSV フォーマット (1行=1ハンドカテゴリ):
 *   hand,raise,call,fold[,evRaise,evCall,evFold]
 *   AA,1.0,0,0,2.1,0,0
 *   AKs,1.0,0,0,...
 *   72o,0,0,1.0,...
 *   ※ 頻度は 0..1。EV 列は任意 (あれば solver_precomputed の実EVになる)。
 *
 * 現状この変換器は雛形であり、同梱データは無い (自社ソルバー生成待ち = R4)。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// 商用再配布できない既知のプロプライエタリ出所 (部分一致で拒否)。docs/DATA_LICENSE.md L1。
const FORBIDDEN_SOURCES = ['gto wizard', 'gtowizard', 'piosolver', 'pio solver', 'simple postflop', 'monkersolver', 'monker']

interface ActionSolution {
  action: 'fold' | 'check' | 'call' | 'raise'
  sizeBB?: number
  frequency: number
  ev: number
}
interface NodeSolution {
  street: 'preflop'
  spotId: string
  strategy: Record<string, ActionSolution[]>
  potBB: number
  source: 'solver_precomputed'
  meta: { sourceName: string; license: string; sourceUrl?: string; version: string }
}

// --flag value 形式の最小パーサ。位置引数 (csv/spotId) は別途取得する。
function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function parseCsv(text: string): Record<string, ActionSolution[]> {
  const strategy: Record<string, ActionSolution[]> = {}
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
  const header = lines[0].toLowerCase().includes('hand') ? lines.shift() : null
  void header
  return lines.reduce((acc, line) => {
    const [hand, raise, call, fold, evR, evC, evF] = line.split(',').map(s => s.trim())
    const acts: ActionSolution[] = []
    const r = Number(raise), c = Number(call), f = Number(fold)
    if (r > 0) acts.push({ action: 'raise', frequency: r, ev: Number(evR ?? 0) })
    if (c > 0) acts.push({ action: 'call', frequency: c, ev: Number(evC ?? 0) })
    if (f > 0) acts.push({ action: 'fold', frequency: f, ev: Number(evF ?? 0) })
    if (acts.length) acc[hand] = acts
    return acc
  }, strategy)
}

function main() {
  // 位置引数は flag を除いて先頭2つ (csv, spotId)。
  const positional = process.argv.slice(2).filter((a: string, i: number, arr: string[]) => !a.startsWith('--') && !arr[i - 1]?.startsWith('--'))
  const [csvPath, spotId] = positional
  const sourceName = getFlag('source')
  const license = getFlag('license')
  const sourceUrl = getFlag('url')
  const raiseSize = getFlag('raise')

  const usage = 'usage: tsx scripts/import-ranges.ts <input.csv> <spotId> --source <名前> --license <ライセンス> [--raise <BB>] [--url <URL>]'
  if (!csvPath || !spotId) {
    console.error(usage)
    process.exit(1)
    return
  }
  // L1: 出所とライセンスの明記を強制する (商用再配布の根幹)。
  if (!sourceName || !license) {
    console.error('error: --source と --license は必須です (docs/DATA_LICENSE.md L1)。\n' + usage)
    process.exit(1)
    return
  }
  // L1: 商用再配布できない既知のプロプライエタリ出力を拒否する。
  const lower = `${sourceName} ${license}`.toLowerCase()
  const hit = FORBIDDEN_SOURCES.find(f => lower.includes(f))
  if (hit) {
    console.error(`error: "${hit}" 由来のデータは商用再配布できないため取込を拒否しました (docs/DATA_LICENSE.md L1)。\n自社ソルバー生成 (--license self-generated) か商用可ライセンスのデータを使ってください。`)
    process.exit(1)
  }

  const text = readFileSync(csvPath, 'utf8')
  const strategy = parseCsv(text)
  // raise の sizeBB を付与 (引数で指定)
  if (raiseSize) {
    for (const acts of Object.values(strategy))
      for (const a of acts) if (a.action === 'raise') a.sizeBB = Number(raiseSize)
  }
  const node: NodeSolution = {
    street: 'preflop', spotId, strategy, potBB: 1.5,
    source: 'solver_precomputed',
    meta: { sourceName, license, ...(sourceUrl ? { sourceUrl } : {}), version: '1' },
  }
  const out = resolve(process.cwd(), `src/data/solutions/preflop/${spotId}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(node, null, 2))
  console.log(`wrote ${out} (${Object.keys(strategy).length} hands, source="${sourceName}", license="${license}")`)
}

main()
