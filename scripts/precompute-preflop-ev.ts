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
  buildOpenerResponseFreqs, computeOpenerFacing3betEV,
  type DefenderEVOptions,
} from '../src/lib/solver/attachHeuristicEV.ts'
import type { RangeScenario } from '../src/types/ranges.ts'

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

// R4: 非BB 単独防御 6 スポット → 対応する opener id。BB ディフェンダーと同じ
// computeDefenderHeuristicEV を流用し EV カバレッジを 10/21 → 16/21 に拡張する。
const DEFENDER_TO_OPENER: Record<string, string> = {
  'sb-vs-btn': 'btn-open',
  'sb-vs-co': 'co-open',
  'btn-vs-co': 'co-open',
  'btn-vs-utg': 'utg-open',
  'btn-vs-mp': 'mp-open',
  'co-vs-utg': 'utg-open',
}

// defender (3better) → opener の 3bet 応答シナリオ。これがある defender だけ 3bet EV を載せる。
// 実データの facing-3bet シナリオは BTN/CO open に対する SB/BB/BTN の 3bet 応答のみ。
const DEFENDER_TO_FACING3BET: Record<string, string> = {
  'bb-vs-btn': 'btn-vs-bb-3bet',
  'bb-vs-co': 'co-vs-bb-3bet',
  'sb-vs-btn': 'btn-vs-sb-3bet',
  'sb-vs-co': 'co-vs-sb-3bet',
  'btn-vs-co': 'co-vs-btn-3bet',
  // 残り opener (UTG/MP/SB) 用 → non-BB defender + bb-vs-{mp,utg,sb} の 3bet EV を埋める
  'bb-vs-mp': 'mp-vs-bb-3bet',
  'bb-vs-utg': 'utg-vs-bb-3bet',
  'bb-vs-sb': 'sb-vs-bb-3bet',
  'btn-vs-utg': 'utg-vs-btn-3bet',
  'btn-vs-mp': 'mp-vs-btn-3bet',
  'co-vs-utg': 'utg-vs-co-3bet',
}

// facing-3bet スポット (hero=opener) → villain(3better) のレンジシナリオ (raise 列=3bet レンジ)。
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
const THREE_BET_BB = 11   // 3bet サイズ (facing-3bet シナリオの raiseSize と一致)
const F3 = 45             // 3bet ポット postflop factor
const F4 = 60             // 4bet ポット postflop factor

// defender の 3bet EV オプションを組む。facing-3bet データが無ければ {} (3bet EV=0 のまま)。
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
    const defNode = computeDefenderHeuristicEV(caller, openerRaiseFreq, eq, {
      postflopFactor: factor, ...threeBetOpts(caller, opener),
    })
    const defOut = resolve(process.cwd(), `src/data/solutions/preflop-ev/${callerId}.json`)
    writeFileSync(defOut, JSON.stringify(defNode, null, 2))
    console.log(`  wrote ${defOut}`)
  }

  // R4: 非BB 単独防御スポット (sb/btn/co が opener の raise に直面)。
  // BB ディフェンダーと同一の computeDefenderHeuristicEV を使う。
  // fold の sunk cost はブラインドで決まる: BB ディフェンダー=1.0、SB ディフェンダー=0.5、
  // BTN/CO ディフェンダーは未投入なので 0 を切り上げて 1.0 のまま (相対 EV のみ意味を持つ)。
  for (const [defId, openerId] of Object.entries(DEFENDER_TO_OPENER)) {
    const defender = PREFLOP_SCENARIOS.find(s => s.id === defId)
    const opener = PREFLOP_SCENARIOS.find(s => s.id === openerId)
    if (!defender || !opener) {
      console.warn(`skip: ${defId} (opener=${openerId} not found)`)
      continue
    }
    const openerRaiseFreq = buildOpenerRaiseFreq(opener)
    // SB ディフェンダーは 0.5BB を既に投入 → fold EV = -0.5。それ以外は既定 -1.0。
    const foldCost = defender.position === 'SB' ? 0.5 : 1.0
    const defNode = computeDefenderHeuristicEV(defender, openerRaiseFreq, eq, {
      postflopFactor: factor, bbBlind: foldCost, ...threeBetOpts(defender, opener),
    })
    const defOut = resolve(process.cwd(), `src/data/solutions/preflop-ev/${defId}.json`)
    mkdirSync(dirname(defOut), { recursive: true })
    writeFileSync(defOut, JSON.stringify(defNode, null, 2))
    console.log(`  wrote ${defOut}`)
  }

  // R4: facing-3bet 5 スポット (hero=opener が 3bet に直面)。EV coverage 16/21 → 21/21。
  // villain(3better) の 3bet レンジ = {3better}-vs-{opener} の raise 列。
  for (const [facingId, threeBetterId] of Object.entries(FACING3BET_TO_3BETTER)) {
    const facing = PREFLOP_SCENARIOS.find(s => s.id === facingId)
    const threeBetter = PREFLOP_SCENARIOS.find(s => s.id === threeBetterId)
    if (!facing || !threeBetter) {
      console.warn(`skip: ${facingId} (3better=${threeBetterId} not found)`)
      continue
    }
    const villain3betFreq = buildOpenerRaiseFreq(threeBetter)
    // opener のオープン額はポジション次第 (SB open=3.0, それ以外=2.5)。
    const openerOpen = PREFLOP_SCENARIOS.find(s => s.id === `${facing.position.toLowerCase()}-open`)
    const node = computeOpenerFacing3betEV(facing, villain3betFreq, eq, {
      openBB: openerOpen?.raiseSize ?? 2.5,
      threeBetBB: THREE_BET_BB,
      openerBlind: BLIND_POSTED[facing.position] ?? 0,         // opener=BTN/CO → 0, SB → 0.5
      threeBetterBlind: BLIND_POSTED[threeBetter.position] ?? 0, // 3better=BB/SB/BTN
      threeBetFactor: F3, fourBetFactor: F4, foldToFourBet: 0.55,
    })
    const out = resolve(process.cwd(), `src/data/solutions/preflop-ev/${facingId}.json`)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(node, null, 2))
    console.log(`  wrote ${out}`)
  }
  console.log('done.')
}

main()
