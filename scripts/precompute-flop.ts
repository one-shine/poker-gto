#!/usr/bin/env node
/**
 * flop 代表ボード事前計算 orchestrator (Node worker_threads 並列・再開可能)。
 *
 *   npx tsx scripts/precompute-flop.ts [options]
 *
 * オプション:
 *   --only <substr>         キーに部分一致するジョブのみ実行
 *   --pot-type srp|3bet     指定 pot-type のみ (未指定=両方)
 *   --boards id1,id2,...    指定 boardId のみ
 *   --iters 250             CFR 反復数 (既定 250)
 *   --cap 100               hero コンボ上限 (既定 REP_FLOP_CAP=100)
 *   --workers 4             並列ワーカー数 (既定 4)
 *   --worker-heap-mb 3072   Worker の maxOldGenerationSizeMb (既定 3072)
 *                           cap100 実測 RSS ~2.6GB → 2048 では OOM kill リスク
 *   --no-iso                (将来対応) ISO アブストラクション無効化プレースホルダー
 *   --float32-regrets       (将来対応) float32 regret 保存プレースホルダー
 *   --force                 既存出力を上書き
 *   --max-exploit 0.05      これを超える exploitability のテーブルは書き出さない (既定 0.05)
 *   --dry-run               ジョブ一覧を表示して終了 (求解しない)
 *
 * 設計ルール1のハードゲート:
 *   exploitability > --max-exploit のテーブルは書き出さず警告する
 *   (「GTO近似」と名乗れない解を同梱しない)。
 *
 * ライセンス: 完全自社生成 → license: 'self-generated'。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REPRESENTATIVE_BOARDS,
  REPRESENTATIVE_SPOT_SETS,
  precomputePostflopKey,
  boardCode,
  REP_FLOP_CAP,
} from '../src/lib/solver/representativeBoards.ts'
import { spotRanges } from '../src/lib/solver/riverRanges.ts'
import { capRangeSuitClosed } from '../src/lib/solver/rangeNarrowing.ts'
import { boardSuitPerms } from '../src/lib/solver/suitIsomorphism.ts'
import { runJobPool } from './lib/jobPool.ts'
import type { FlopJobInput, FlopJobOutput } from './flop-solve-worker.ts'
import type { PrecomputedPostflopTable } from '../src/types/solver.ts'
import type { CfrOpts } from '../src/lib/solver/chanceCfr.ts'
import type { Card } from '../src/types/game.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../src/data/solutions/postflop')
const WORKER_PATH = resolve(__dirname, './flop-solve-worker.ts')

// ── CLI 引数パーサ ─────────────────────────────────────────────────────────────
const arg = (name: string) => process.argv.includes(`--${name}`)
const argVal = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const ONLY        = argVal('only')
const POT_TYPE    = argVal('pot-type') as 'srp' | '3bet' | undefined
const BOARDS_ARG  = argVal('boards')?.split(',')
const ITERS       = Number(argVal('iters')          ?? 250)
const CAP         = Number(argVal('cap')             ?? REP_FLOP_CAP)
const WORKERS     = Number(argVal('workers')         ?? 4)
const WORKER_HEAP = Number(argVal('worker-heap-mb')  ?? 3072)
const FORCE       = arg('force')
const DRY_RUN     = arg('dry-run')
const MAX_EXPLOIT = Number(argVal('max-exploit') ?? 0.05)
// TODO: 将来 solveFlop が ISO アブストラクション / float32 regret に対応したらここで使う
const _NO_ISO          = arg('no-iso')        // プレースホルダー (未使用)
const _FLOAT32_REGRETS = arg('float32-regrets') // プレースホルダー (未使用)

// DCFR (alpha=1.5/beta=0/gamma=2) を既定で有効化。
// ベンチ確定値: cap100+iters250+DCFR で exploitability 0.03% を達成 (目標 ≤ 0.05%)。
// 普通の CFR+ (DCFR 無し) では同一 iters で 0.8% 程度に留まる。
const CFR_OPTS: CfrOpts = { dcfr: { alpha: 1.5, beta: 0, gamma: 2 } }

// ── フロップ代表ボード (representativeBoards.ts から import) ────────────────────
const FLOP_BOARDS = REPRESENTATIVE_BOARDS.filter(b => b.street === 'flop')

// ── ジョブ構築 ──────────────────────────────────────────────────────────────────
interface JobSpec {
  key: string
  spotId: string
  boardId: string
  potType: 'srp' | '3bet'
  board: Card[]
  potBB: number
  stackBB: number
}

function buildJobs(): JobSpec[] {
  const allBoards = BOARDS_ARG
    ? FLOP_BOARDS.filter(b => BOARDS_ARG.includes(b.id))
    : FLOP_BOARDS

  const sets = REPRESENTATIVE_SPOT_SETS.filter(s => !POT_TYPE || s.potType === POT_TYPE)

  const specs: JobSpec[] = []
  for (const set of sets) {
    for (const fb of allBoards) {
      for (const spotId of set.spots) {
        const key = `${spotId}__${boardCode(fb.board)}__flop`
        if (ONLY && !key.includes(ONLY)) continue
        specs.push({
          key,
          spotId,
          boardId: fb.id,
          potType: set.potType,
          board: fb.board,
          potBB: set.potBB,
          stackBB: set.effStackBB,
        })
      }
    }
  }
  return specs
}

// ── 既存ファイルの存在チェック (lead と facing 両方) ───────────────────────────
function outputExists(spotId: string, board: Card[], phase: 'lead' | 'facing'): boolean {
  const key = precomputePostflopKey(spotId, board, phase)
  return existsSync(resolve(OUT_DIR, `${key}.json`))
}

function shouldSkip(spec: JobSpec): boolean {
  if (FORCE) return false
  // lead・facing 両方が揃っている場合のみスキップ (片方欠けなら再解)
  return outputExists(spec.spotId, spec.board, 'lead') &&
         outputExists(spec.spotId, spec.board, 'facing')
}

// ── JSON 書き込み ───────────────────────────────────────────────────────────────
const BET_FRAC = 0.66

function writeTable(
  output: FlopJobOutput,
  phase: 'lead' | 'facing',
  strategy: Record<string, import('../src/types/solver.ts').ActionSolution[]>,
): void {
  const board = output.board as Card[]
  const key  = precomputePostflopKey(output.spotId, board, phase)
  const path = resolve(OUT_DIR, `${key}.json`)

  const table: PrecomputedPostflopTable = {
    spotId: output.spotId,
    street: 'flop',
    board,
    phase,
    potBB: output.potBB,
    effStackBB: output.effStackBB,
    betFrac: BET_FRAC,
    source: 'solver_precomputed',
    exploitability: output.exploitability,
    bettingAware: true, // flop CFR は turn+river ベッティングを織り込む
    iters: output.iters,
    fullEnumeration: output.fullEnumeration,
    strategy,
    meta: {
      sourceName: 'self CFR (flop, chance-node turn+river)',
      license: 'self-generated',
      version: '1',
    },
  }
  writeFileSync(path, JSON.stringify(table))
}

// ── dry-run 表示 ────────────────────────────────────────────────────────────────
function printDryRun(jobs: JobSpec[], skipCount: number): void {
  console.log(`\n[dry-run] フロップ事前計算 ジョブ一覧`)
  const dcfrLabel = CFR_OPTS.dcfr ? `dcfr(α=${CFR_OPTS.dcfr.alpha}/β=${CFR_OPTS.dcfr.beta}/γ=${CFR_OPTS.dcfr.gamma})` : 'cfr+'
  console.log(`  代表ボード: ${FLOP_BOARDS.length}枚 / --iters ${ITERS} / --cap ${CAP} / --workers ${WORKERS} / --worker-heap-mb ${WORKER_HEAP} / ${dcfrLabel}`)
  console.log(`  --max-exploit ${MAX_EXPLOIT * 100}% ハードゲート: 超過テーブルは書き出さない`)
  console.log(`  既存スキップ対象: ${skipCount} ジョブ (--force で上書き)`)
  console.log(`  実行予定ジョブ: ${jobs.length} 件\n`)

  let prev = ''
  for (const s of jobs) {
    const header = `[${s.potType.toUpperCase()} potBB=${s.potBB} stack=${s.stackBB}BB]`
    if (header !== prev) { console.log(`  ${header}`); prev = header }
    console.log(`    ${s.key}  board=${s.board.map(c => `${c.rank}${c.suit[0]}`).join('')}`)
  }

  console.log(`\n合計 ${jobs.length} ジョブ × 2フェーズ(lead/facing) = 最大 ${jobs.length * 2} ファイル`)
  console.log('(--dry-run のため求解は実行しません)')
}

// ── メイン ──────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const allSpecs = buildJobs()
  const skipSpecs = allSpecs.filter(s => shouldSkip(s))
  const runSpecs  = allSpecs.filter(s => !shouldSkip(s))

  if (DRY_RUN) {
    printDryRun(runSpecs, skipSpecs.length)
    return
  }

  console.log(`フロップ事前計算 開始: ${runSpecs.length} ジョブ (スキップ済み ${skipSpecs.length}) / workers=${WORKERS} / heap=${WORKER_HEAP}MB`)

  // JobPool に渡す FlopJobInput を構築 (ranges をメインプロセスで解決し heroIsOOP も渡す)。
  // iso 使用時(既定)は capRangeSuitClosed でレンジの置換閉性を保つ。
  // worker は受け取った capped レンジをそのまま使い、ranges の再解決はしない。
  const jobInputs: FlopJobInput[] = runSpecs.map(spec => {
    const ranges = spotRanges(spec.spotId, spec.board)
    const rawOop = ranges?.oop ?? []
    const rawIp  = ranges?.ip  ?? []
    const heroIsOOP = ranges?.heroIsOOP ?? true
    const perms = boardSuitPerms(spec.board).filter(Boolean)
    const capped = {
      oop: capRangeSuitClosed(rawOop, CAP, perms),
      ip:  capRangeSuitClosed(rawIp,  CAP, perms),
    }
    return {
      spotId:    spec.spotId,
      boardId:   spec.boardId,
      potType:   spec.potType,
      board:     spec.board as FlopJobInput['board'],
      oop:       capped.oop as FlopJobInput['oop'],
      ip:        capped.ip  as FlopJobInput['ip'],
      potBB:     spec.potBB,
      stackBB:   spec.stackBB,
      iters:     ITERS,
      cap:       CAP,
      heroIsOOP,
      cfrOpts:   CFR_OPTS,
    }
  })

  const t0 = Date.now()
  let written = 0, gated = 0, emptyPhase = 0
  const gatedKeys: string[] = []

  // 書き込みはジョブ完了の都度行う(数時間ランの途中クラッシュで全損させない・existsSync 再開を機能させる)
  const handleResult = (res: { jobIndex: number; result?: FlopJobOutput; error?: string }) => {
    const spec = runSpecs[res.jobIndex]

    if (res.error) {
      console.error(`\n  [ERROR] ${spec.key}: ${res.error}`)
      return
    }
    const output = res.result!

    // ハードゲート: exploitability > max-exploit は書き出さない
    if (output.exploitability > MAX_EXPLOIT) {
      gated++
      gatedKeys.push(`${spec.key} (exploit=${(output.exploitability * 100).toFixed(1)}%)`)
      console.warn(`\n  [GATE] ${spec.key}: exploit=${(output.exploitability * 100).toFixed(1)}% > 上限${(MAX_EXPLOIT * 100)}%  → 書き出しをスキップ`)
      return
    }

    const combosLead   = output.lead   ? Object.keys(output.lead).length   : 0
    const combosFacing = output.facing ? Object.keys(output.facing).length : 0

    if (output.lead) {
      writeTable(output, 'lead', output.lead)
      written++
    } else {
      emptyPhase++
    }
    if (output.facing) {
      writeTable(output, 'facing', output.facing)
      written++
    } else {
      emptyPhase++
    }

    console.log(
      `\n  ✓ ${spec.key}:  lead=${combosLead} / facing=${combosFacing} combos` +
      `  exploit=${(output.exploitability * 100).toFixed(1)}%`,
    )
  }

  await runJobPool<FlopJobInput, FlopJobOutput>(jobInputs, {
    concurrency: WORKERS,
    workerPath: WORKER_PATH,
    maxOldGenerationSizeMb: WORKER_HEAP,
    onResult: handleResult,
    onProgress: ({ done, total, elapsedMs }) => {
      process.stdout.write(`  進捗: ${done}/${total}  (${(elapsedMs / 1000).toFixed(0)}s)`)
    },
  })

  console.log() // 進捗行の改行

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\n完了: 書き出し ${written} ファイル / スキップ済 ${skipSpecs.length * 2} / ゲート落ち ${gated} ジョブ / 空フェーズ ${emptyPhase}  (${elapsed}s)`)
  if (gatedKeys.length > 0) {
    console.warn(`\n[ハードゲート落ち] exploitability > ${MAX_EXPLOIT * 100}% (--iters を増やして再実行):`)
    gatedKeys.forEach(k => console.warn(`  ${k}`))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
