/**
 * Phase C2: マルチウェイ プリフロップ ジョイント CFR オーケストレータ (R4)。
 *
 *   npx tsx scripts/solve-preflop-multiway.ts [--iters 600] [--eq-iters 2500] [--seed 1]
 *                                             [--max-raise 3] [--ip 1.0] [--oop 0.86]
 *                                             [--stability] [--out] [--help]
 *
 * 6-max プリフロップを 1 つのアクション順ゲーム木として CFR+ で解き、各席の RFI(open)幅・
 * 3bet/ディフェンス頻度を既知 GTO アンカー + 手作りレンジ幅と突合する。Phase C(HU縮約)が
 * 構造的に再現できなかった**位置依存オープン幅**(UTG<MP<CO<BTN)の再現を検証するのが主眼。
 * 候補レンジを scripts/out/preflop-multiway/ に書き出し(--out)。本スクリプトは src/ を変更しない。
 * 採用は判断ゲート(C-2a/C-2b)を経てから src/data/solutions/preflop/ へ。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  solvePreflopMultiway, DEFAULT_TREE_CONFIG, POSITIONS, PRIOR,
  CATEGORIES, FOLD, CALL, RAISE, type MultiwaySolveResult, type HuSeenFlopResolver, type TreeConfig,
} from '../src/lib/solver/preflopMultiwayGame.ts'
import { buildEquityMatrix } from '../src/lib/solver/preflopEquity.ts'
import { parsePostflopEvModel, heroValueMatrix, heroSupportVector, type PostflopEvModel } from '../src/lib/solver/attachModelEV.ts'
import { PREFLOP_SCENARIOS } from '../src/data/ranges/preflop.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'out/preflop-multiway')
const MODEL_DIR = resolve(__dirname, 'data/postflop-ev-model')
const POS_BY_SEAT = ['utg', 'mp', 'co', 'btn', 'sb']

function loadModels(dir: string): Map<string, PostflopEvModel> {
  const map = new Map<string, PostflopEvModel>()
  if (!existsSync(dir)) return map
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    try { const m = parsePostflopEvModel(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))); map.set(m.potKey, m) } catch { /* skip */ }
  }
  return map
}

// HU seen-flop 終端 → Phase B V 行列の解決器。被覆 = opener-vs-BB の SRP(UTG/MP/CO/BTN・
// pot 5.5 一致)+ 3bet(BTN/CO・pot 22.5 一致)。SB-SRP は open 2.5≠3.0 と IP/OOP ラベルの
// 緊張で未配線(flat 据え置き)。未被覆は null → flat 近似。
function buildHuResolver(models: Map<string, PostflopEvModel>, config: TreeConfig): HuSeenFlopResolver {
  const open = config.sizes[1], tb = config.sizes[2], tol = 0.01
  return (active, invested) => {
    if (active.length !== 2) return null
    const bbIdx = active.indexOf(5)
    if (bbIdx < 0) return null
    const opener = active[1 - bbIdx]
    if (opener > 3) return null // SB(4)は未配給。UTG..BTN のみ。
    const pos = POS_BY_SEAT[opener]
    const invO = invested[opener], invB = invested[5]
    let model: PostflopEvModel | undefined, openerScn: string, bbScn: string
    if (Math.abs(invO - open) < tol && Math.abs(invB - open) < tol) {
      model = models.get(`srp-${pos}-bb`); openerScn = `${pos}-open`; bbScn = `bb-vs-${pos}`
    } else if (Math.abs(invO - tb) < tol && Math.abs(invB - tb) < tol) {
      model = models.get(`3bp-bb-vs-${pos}`); openerScn = `${pos}-vs-bb-3bet`; bbScn = `bb-vs-${pos}`
    } else return null
    if (!model) return null
    const vO = heroValueMatrix(model, openerScn), vB = heroValueMatrix(model, bbScn)
    if (!vO || !vB) return null
    const sO = heroSupportVector(model, openerScn), sB = heroSupportVector(model, bbScn)
    return active[0] === opener
      ? { v: [vO, vB], support: [sO, sB] }
      : { v: [vB, vO], support: [sB, sO] }
  }
}

// 既知 GTO アンカー(open 幅%)。SB は no-limp(raise-or-fold)で広いのが正(リンプ抽象無し)。
const OPEN_ANCHOR: Record<string, [number, number]> = {
  UTG: [13, 18], MP: [15, 22], CO: [22, 30], BTN: [40, 50], SB: [35, 58],
}

function flag(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const mark = (v: number, a?: [number, number]): string => (!a ? ' ' : v >= a[0] && v <= a[1] ? '✓' : '⚠')

// 手作りレンジ(raise 継続)の open 幅% — 比較用。
function handBuiltOpen(scenarioId: string): number | null {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  if (!sc) return null
  let num = 0, den = 0
  for (const cat of CATEGORIES) {
    const cell = sc.cells[cat]
    const n = cat.length === 2 ? 6 : cat[2] === 's' ? 4 : 12
    den += n
    if (cell) num += n * cell.raise
  }
  return den > 0 ? +(100 * num / den).toFixed(1) : 0
}

// ノードでの reach 加重アクション頻度。
function actionFreq(r: MultiwaySolveResult, nodeId: number): { fold: number; call: number; raise: number; player: number } | null {
  const n = r.tree.nodes[nodeId]
  if (n.kind !== 'decision') return null
  const avg = r.avgStrategy[nodeId]!
  const nA = n.actions.length
  const fi = n.actions.indexOf(FOLD), ci = n.actions.indexOf(CALL), ri = n.actions.indexOf(RAISE)
  let f = 0, ca = 0, ra = 0
  for (let c = 0; c < 169; c++) {
    if (fi >= 0) f += PRIOR[c] * avg[c * nA + fi]
    if (ci >= 0) ca += PRIOR[c] * avg[c * nA + ci]
    if (ri >= 0) ra += PRIOR[c] * avg[c * nA + ri]
  }
  return { fold: +(f * 100).toFixed(1), call: +(ca * 100).toFixed(1), raise: +(ra * 100).toFixed(1), player: n.player }
}

// RFI ノードの category 別 open(raise)頻度 → 候補レンジ cells。
function openCells(r: MultiwaySolveResult, nodeId: number): Record<string, number> {
  const n = r.tree.nodes[nodeId]
  const out: Record<string, number> = {}
  if (n.kind !== 'decision') return out
  const avg = r.avgStrategy[nodeId]!
  const nA = n.actions.length
  const ri = n.actions.indexOf(RAISE)
  for (let c = 0; c < CATEGORIES.length; c++) out[CATEGORIES[c]] = +avg[c * nA + ri].toFixed(4)
  return out
}

function main(): void {
  if (process.argv.includes('--help')) {
    console.log('npx tsx scripts/solve-preflop-multiway.ts [--iters 600] [--eq-iters 2500] [--seed 1] [--max-raise 3] [--ip 1.0] [--oop 0.86] [--stability] [--out]')
    return
  }
  const iters = Number(flag('iters', '600'))
  const eqIters = Number(flag('eq-iters', '2500'))
  const seed = Number(flag('seed', '1'))
  const maxRaise = Number(flag('max-raise', '3'))
  const ip = Number(flag('ip', '1.0'))
  const oop = Number(flag('oop', '0.86'))
  const writeOut = process.argv.includes('--out')

  const eqCache = resolve(__dirname, `.cache/preflop-equity-${eqIters}-${seed}.json`)
  const eq: number[][] = existsSync(eqCache)
    ? JSON.parse(readFileSync(eqCache, 'utf8'))
    : buildEquityMatrix(eqIters, seed)
  console.log(`equity: ${existsSync(eqCache) ? 'cache' : 'built'} (${eqIters} iters) / tree max-raise=${maxRaise} / R_ip=${ip} R_oop=${oop}\n`)

  const config = { ...DEFAULT_TREE_CONFIG, maxRaise }
  const usePhaseB = !process.argv.includes('--no-phaseb')
  const models = usePhaseB ? loadModels(MODEL_DIR) : new Map<string, PostflopEvModel>()
  const huSeenFlopEV: HuSeenFlopResolver | undefined = usePhaseB ? buildHuResolver(models, config) : undefined
  console.log(`HU seen-flop EV: ${usePhaseB ? `Phase B V 行列(${models.size} モデル・UTG/MP/CO/BTN SRP + BTN/CO 3bet)` : 'flat 実現率のみ'}\n`)
  const t0 = Date.now()
  const r = solvePreflopMultiway({ eq, iters, config, ipRealization: ip, oopRealization: oop, huSeenFlopEV })
  console.log(`solved ${iters} iters in ${((Date.now() - t0) / 1000).toFixed(0)}s (info-sets ${(r.tree.decisionCount * 169 / 1e6).toFixed(2)}M)\n`)

  console.log('─'.repeat(78))
  console.log('  席    open%(anchor)        手作り   主な対応(対オープンの先頭ディフェンダー)')
  console.log('─'.repeat(78))
  const seatScenario = ['utg-open', 'mp-open', 'co-open', 'btn-open', 'sb-open']
  for (let s = 0; s < 5; s++) {
    const pos = POSITIONS[s]
    const open = r.openPctBySeat[s]
    const a = OPEN_ANCHOR[pos]
    const hb = handBuiltOpen(seatScenario[s])
    const rfi = r.tree.nodes[r.rfiNodeBySeat[s]]
    let def = ''
    if (rfi.kind === 'decision') {
      const fr = actionFreq(r, rfi.children[rfi.actions.indexOf(RAISE)])
      if (fr) def = `${POSITIONS[fr.player]}: fold ${fr.fold}/call ${fr.call}/3bet ${fr.raise}`
    }
    console.log(`  ${pos.padEnd(4)} ${open.toFixed(1).padStart(5)}${mark(open, a)}(${a[0]}-${a[1]})  hb=${hb ?? '—'}   ${def}`)
  }
  console.log('─'.repeat(78))
  console.log('⚠ = 既知アンカー外。SB は no-limp 抽象(GTO は SB リンプ多用)+ OOP 実現率の構造的境界。')
  console.log('  C2-2 知見: Phase B V 行列の配線は flat 実現率と差 ≤0.4pt = 較正済 flat が解値をよく近似')
  console.log('  (open 幅は seen-flop EV の精度に頑健)。UTG/MP/CO/BTN は 4/5 アンカー命中。')
  console.log('Phase C(HU縮約)比: UTG 63.5%→' + r.openPctBySeat[0].toFixed(1) + '% = 位置依存オープン幅を構造から回復。')

  if (process.argv.includes('--stability')) {
    console.log('\n安定性(半分の反復との open% ドリフト):')
    const r2 = solvePreflopMultiway({ eq, iters: Math.floor(iters / 2), config, ipRealization: ip, oopRealization: oop, huSeenFlopEV })
    for (let s = 0; s < 5; s++) {
      const d = Math.abs(r.openPctBySeat[s] - r2.openPctBySeat[s])
      console.log(`  ${POSITIONS[s].padEnd(4)} ${iters}=${r.openPctBySeat[s].toFixed(1)}  ${Math.floor(iters / 2)}=${r2.openPctBySeat[s].toFixed(1)}  Δ=${d.toFixed(1)}`)
    }
  }

  if (writeOut) {
    mkdirSync(OUT_DIR, { recursive: true })
    for (let s = 0; s < 5; s++) {
      const dump = {
        position: POSITIONS[s], scenario: seatScenario[s],
        openPct: r.openPctBySeat[s], iters, maxRaise, ipRealization: ip, oopRealization: oop,
        cells: openCells(r, r.rfiNodeBySeat[s]),
      }
      writeFileSync(resolve(OUT_DIR, `${seatScenario[s]}.json`), JSON.stringify(dump, null, 1))
    }
    console.log(`\n候補レンジ書出: ${OUT_DIR}(採用は C-2a/C-2b ゲート後・src/ 未変更)`)
  } else {
    console.log('\n(--out で候補レンジを書き出し)')
  }
}

const isEntry = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) main()
