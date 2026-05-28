#!/usr/bin/env node
/**
 * HU プッシュ/フォールド Nash 解の生成スクリプト (オフライン・Node 実行)。
 *
 *   npx tsx scripts/solve-pushfold.ts [--stacks 5,8,10,12,15,20,25] [--eq-iters 2500] [--pf-iters 2000] [--seed 1]
 *
 * 自前ソルバー (src/lib/solver/) でカテゴリ別オールイン勝率行列を MC 構築 → 各有効スタックの
 * push/fold Nash を求解 → solver_precomputed JSON を src/data/solutions/preflop/ に出力する。
 * プリフロップでスタックが全て入るためショーダウン勝敗が真値 = 厳密 GTO。
 *
 * ライセンス (docs/DATA_LICENSE.md L1): 完全自社生成 → license: 'self-generated'。
 *
 * 勝率行列は scripts/.cache/ にキャッシュ (スタック非依存・再利用)。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { buildEquityMatrix } from '../src/lib/solver/preflopEquity.ts'
import { solvePushFold, CATEGORIES } from '../src/lib/solver/pushFold.ts'

function flag(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

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
  meta: { sourceName: string; license: string; version: string }
}

function loadOrBuildEquity(eqIters: number, seed: number): number[][] {
  const cachePath = resolve(process.cwd(), `scripts/.cache/preflop-equity-${eqIters}-${seed}.json`)
  if (existsSync(cachePath)) {
    console.log(`equity: キャッシュ読込 ${cachePath}`)
    return JSON.parse(readFileSync(cachePath, 'utf8')) as number[][]
  }
  console.log(`equity: MC 構築開始 (${eqIters} iters/pair, seed=${seed}) …`)
  const t0 = Date.now()
  const eq = buildEquityMatrix(eqIters, seed, (done, total) => {
    if (done % 2000 === 0) console.log(`  ${done}/${total} pairs (${Math.round((Date.now() - t0) / 1000)}s)`)
  })
  mkdirSync(dirname(cachePath), { recursive: true })
  writeFileSync(cachePath, JSON.stringify(eq))
  console.log(`equity: 完了 ${Math.round((Date.now() - t0) / 1000)}s → ${cachePath}`)
  return eq
}

function writeNode(node: NodeSolution) {
  const out = resolve(process.cwd(), `src/data/solutions/preflop/${node.spotId}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(node, null, 2))
  console.log(`  wrote ${out}`)
}

function main() {
  const stacks = flag('stacks', '5,8,10,12,15,20,25').split(',').map(Number).filter(n => n > 0)
  const eqIters = Number(flag('eq-iters', '2500'))
  const pfIters = Number(flag('pf-iters', '2000'))
  const seed = Number(flag('seed', '1'))

  const eq = loadOrBuildEquity(eqIters, seed)

  for (const S of stacks) {
    const r = solvePushFold(eq, { effStackBB: S, iterations: pfIters })
    console.log(`solve ${S}BB: exploitability=${r.exploitability} BB/hand`)
    const meta = { sourceName: `self push/fold Nash (HU ${S}BB, MC eq ${eqIters})`, license: 'self-generated', version: '1' }

    // SB: push(オールイン raise) / fold
    const sbStrategy: Record<string, ActionSolution[]> = {}
    for (const cat of CATEGORIES) {
      const d = r.sbPush[cat]
      const acts: ActionSolution[] = []
      if (d.freq > 0.0005) acts.push({ action: 'raise', sizeBB: S, frequency: d.freq, ev: d.evAct })
      if (1 - d.freq > 0.0005) acts.push({ action: 'fold', frequency: +(1 - d.freq).toFixed(4), ev: d.evFold })
      sbStrategy[cat] = acts
    }
    writeNode({ street: 'preflop', spotId: `hu-pf-${S}bb-sb`, strategy: sbStrategy, potBB: 1.5, source: 'solver_precomputed', meta })

    // BB: push に直面して call / fold
    const bbStrategy: Record<string, ActionSolution[]> = {}
    for (const cat of CATEGORIES) {
      const d = r.bbCall[cat]
      const acts: ActionSolution[] = []
      if (d.freq > 0.0005) acts.push({ action: 'call', frequency: d.freq, ev: d.evAct })
      if (1 - d.freq > 0.0005) acts.push({ action: 'fold', frequency: +(1 - d.freq).toFixed(4), ev: d.evFold })
      bbStrategy[cat] = acts
    }
    writeNode({ street: 'preflop', spotId: `hu-pf-${S}bb-bb`, strategy: bbStrategy, potBB: +(S + 1).toFixed(1), source: 'solver_precomputed', meta })
  }
  console.log('done.')
}

main()
