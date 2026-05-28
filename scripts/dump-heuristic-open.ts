// 手動確認用: heuristic open スポットの上位/下位カテゴリを表示。
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { solveOpenHeuristic } from '../src/lib/solver/heuristicPreflopEV.ts'
import { buildEquityMatrix } from '../src/lib/solver/preflopEquity.ts'
import { CATEGORIES } from '../src/lib/solver/pushFold.ts'

const cachePath = resolve(process.cwd(), 'scripts/.cache/preflop-equity-2500-1.json')
const eq = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, 'utf8')) as number[][]
  : buildEquityMatrix(400, 1)

const r = solveOpenHeuristic(eq, { raiseSize: 2.5, iterations: 500 })
console.log(`exploitability: ${r.exploitability} BB/hand`)

const opener = CATEGORIES.map(c => ({ c, ...r.opener[c] })).sort((a, b) => b.freq - a.freq)
console.log('\n=== Opener: top 25 raise freq ===')
for (const x of opener.slice(0, 25)) console.log(`  ${x.c.padEnd(4)} freq=${x.freq.toFixed(2)} evRaise=${x.evAct.toFixed(2)}`)
console.log('\n=== Opener: bottom 10 raise freq ===')
for (const x of opener.slice(-10)) console.log(`  ${x.c.padEnd(4)} freq=${x.freq.toFixed(2)} evRaise=${x.evAct.toFixed(2)}`)

const caller = CATEGORIES.map(c => ({ c, ...r.caller[c] })).sort((a, b) => b.freq - a.freq)
console.log('\n=== Caller (BB): top 25 call freq ===')
for (const x of caller.slice(0, 25)) console.log(`  ${x.c.padEnd(4)} freq=${x.freq.toFixed(2)} evCall=${x.evAct.toFixed(2)}`)

const raiseTotal = opener.reduce((s, x) => s + x.freq, 0)
const callTotal = caller.reduce((s, x) => s + x.freq, 0)
console.log(`\n総 raise 頻度総和 (169カテゴリ加重前): ${raiseTotal.toFixed(1)} → 概算レンジ比 ${(raiseTotal / 169 * 100).toFixed(1)}%`)
console.log(`総 call 頻度総和: ${callTotal.toFixed(1)} → 概算 ${(callTotal / 169 * 100).toFixed(1)}%`)
