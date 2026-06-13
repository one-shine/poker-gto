/**
 * Phase C: プリフロップ「モデル内Nash」求解オーケストレータ (R4)。
 *
 *   npx tsx scripts/solve-preflop-nash.ts [--pf-iters 6000] [--eq-iters 2500] [--seed 1]
 *                                         [--model <dir>] [--out] [--help]
 *
 * 各 (opener vs BB) ペアを preflopModelGame.solvePreflopNash で解き、open/defend/3bet/4bet の
 * カテゴリ別頻度と EV を求める。候補レンジを scripts/out/preflop-nash/ に書き出し (--out 時)、
 * 既知 GTO アンカー + 手作りレンジ幅との差分レポートをコンソールに出す。採用は判断ゲート
 * (C-2a/C-2b) を経てから src/data/solutions/preflop/ へ。本スクリプトは src/ を変更しない。
 *
 * 外側反復: 出力レンジを build-postflop-ev の求解レンジに使って Phase B を再量産 → 本スクリプト
 * を再実行、を繰り返すと被覆が広がりアンカーが厳密化する (収束まで 1-2 周)。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { solvePreflopNash, rangeWidthPct, type SpotModels, type SpotSizing } from '../src/lib/solver/preflopModelGame.ts'
import { parsePostflopEvModel, heroValueMatrix, heroSupportVector, type PostflopEvModel } from '../src/lib/solver/attachModelEV.ts'
import { CATEGORIES } from '../src/lib/solver/pushFold.ts'
import { buildEquityMatrix } from '../src/lib/solver/preflopEquity.ts'
import { PREFLOP_SCENARIOS } from '../src/data/ranges/preflop.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'out/preflop-nash')
const MODEL_DIR_DEFAULT = resolve(__dirname, 'data/postflop-ev-model')

const BLIND: Record<string, number> = { BB: 1.0, SB: 0.5, BTN: 0, CO: 0, MP: 0, UTG: 0 }
const THREE_BET_BB = 11
const STACK_BB = 100

// opener vs BB の主要 5 ペア。srp/3bet モデルの potKey と各視点の RangeScenario id。
interface Pair {
  opener: string; openerPos: string; defender: string; facing: string
  openBB: number; srpKey: string; tbKey?: string
  anchorOpen: [number, number]; anchorDefend: [number, number]
}
const PAIRS: Pair[] = [
  { opener: 'btn-open', openerPos: 'BTN', defender: 'bb-vs-btn', facing: 'btn-vs-bb-3bet', openBB: 2.5, srpKey: 'srp-btn-bb', tbKey: '3bp-bb-vs-btn', anchorOpen: [40, 50], anchorDefend: [55, 68] },
  { opener: 'co-open',  openerPos: 'CO',  defender: 'bb-vs-co',  facing: 'co-vs-bb-3bet',  openBB: 2.5, srpKey: 'srp-co-bb',  tbKey: '3bp-bb-vs-co',  anchorOpen: [25, 32], anchorDefend: [48, 60] },
  { opener: 'mp-open',  openerPos: 'MP',  defender: 'bb-vs-mp',  facing: 'mp-vs-bb-3bet',  openBB: 2.5, srpKey: 'srp-mp-bb',  anchorOpen: [16, 21], anchorDefend: [42, 55] },
  { opener: 'utg-open', openerPos: 'UTG', defender: 'bb-vs-utg', facing: 'utg-vs-bb-3bet', openBB: 2.5, srpKey: 'srp-utg-bb', anchorOpen: [13, 17], anchorDefend: [40, 52] },
  { opener: 'sb-open',  openerPos: 'SB',  defender: 'bb-vs-sb',  facing: 'sb-vs-bb-3bet',  openBB: 3.0, srpKey: 'srp-sb-bb',  anchorOpen: [35, 48], anchorDefend: [45, 62] },
]

function flag(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

function loadModels(dir: string): Map<string, PostflopEvModel> {
  const map = new Map<string, PostflopEvModel>()
  if (!existsSync(dir)) return map
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    try {
      const m = parsePostflopEvModel(JSON.parse(readFileSync(resolve(dir, f), 'utf8')))
      map.set(m.potKey, m)
    } catch { /* skip */ }
  }
  return map
}

// 手作りレンジ (raise+call 継続) の widthPct — 比較用。
function handBuiltWidth(scenarioId: string, kind: 'open' | 'defend'): number | null {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  if (!sc) return null
  const freq = new Float64Array(CATEGORIES.length)
  for (let c = 0; c < CATEGORIES.length; c++) {
    const cell = sc.cells[CATEGORIES[c]]
    if (!cell) continue
    freq[c] = kind === 'open' ? cell.raise : (cell.raise + cell.call)
  }
  return rangeWidthPct(freq)
}

function mark(v: number, [lo, hi]: [number, number]): string {
  return v >= lo && v <= hi ? '✓' : '⚠'
}

function main(): void {
  if (process.argv.includes('--help')) {
    console.log('npx tsx scripts/solve-preflop-nash.ts [--pf-iters 6000] [--eq-iters 2500] [--seed 1] [--model <dir>] [--out]')
    return
  }
  const pfIters = Number(flag('pf-iters', '6000'))
  const eqIters = Number(flag('eq-iters', '2500'))
  const seed = Number(flag('seed', '1'))
  const modelDir = flag('model', MODEL_DIR_DEFAULT)
  const writeOut = process.argv.includes('--out')

  const eqCache = resolve(__dirname, `.cache/preflop-equity-${eqIters}-${seed}.json`)
  const eq: number[][] = existsSync(eqCache)
    ? JSON.parse(readFileSync(eqCache, 'utf8'))
    : buildEquityMatrix(eqIters, seed)
  console.log(`equity: ${existsSync(eqCache) ? 'cache' : 'built'} (${eqIters} iters)`)

  const models = loadModels(modelDir)
  console.log(`models: ${models.size} 件 読込 (${modelDir})\n`)

  if (writeOut) mkdirSync(OUT_DIR, { recursive: true })

  console.log('─'.repeat(92))
  console.log('  ペア            exploit   open%(anchor)        BB defend%(anchor)     3bet%   4bet%')
  console.log('─'.repeat(92))

  for (const p of PAIRS) {
    const srp = models.get(p.srpKey)
    const tb = p.tbKey ? models.get(p.tbKey) : undefined
    const m: SpotModels = {
      vSrpO: srp ? heroValueMatrix(srp, p.opener) : null,    sSrpO: srp ? heroSupportVector(srp, p.opener) : null,
      vSrpD: srp ? heroValueMatrix(srp, p.defender) : null,  sSrpD: srp ? heroSupportVector(srp, p.defender) : null,
      vTbO: tb ? heroValueMatrix(tb, p.facing) : null,       sTbO: tb ? heroSupportVector(tb, p.facing) : null,
      vTbD: tb ? heroValueMatrix(tb, p.defender) : null,     sTbD: tb ? heroSupportVector(tb, p.defender) : null,
    }
    const deadMoney = p.openerPos === 'SB' ? 0 : 0.5 // defender=BB なので SB のみ dead (opener=SB の時は無し)
    const s: SpotSizing = {
      openBB: p.openBB, threeBetBB: THREE_BET_BB,
      blindO: BLIND[p.openerPos] ?? 0, blindD: BLIND.BB,
      deadMoney, stackBB: STACK_BB,
      srpPotBB: srp?.potBB ?? (2 * p.openBB + deadMoney),
      tbPotBB: tb?.potBB ?? (2 * THREE_BET_BB + deadMoney),
    }
    const r = solvePreflopNash(eq, s, m, pfIters)

    const openW = rangeWidthPct(r.openerStrategy.open)
    const cont = Float64Array.from({ length: CATEGORIES.length }, (_, c) => r.defenderStrategy.call[c] + r.defenderStrategy.threeBet[c])
    const defW = rangeWidthPct(cont)
    const tbW = rangeWidthPct(r.defenderStrategy.threeBet)
    const fbW = rangeWidthPct(r.openerStrategy.fourBet)
    const hbOpen = handBuiltWidth(p.opener, 'open')

    console.log(
      `  ${p.opener.padEnd(14)} ${r.exploitability.toFixed(4)}   ` +
      `${openW.toFixed(1)}${mark(openW, p.anchorOpen)}(${p.anchorOpen[0]}-${p.anchorOpen[1]}) hb=${hbOpen}   ` +
      `${defW.toFixed(1)}${mark(defW, p.anchorDefend)}(${p.anchorDefend[0]}-${p.anchorDefend[1]})   ` +
      `${tbW.toFixed(1)}   ${fbW.toFixed(1)}` +
      (tb ? '' : '  [3betモデル無=fallback]'),
    )

    if (writeOut) {
      const dump = {
        opener: p.opener, defender: p.defender, facing: p.facing,
        exploitability: r.exploitability, iters: pfIters,
        open: cats(r.openerStrategy.open), facing3betCall: cats(r.openerStrategy.facing3betCall), fourBet: cats(r.openerStrategy.fourBet),
        defendCall: cats(r.defenderStrategy.call), defend3bet: cats(r.defenderStrategy.threeBet), facing4betCall: cats(r.defenderStrategy.facing4betCall),
      }
      writeFileSync(resolve(OUT_DIR, `${p.opener}__vs__${p.defender}.json`), JSON.stringify(dump, null, 1))
    }
  }
  console.log('─'.repeat(92))
  console.log(writeOut ? `\n候補レンジ書出: ${OUT_DIR}` : '\n(--out で候補レンジを書き出し)')
  console.log('⚠ = 既知GTOアンカー外。被覆律速の影響は外側反復 (Phase B 再量産→再求解) で縮小する。')
}

function cats(freq: Float64Array): Record<string, number> {
  const out: Record<string, number> = {}
  for (let c = 0; c < CATEGORIES.length; c++) out[CATEGORIES[c]] = +freq[c].toFixed(4)
  return out
}

const isEntry = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) main()
