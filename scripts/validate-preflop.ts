/**
 * Phase V1: per-hand 検証。C2 マルチウェイ求解の候補レンジ・手作りレンジを、公開 GTO 6-max RFI
 * (`published-ranges.ts`)と**セル単位**で突合する。「幅でなくレンジが正しいか」を定量化し、
 * solver-grade ロードマップ(`~/.claude/plans/preflop-solver-grade-roadmap.md`)の V2 設計を駆動。
 *
 *   npx tsx scripts/validate-preflop.ts [--out]
 *
 * 指標: 幅% / in-out 一致%(頻度≥0.5 を in)/ L1 距離%(Σ|our−pub|×combos/1326 = 頻度差の総量)/
 * 偽陽性(我々 open・公開 fold)/ 偽陰性(我々 fold・公開 open)。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES } from '../src/lib/solver/pushFold.ts'
import { PREFLOP_SCENARIOS } from '../src/data/ranges/preflop.ts'
import { publishedCells, publishedWidthPct, POSITIONS_V1 } from './published-ranges.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CAND_DIR = resolve(__dirname, 'out/preflop-multiway')
const OUT_DIR = resolve(__dirname, 'out/validation')
const combos = (cat: string): number => (cat.length === 2 ? 6 : cat[2] === 's' ? 4 : 12)
const SCN: Record<string, string> = { UTG: 'utg-open', MP: 'mp-open', CO: 'co-open', BTN: 'btn-open' }

function c2Cells(pos: string): Record<string, number> | null {
  const f = resolve(CAND_DIR, `${SCN[pos]}.json`)
  if (!existsSync(f)) return null
  return JSON.parse(readFileSync(f, 'utf8')).cells
}
function handBuiltCells(pos: string): Record<string, number> {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === SCN[pos])
  const out: Record<string, number> = {}
  for (const cat of CATEGORIES) out[cat] = sc?.cells[cat]?.raise ?? 0
  return out
}

interface Cmp { widthPct: number; agreePct: number; l1Pct: number; fp: [string, number][]; fn: [string, number][]; fpC: number; fnC: number }
function compare(ours: Record<string, number>, pub: Record<string, number>): Cmp {
  let agree = 0, l1 = 0, width = 0, fpC = 0, fnC = 0
  const fp: [string, number][] = [], fn: [string, number][] = []
  for (const cat of CATEGORIES) {
    const o = ours[cat] ?? 0, p = pub[cat], n = combos(cat)
    width += o * n
    l1 += Math.abs(o - p) * n
    const oIn = o >= 0.5 ? 1 : 0
    if (oIn === p) agree += n
    if (oIn === 1 && p === 0) { fpC += n; fp.push([cat, o]) }
    if (oIn === 0 && p === 1) { fnC += n; fn.push([cat, o]) }
  }
  return { widthPct: +(100 * width / 1326).toFixed(1), agreePct: +(100 * agree / 1326).toFixed(1), l1Pct: +(100 * l1 / 1326).toFixed(1), fp, fn, fpC, fnC }
}

const fmtHands = (xs: [string, number][]): string =>
  xs.sort((a, b) => combos(b[0]) - combos(a[0])).slice(0, 14).map(([h, f]) => `${h}${f > 0 ? `(${f.toFixed(2)})` : ''}`).join(' ') || '—'

function main(): void {
  const report: Record<string, unknown> = {}
  console.log('═'.repeat(84))
  console.log(' Phase V1 per-hand 検証 — C2 求解 / 手作り vs 公開 GTO 6-max RFI')
  console.log('═'.repeat(84))
  for (const pos of POSITIONS_V1) {
    const pub = publishedCells(pos)
    const c2c = c2Cells(pos), hbc = handBuiltCells(pos)
    const pubW = publishedWidthPct(pos)
    console.log(`\n■ ${pos}  (公開 GTO 幅 ${pubW}%)`)
    console.log('  source      幅%    in-out一致%   L1距離%   偽陽性combos  偽陰性combos')
    const rows: Record<string, Cmp> = {}
    if (c2c) { const c = compare(c2c, pub); rows.c2 = c; console.log(`  C2求解      ${c.widthPct.toFixed(1).padStart(4)}    ${c.agreePct.toFixed(1).padStart(5)}        ${c.l1Pct.toFixed(1).padStart(4)}      ${String(c.fpC).padStart(4)}         ${String(c.fnC).padStart(4)}`) }
    const h = compare(hbc, pub); rows.handBuilt = h
    console.log(`  手作り      ${h.widthPct.toFixed(1).padStart(4)}    ${h.agreePct.toFixed(1).padStart(5)}        ${h.l1Pct.toFixed(1).padStart(4)}      ${String(h.fpC).padStart(4)}         ${String(h.fnC).padStart(4)}`)
    if (c2c) {
      console.log(`  C2 偽陰性(公開は open・C2 は fold): ${fmtHands(rows.c2.fn)}`)
      console.log(`  C2 偽陽性(公開は fold・C2 は open): ${fmtHands(rows.c2.fp)}`)
    }
    report[pos] = { publishedWidthPct: pubW, ...rows }
  }
  console.log('\n' + '═'.repeat(84))
  console.log('読み: in-out一致% 高/ L1距離% 低 ほど公開GTOに近い。偽陰性が系統的(弱Ax/オフブロードウェイ等)なら')
  console.log('静的 realization の opener 過小評価(V2 で解消見込み)を支持。')
  if (process.argv.includes('--out')) {
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(resolve(OUT_DIR, 'v1-per-hand.json'), JSON.stringify(report, null, 1))
    console.log(`\nレポート書出: ${OUT_DIR}/v1-per-hand.json`)
  }
}
main()
