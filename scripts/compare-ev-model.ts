#!/usr/bin/env node
/**
 * heuristic EV と model EV を同一スポット集合で比較する検証スクリプト (Phase B)。
 *
 *   npx tsx scripts/compare-ev-model.ts --model <dir> [--eq-iters 2500] [--factor 30]
 *
 * スポットごとに出力:
 *   (a) カテゴリ別 EV (raise/call 等) のピアソン相関 (heuristic vs model)
 *   (b) 主要アンカー (AA/KK/AKs/72o) の EV 対比
 *   (c) 符号反転したカテゴリ数 (heuristic と model で正負が逆転する手の数)
 *
 * 相関 < 0.7 のスポットには警告マーク (⚠) を表示する。
 * ファイル生成なし (コンソール出力のみ)。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { buildEquityMatrix } from '../src/lib/solver/preflopEquity.ts'
import { PREFLOP_SCENARIOS } from '../src/data/ranges/preflop.ts'
import { CATEGORIES } from '../src/lib/solver/pushFold.ts'
import {
  computeHeuristicEV, buildCallerCallFreq,
  computeDefenderHeuristicEV, buildOpenerRaiseFreq,
  buildOpenerResponseFreqs, computeOpenerFacing3betEV,
  type DefenderEVOptions,
} from '../src/lib/solver/attachHeuristicEV.ts'
import {
  parsePostflopEvModel, computeModelEV, computeDefenderModelEV, computeOpenerFacing3betModelEV,
  type PostflopEvModel, type DefenderModels, type Facing3betModels,
} from '../src/lib/solver/attachModelEV.ts'
import type { NodeSolution } from '../src/types/solver.ts'
import type { RangeScenario } from '../src/types/ranges.ts'

// ── CLI パーサ ─────────────────────────────────────────────────────────────────

function flag(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

function flagOpt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined
}

function printHelp(): void {
  console.log(`\
使い方:
  npx tsx scripts/compare-ev-model.ts --model <dir> [オプション]

必須引数:
  --model <dir>   postflop-ev-model ディレクトリ (*.json を parsePostflopEvModel で読み込む)

オプション:
  --eq-iters <n>  エクイティ MC 反復数 (既定 2500)
  --factor <n>    ポストフロップ係数 F (既定 30)
  --seed <n>      RNG シード (既定 1)
  --help          このヘルプを表示

出力: コンソールのみ (ファイル生成なし)
  スポットごとに (a) カテゴリ別 EV のピアソン相関 (b) アンカー EV 対比 (c) 符号反転カテゴリ数
  相関 < 0.7 のスポットは ⚠ マークで警告

スポット集合: precompute-preflop-ev.ts と同一 (OPENER_TO_CALLER + DEFENDER_TO_OPENER + FACING3BET_TO_3BETTER)
`)
}

// ── 定数 (precompute-preflop-ev.ts と同一) ────────────────────────────────────

const OPENER_TO_CALLER: Record<string, string> = {
  'btn-open': 'bb-vs-btn',
  'co-open': 'bb-vs-co',
  'mp-open': 'bb-vs-mp',
  'utg-open': 'bb-vs-utg',
  'sb-open': 'bb-vs-sb',
}

const DEFENDER_TO_OPENER: Record<string, string> = {
  'sb-vs-btn': 'btn-open',
  'sb-vs-co': 'co-open',
  'btn-vs-co': 'co-open',
  'btn-vs-utg': 'utg-open',
  'btn-vs-mp': 'mp-open',
  'co-vs-utg': 'utg-open',
}

const DEFENDER_TO_FACING3BET: Record<string, string> = {
  'bb-vs-btn': 'btn-vs-bb-3bet',
  'bb-vs-co': 'co-vs-bb-3bet',
  'sb-vs-btn': 'btn-vs-sb-3bet',
  'sb-vs-co': 'co-vs-sb-3bet',
  'btn-vs-co': 'co-vs-btn-3bet',
  'bb-vs-mp': 'mp-vs-bb-3bet',
  'bb-vs-utg': 'utg-vs-bb-3bet',
  'bb-vs-sb': 'sb-vs-bb-3bet',
  'btn-vs-utg': 'utg-vs-btn-3bet',
  'btn-vs-mp': 'mp-vs-btn-3bet',
  'co-vs-utg': 'utg-vs-co-3bet',
}

const FACING3BET_TO_3BETTER: Record<string, string> = {
  'btn-vs-sb-3bet': 'sb-vs-btn',
  'btn-vs-bb-3bet': 'bb-vs-btn',
  'co-vs-sb-3bet': 'sb-vs-co',
  'co-vs-bb-3bet': 'bb-vs-co',
  'co-vs-btn-3bet': 'btn-vs-co',
  'utg-vs-bb-3bet': 'bb-vs-utg',
  'utg-vs-btn-3bet': 'btn-vs-utg',
  'utg-vs-co-3bet': 'co-vs-utg',
  'mp-vs-bb-3bet': 'bb-vs-mp',
  'mp-vs-btn-3bet': 'btn-vs-mp',
  'sb-vs-bb-3bet': 'bb-vs-sb',
}

const BLIND_POSTED: Record<string, number> = { BB: 1.0, SB: 0.5, BTN: 0, CO: 0, MP: 0, UTG: 0 }
const THREE_BET_BB = 11
const F3 = 45
const F4 = 60

// ── モデルロード ───────────────────────────────────────────────────────────────

function loadModels(dir: string): Map<string, PostflopEvModel> {
  const absDir = resolve(process.cwd(), dir)
  if (!existsSync(absDir)) {
    console.error(`エラー: --model に指定したディレクトリが存在しません: ${absDir}`)
    console.error('  量産が完了してから実行してください。')
    process.exit(1)
  }
  const files = readdirSync(absDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) {
    console.error(`エラー: ${absDir} に *.json が見当たりません。`)
    process.exit(1)
  }
  const map = new Map<string, PostflopEvModel>()
  for (const f of files) {
    const raw = JSON.parse(readFileSync(resolve(absDir, f), 'utf8')) as unknown
    let model: PostflopEvModel
    try {
      model = parsePostflopEvModel(raw)
    } catch (e) {
      console.warn(`  スキップ(パースエラー): ${f} — ${(e as Error).message}`)
      continue
    }
    if (!map.has(model.oopId)) map.set(model.oopId, model)
    if (!map.has(model.ipId))  map.set(model.ipId, model)
  }
  return map
}

function buildDefenderModels(defId: string, models: Map<string, PostflopEvModel>): DefenderModels {
  const srp = models.get(defId)
  const tb  = [...models.values()].find(m => m.potType === '3bet' && (m.oopId === defId || m.ipId === defId))
  return {
    srp:      srp?.potType === 'srp'   ? srp : undefined,
    threeBet: tb,
  }
}

function buildFacing3betModels(facingId: string, models: Map<string, PostflopEvModel>): Facing3betModels {
  const tb = [...models.values()].find(m => m.potType === '3bet' && (m.oopId === facingId || m.ipId === facingId))
  return { threeBet: tb }
}

// defender の 3bet EV オプション (precompute-preflop-ev.ts と同一ロジック)
function threeBetOpts(defender: RangeScenario, opener: RangeScenario): Partial<DefenderEVOptions> {
  const facingId = DEFENDER_TO_FACING3BET[defender.id]
  if (!facingId) return {}
  const facing = PREFLOP_SCENARIOS.find(s => s.id === facingId)
  if (!facing) return {}
  return {
    openerResponse: buildOpenerResponseFreqs(facing),
    openerOpenFreq: buildOpenerRaiseFreq(opener),
    openBB: opener.raiseSize,
    threeBetBB: THREE_BET_BB,
    heroBlindPosted: BLIND_POSTED[defender.position] ?? 0,
    threeBetFactor: F3,
    fourBetFactor: F4,
  }
}

// ── EV ベクトル抽出: NodeSolution からカテゴリ別 raise/call EV を返す ──────────

// 各カテゴリの「主要アクション EV」。raise > call の順で最初に見つかったものを使う。
// fold = 定数になることが多いので除外する (相対 EV の比較が目的)。
function extractPrimaryEV(node: NodeSolution): Map<string, number> {
  const out = new Map<string, number>()
  for (const [hand, acts] of Object.entries(node.strategy)) {
    const primary = acts.find(a => a.action === 'raise') ?? acts.find(a => a.action === 'call')
    if (primary) out.set(hand, primary.ev)
  }
  return out
}

// ── 統計ユーティリティ ─────────────────────────────────────────────────────────

function pearsonCorr(xs: number[], ys: number[]): number {
  if (xs.length < 2) return NaN
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, sx = 0, sy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    num += dx * dy; sx += dx * dx; sy += dy * dy
  }
  const denom = Math.sqrt(sx * sy)
  return denom === 0 ? NaN : num / denom
}

// ── 結果表示ヘルパー ───────────────────────────────────────────────────────────

const ANCHORS = ['AA', 'KK', 'AKs', '72o']

interface SpotResult {
  spotId: string
  corr: number
  signFlips: number
  anchors: { hand: string; hEV: number | null; mEV: number | null }[]
}

function formatCorr(r: number): string {
  if (isNaN(r)) return '   N/A'
  return r.toFixed(4).padStart(7)
}

function printResults(results: SpotResult[]): void {
  const WARN = 0.7
  console.log('\n' + '─'.repeat(80))
  console.log('  スポット                相関(r)   符号反転  ' + ANCHORS.map(h => h.padEnd(10)).join(''))
  console.log('─'.repeat(80))

  for (const r of results) {
    const warnMark = !isNaN(r.corr) && r.corr < WARN ? ' ⚠' : '  '
    const anchorStr = r.anchors.map(a => {
      if (a.hEV == null && a.mEV == null) return '  ---       '
      const h = a.hEV != null ? a.hEV.toFixed(2) : '  ---'
      const m = a.mEV != null ? a.mEV.toFixed(2) : '  ---'
      return `h${h}/m${m}`.padEnd(12)
    }).join('')
    console.log(
      `${warnMark} ${r.spotId.padEnd(22)} ${formatCorr(r.corr)}${warnMark.trim() ? '⚠' : ' '}  ${String(r.signFlips).padStart(5)}     ${anchorStr}`
    )
  }
  console.log('─'.repeat(80))

  const warned = results.filter(r => !isNaN(r.corr) && r.corr < WARN)
  if (warned.length > 0) {
    console.log(`\n⚠ 相関 < ${WARN} のスポット (${warned.length}件):`)
    for (const r of warned) {
      console.log(`  - ${r.spotId}: r=${r.corr.toFixed(4)}`)
    }
  } else {
    console.log(`\n全スポットの相関 >= ${WARN}`)
  }
}

// ── メイン ─────────────────────────────────────────────────────────────────────

function main(): void {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  const modelDir = flagOpt('model')
  if (!modelDir) {
    console.error('エラー: --model <dir> は必須引数です。')
    console.error('  npx tsx scripts/compare-ev-model.ts --model scripts/data/postflop-ev-model')
    process.exit(1)
  }

  const eqIters = Number(flag('eq-iters', '2500'))
  const factor  = Number(flag('factor', '30'))
  const seed    = Number(flag('seed', '1'))

  const models = loadModels(modelDir)
  console.log(`model: ${models.size} エントリ読み込み済み`)

  // equity キャッシュ (precompute-preflop-ev.ts と同一)
  const cachePath = resolve(process.cwd(), `scripts/.cache/preflop-equity-${eqIters}-${seed}.json`)
  let eq: number[][]
  if (existsSync(cachePath)) {
    console.log(`equity: キャッシュ読込 ${cachePath}`)
    eq = JSON.parse(readFileSync(cachePath, 'utf8')) as number[][]
  } else {
    console.log(`equity: MC 構築 (${eqIters} iters, seed=${seed}) …`)
    const t0 = Date.now()
    eq = buildEquityMatrix(eqIters, seed)
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(eq))
    console.log(`equity: 完了 ${Math.round((Date.now() - t0) / 1000)}s`)
  }

  const results: SpotResult[] = []

  // ── opener スポット ──────────────────────────────────────────────────────────
  for (const [openerId, callerId] of Object.entries(OPENER_TO_CALLER)) {
    const opener = PREFLOP_SCENARIOS.find(s => s.id === openerId)
    const caller = PREFLOP_SCENARIOS.find(s => s.id === callerId)
    if (!opener || !caller) continue
    const callerCallFreq = buildCallerCallFreq(caller)

    const hNode = computeHeuristicEV(opener, eq, callerCallFreq, { postflopFactor: factor })
    const mNode = computeModelEV(opener, eq, callerCallFreq, models.get(openerId), { postflopFactor: factor })

    results.push(compareNodes(openerId, hNode, mNode))
  }

  // ── defender (BB-vs-X) スポット ─────────────────────────────────────────────
  for (const [openerId, callerId] of Object.entries(OPENER_TO_CALLER)) {
    const opener = PREFLOP_SCENARIOS.find(s => s.id === openerId)
    const caller = PREFLOP_SCENARIOS.find(s => s.id === callerId)
    if (!opener || !caller) continue
    const openerRaiseFreq = buildOpenerRaiseFreq(opener)
    const defOpts: DefenderEVOptions = { postflopFactor: factor, ...threeBetOpts(caller, opener) }

    const hNode = computeDefenderHeuristicEV(caller, openerRaiseFreq, eq, defOpts)
    const mNode = computeDefenderModelEV(caller, openerRaiseFreq, eq, buildDefenderModels(callerId, models), defOpts)

    results.push(compareNodes(callerId, hNode, mNode))
  }

  // ── 非BB defender スポット ───────────────────────────────────────────────────
  for (const [defId, openerId] of Object.entries(DEFENDER_TO_OPENER)) {
    const defender = PREFLOP_SCENARIOS.find(s => s.id === defId)
    const opener   = PREFLOP_SCENARIOS.find(s => s.id === openerId)
    if (!defender || !opener) continue
    const openerRaiseFreq = buildOpenerRaiseFreq(opener)
    const foldCost = defender.position === 'SB' ? 0.5 : 1.0
    const defOpts: DefenderEVOptions = {
      postflopFactor: factor, bbBlind: foldCost, ...threeBetOpts(defender, opener),
    }

    const hNode = computeDefenderHeuristicEV(defender, openerRaiseFreq, eq, defOpts)
    const mNode = computeDefenderModelEV(defender, openerRaiseFreq, eq, buildDefenderModels(defId, models), defOpts)

    results.push(compareNodes(defId, hNode, mNode))
  }

  // ── facing-3bet スポット ─────────────────────────────────────────────────────
  for (const [facingId, threeBetterId] of Object.entries(FACING3BET_TO_3BETTER)) {
    const facing     = PREFLOP_SCENARIOS.find(s => s.id === facingId)
    const threeBetter = PREFLOP_SCENARIOS.find(s => s.id === threeBetterId)
    if (!facing || !threeBetter) continue
    const villain3betFreq = buildOpenerRaiseFreq(threeBetter)
    const openerOpen = PREFLOP_SCENARIOS.find(s => s.id === `${facing.position.toLowerCase()}-open`)
    const f3Opts = {
      openBB: openerOpen?.raiseSize ?? 2.5,
      threeBetBB: THREE_BET_BB,
      openerBlind: BLIND_POSTED[facing.position] ?? 0,
      threeBetterBlind: BLIND_POSTED[threeBetter.position] ?? 0,
      threeBetFactor: F3, fourBetFactor: F4, foldToFourBet: 0.55,
    }

    const hNode = computeOpenerFacing3betEV(facing, villain3betFreq, eq, f3Opts)
    const mNode = computeOpenerFacing3betModelEV(facing, villain3betFreq, eq, buildFacing3betModels(facingId, models), f3Opts)

    results.push(compareNodes(facingId, hNode, mNode))
  }

  printResults(results)
  console.log(`\n合計 ${results.length} スポット比較完了`)
}

// ── ノード比較コア ─────────────────────────────────────────────────────────────

function compareNodes(spotId: string, hNode: NodeSolution, mNode: NodeSolution): SpotResult {
  const hEVs = extractPrimaryEV(hNode)
  const mEVs = extractPrimaryEV(mNode)

  // 両ノードに共通するカテゴリを対象に相関・符号反転を計算
  const hands = CATEGORIES.filter(h => hEVs.has(h) && mEVs.has(h))
  const xs = hands.map(h => hEVs.get(h)!)
  const ys = hands.map(h => mEVs.get(h)!)

  const corr = pearsonCorr(xs, ys)
  const signFlips = xs.filter((x, i) => Math.sign(x) !== Math.sign(ys[i]) && x !== 0 && ys[i] !== 0).length

  const anchors = ANCHORS.map(hand => ({
    hand,
    hEV: hEVs.get(hand) ?? null,
    mEV: mEVs.get(hand) ?? null,
  }))

  return { spotId, corr, signFlips, anchors }
}

main()
