#!/usr/bin/env node
/**
 * Opener 5 spot のヒューリスティック EV を precompute する (R4-B)。
 *
 *   npx tsx scripts/precompute-preflop-ev.ts [--eq-iters 2500] [--factor 30]
 *
 * src/data/ranges/preflop.ts の手作り opener scenarios に EV を載せた
 * NodeSolution JSON を `src/data/solutions/preflop-ev/{spotId}.json` に出力する。
 * バンドルサイズ抑制のため EV だけが必要 (frequencies は実行時に scenario から再構築)。
 *
 * Coach/UI は source='approximate_with_ev' を「ヒューリスティック EV」として表示する。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { buildEquityMatrix } from '../src/lib/solver/preflopEquity.ts'
import { PREFLOP_SCENARIOS } from '../src/data/ranges/preflop.ts'
import {
  computeHeuristicEV, buildCallerCallFreq,
  computeDefenderHeuristicEV, buildOpenerRaiseFreq,
} from '../src/lib/solver/attachHeuristicEV.ts'

function flag(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

function loadOrBuildEquity(eqIters: number, seed: number): number[][] {
  const cachePath = resolve(process.cwd(), `scripts/.cache/preflop-equity-${eqIters}-${seed}.json`)
  if (existsSync(cachePath)) {
    console.log(`equity: キャッシュ読込 ${cachePath}`)
    return JSON.parse(readFileSync(cachePath, 'utf8')) as number[][]
  }
  console.log(`equity: MC 構築 (${eqIters} iters, seed=${seed}) …`)
  const t0 = Date.now()
  const eq = buildEquityMatrix(eqIters, seed)
  mkdirSync(dirname(cachePath), { recursive: true })
  writeFileSync(cachePath, JSON.stringify(eq))
  console.log(`equity: 完了 ${Math.round((Date.now() - t0) / 1000)}s`)
  return eq
}

// opener id → caller (BB) scenario id の対応。SB open は BB が唯一の相手。
const OPENER_TO_CALLER: Record<string, string> = {
  'btn-open': 'bb-vs-btn',
  'co-open': 'bb-vs-co',
  'mp-open': 'bb-vs-mp',
  'utg-open': 'bb-vs-utg',
  'sb-open': 'bb-vs-sb',
}

function main() {
  const eqIters = Number(flag('eq-iters', '2500'))
  const factor = Number(flag('factor', '30'))
  const seed = Number(flag('seed', '1'))

  const eq = loadOrBuildEquity(eqIters, seed)

  for (const [openerId, callerId] of Object.entries(OPENER_TO_CALLER)) {
    const opener = PREFLOP_SCENARIOS.find(s => s.id === openerId)
    const caller = PREFLOP_SCENARIOS.find(s => s.id === callerId)
    if (!opener || !caller) {
      console.warn(`skip: ${openerId} (caller=${callerId} not found)`)
      continue
    }
    // opener: hero=opener, villain=BB の caller scenario の call 頻度を使う
    const callerCallFreq = buildCallerCallFreq(caller)
    const openerNode = computeHeuristicEV(opener, eq, callerCallFreq, { postflopFactor: factor })
    const openerOut = resolve(process.cwd(), `src/data/solutions/preflop-ev/${openerId}.json`)
    mkdirSync(dirname(openerOut), { recursive: true })
    writeFileSync(openerOut, JSON.stringify(openerNode, null, 2))
    console.log(`  wrote ${openerOut}`)

    // defender (bb-vs-X): hero=BB, villain=opener の X-open の raise 頻度を使う
    const openerRaiseFreq = buildOpenerRaiseFreq(opener)
    const defNode = computeDefenderHeuristicEV(caller, openerRaiseFreq, eq, { postflopFactor: factor })
    const defOut = resolve(process.cwd(), `src/data/solutions/preflop-ev/${callerId}.json`)
    writeFileSync(defOut, JSON.stringify(defNode, null, 2))
    console.log(`  wrote ${defOut}`)
  }
  console.log('done.')
}

main()
