#!/usr/bin/env node
/**
 * 代表ボード ポストフロップ解の事前計算 (オフライン・Node 実行)。
 *
 *   npx tsx scripts/precompute-postflop.ts [--only <substr>] [--force] [--river-only|--turn-only]
 *
 * src/lib/solver/representativeBoards.ts の代表テクスチャ × SRP スポット × phase(lead/facing) を
 * 自前 CFR (river=厳密 / turn=完全チャンスノード) で求解し、hero レンジ全コンボの戦略テーブルを
 * src/data/solutions/postflop/{spot__board__phase}.json (source: solver_precomputed) に出力する。
 *
 * 設計ルール1: 厳密と称せるのは river(後続なし)/turn(river ベッティング織り込み・exploit 4-5%) のみ。
 * flop はアブストラクション下限 ~13% のため対象外 (従来通りライブ/近似)。
 * ライセンス (docs/DATA_LICENSE.md L1): 完全自社生成 → license: 'self-generated'。
 *
 * ライブ経路 (src/lib/solver/getSolution.ts solveRiverSpot) と同一パラメータで解くため、
 * 同コンボの解はライブ求解と一致する (precomputed が無いボードはライブにフォールバック)。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REPRESENTATIVE_BOARDS, REPRESENTATIVE_SPOT_SETS, REP_RIVER_CAP, REP_TURN_CAP,
  precomputePostflopKey, type PrecomputePhase,
} from '../src/lib/solver/representativeBoards.ts'
import { spotRanges, comboKey } from '../src/lib/solver/riverRanges.ts'
import { capRange, narrowByRiverStrength } from '../src/lib/solver/rangeNarrowing.ts'
import { findHeroNode, comboActionsAt, heroPhase } from '../src/lib/solver/postflopNode.ts'
import { solveRiverAsync } from '../src/lib/solver/solverClient.ts'
import type { Combo } from '../src/lib/solver/riverSolver.ts'
import type { ActionSolution, PrecomputedPostflopTable } from '../src/types/solver.ts'
import type { Card } from '../src/types/game.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../src/data/solutions/postflop')

const PHASES: PrecomputePhase[] = ['lead', 'facing']
const BET_FRAC = 0.66
const RAISE_FRAC = 0.5

const arg = (name: string) => process.argv.includes(`--${name}`)
const argVal = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const ONLY = argVal('only')
const FORCE = arg('force')
const RIVER_ONLY = arg('river-only')
const TURN_ONLY = arg('turn-only')
const POT_TYPE = argVal('pot-type') // 'srp' | '3bet' (未指定=両方)

// オフライン事前計算はライブの時間予算 (turn=40 iters/cap50) に縛られないので、
// 反復とコンボ上限を増やして exploitability を「厳密と称せる」水準 (turn 4-5% 以下) まで詰める。
// river は後続なし=既に厳密 (実測 <1%) なのでライブ同等で十分。
const RIVER_ITERS = 400
const RIVER_CAP = REP_RIVER_CAP
const TURN_ITERS = Number(argVal('turn-iters') ?? 160)
const TURN_CAP = Number(argVal('turn-cap') ?? REP_TURN_CAP)

async function solveOne(
  spotId: string, board: Card[], street: 'turn' | 'river', phase: PrecomputePhase,
  potBB: number, effStackBB: number,
): Promise<PrecomputedPostflopTable | null> {
  const ranges = spotRanges(spotId, board)
  if (!ranges) return null
  const { heroIsOOP } = ranges

  const chanceCFR = street === 'turn'
  const cap = chanceCFR ? TURN_CAP : RIVER_CAP
  const narrow = (combos: Combo[]) =>
    street === 'river' ? narrowByRiverStrength(combos, board) : combos

  const rawHero = heroIsOOP ? ranges.oop : ranges.ip
  const rawVill = heroIsOOP ? ranges.ip : ranges.oop
  const heroSide = capRange(narrow(rawHero), undefined, cap)
  const villSide = capRange(narrow(rawVill), undefined, cap)
  const oop = heroIsOOP ? heroSide : villSide
  const ip = heroIsOOP ? villSide : heroSide

  const { nodes, exploitability } = await solveRiverAsync({
    board, oop, ip, potBB, stackBB: effStackBB,
    betSizes: [BET_FRAC], raiseSizes: [RAISE_FRAC],
    iterations: chanceCFR ? TURN_ITERS : RIVER_ITERS,
    useChanceCFR: chanceCFR, // turn は runoutN 未指定=全 runout 列挙 (turnSolver 既定)
  })

  const target = findHeroNode(nodes, heroIsOOP, heroPhase(phase === 'facing', false))
  if (!target) return null

  const strategy: Record<string, ActionSolution[]> = {}
  heroSide.forEach((combo, idx) => {
    const acts = comboActionsAt(target, idx)
    if (acts.length > 0) strategy[comboKey(combo.cards)] = acts
  })
  if (Object.keys(strategy).length === 0) return null

  return {
    spotId, street, board, phase, potBB, effStackBB, betFrac: BET_FRAC,
    source: 'solver_precomputed', exploitability, bettingAware: chanceCFR,
    runoutN: chanceCFR ? 48 : undefined,
    strategy,
    meta: {
      sourceName: chanceCFR ? 'self CFR (turn, chance-node 全48 runout)' : 'self CFR (river)',
      license: 'self-generated', version: '1',
    },
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const boards = REPRESENTATIVE_BOARDS.filter(b =>
    (!RIVER_ONLY || b.street === 'river') && (!TURN_ONLY || b.street === 'turn'))

  const sets = REPRESENTATIVE_SPOT_SETS.filter(s => !POT_TYPE || s.potType === POT_TYPE)
  let written = 0, skipped = 0, empty = 0, maxExploit = 0, maxExploitKey = ''
  const HIGH_EXPLOIT = 0.05 // これを超える turn は「厳密」と称しにくい → 警告
  const t0 = Date.now()
  for (const set of sets) {
    for (const rb of boards) {
      for (const spotId of set.spots) {
        for (const phase of PHASES) {
          const key = precomputePostflopKey(spotId, rb.board, phase)
          if (ONLY && !key.includes(ONLY)) continue
          const out = resolve(OUT_DIR, `${key}.json`)
          if (!FORCE && existsSync(out)) { skipped++; continue }

          const t1 = Date.now()
          const table = await solveOne(spotId, rb.board, rb.street, phase, set.potBB, set.effStackBB)
          if (!table) { empty++; console.log(`  - ${key}: (空・スキップ)`); continue }
          writeFileSync(out, JSON.stringify(table, null, 2))
          written++
          if (table.exploitability > maxExploit) { maxExploit = table.exploitability; maxExploitKey = key }
          const combos = Object.keys(table.strategy).length
          const warn = table.exploitability > HIGH_EXPLOIT ? '  ⚠ exploit 高 (要反復増)' : ''
          console.log(`  ✓ ${key}: ${combos} combos, exploit=${(table.exploitability * 100).toFixed(1)}%  [${((Date.now() - t1) / 1000).toFixed(1)}s]${warn}`)
        }
      }
    }
  }
  console.log(`\n完了: 書き出し ${written} / スキップ済 ${skipped} / 空 ${empty}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  console.log(`最大 exploitability: ${(maxExploit * 100).toFixed(1)}%  (${maxExploitKey})`)
  if (maxExploit > HIGH_EXPLOIT) console.log(`⚠ ${(HIGH_EXPLOIT * 100)}% 超のスポットあり → --turn-iters を増やして再生成を検討`)
}

main().catch(err => { console.error(err); process.exit(1) })
