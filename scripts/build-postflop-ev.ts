#!/usr/bin/env node
/**
 * postflop EV モデル素材量産スクリプト (Phase B)。
 *
 *   npx tsx scripts/build-postflop-ev.ts [options]
 *
 * オプション:
 *   --configs key1,key2   指定ポット構成のみ実行 (未指定=全構成)
 *   --n       60          フロップ標本数/構成 (既定 60)
 *   --iters   120         CFR 反復数 (既定 120)
 *   --cap     60          hero コンボ上限 (既定 60)
 *   --workers 6           並列ワーカー数 (既定 6)
 *   --seed    1           フロップサンプル RNG シード (既定 1)
 *   --dry-run             ジョブ一覧を表示して終了 (求解しない)
 *
 * 出力:
 *   - ボード単位キャッシュ: scripts/.cache/postflop-ev/{potKey}__{board}.json
 *   - 構成単位 V 行列:      scripts/data/postflop-ev-model/{potKey}.json
 *
 * ポット構成 (10 構成):
 *   SRP  (5 構成): srp-btn-bb / srp-co-bb / srp-mp-bb / srp-utg-bb / srp-sb-bb
 *   3bet (5 構成): 3bp-bb-vs-btn / 3bp-btn-vs-bb / 3bp-bb-vs-co / 3bp-co-vs-bb / 3bp-sb-vs-btn
 *
 * potBB / effStackBB 導出根拠:
 *   SRP (BTN/CO/MP/UTG open 2.5BB):  pot = opener(2.5) + BB_call(2.5) + SB_dead(0.5) = 5.5BB
 *   SRP (SB open 3.0BB):             pot = opener(3.0) + BB_call(3.0)               = 6.0BB
 *                                    ※ SB open は相手が BB のみ → SB dead なし
 *   3bet (各 3bp-* スポット):        pot = 3better(11) + opener_call(11) + SB_dead(0.5) = 22.5BB
 *                                    ※ SB/BB が 3better の場合は dead ブラインドなし
 *                                    → representativeBoards.ts REPRESENTATIVE_SPOT_SETS と同値
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalFlops } from '../src/lib/solver/suitIsomorphism.ts'
import { spotRanges } from '../src/lib/solver/riverRanges.ts'
import { capRangeSuitClosed } from '../src/lib/solver/rangeNarrowing.ts'
import { boardSuitPerms } from '../src/lib/solver/suitIsomorphism.ts'
import { CATEGORIES } from '../src/lib/solver/pushFold.ts'
import { runJobPool } from './lib/jobPool.ts'
import type { EvModelJobInput, EvModelJobOutput } from './ev-model-worker.ts'
import type { CfrOpts } from '../src/lib/solver/chanceCfr.ts'
import type { Card } from '../src/types/game.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR  = resolve(__dirname, '.cache/postflop-ev')
const OUTPUT_DIR = resolve(__dirname, 'data/postflop-ev-model')
const WORKER_PATH = resolve(__dirname, './ev-model-worker.ts')

// ── CLI 引数パーサ ─────────────────────────────────────────────────────────────
const argVal = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const argFlag = (name: string): boolean => process.argv.includes(`--${name}`)

const CONFIGS_ARG   = argVal('configs')?.split(',')
const N_SAMPLE      = Number(argVal('n')       ?? 60)
const ITERS         = Number(argVal('iters')   ?? 120)
const CAP           = Number(argVal('cap')     ?? 60)
const WORKERS       = Number(argVal('workers') ?? 6)
const SEED          = Number(argVal('seed')    ?? 1)
const DRY_RUN       = argFlag('dry-run')
const WORKER_HEAP   = Number(argVal('worker-heap-mb') ?? 3072)

// DCFR を標準で有効化 (Phase A と同設定)
const CFR_OPTS: CfrOpts = { dcfr: { alpha: 1.5, beta: 0, gamma: 2 } }

// ── ポット構成定義 ─────────────────────────────────────────────────────────────

export interface PotConfig {
  potKey: string
  // 出力 {potKey}.json の vOop/vIp を引く RangeScenario id (attachModelEV.heroValueMatrix が
  // hero.id と完全一致で照合する消費側コントラクト)。spotRanges には渡さない (それは spotId)。
  oopId: string     // vOop 側 = 物理 OOP 側の hero シナリオ id (例 SRP 'bb-vs-btn' / 3bet 'bb-vs-btn'=BB 3better)
  ipId: string      // vIp 側 = 物理 IP 側の hero シナリオ id (例 SRP 'btn-open' / 3bet 'btn-vs-bb-3bet'=opener が 3bet 直面)
  spotId: string    // spotRanges に渡す baseSpotId (レンジ解決はこれのみで行う)
  potType: 'srp' | '3bet'
  potBB: number
  effStackBB: number
}

// SRP: BB が OOP。opener が IP。potBB=5.5 (SB open のみ 6.0)。
// spotRanges(spotId) は bb-vs-X (OOP=BB, IP=opener) または X-open (OOP=BB, IP=opener) を解決する。
// Phase B では attachHeuristicEV.ts / precompute-preflop-ev.ts が必要とする
// (opener, defender) のポットを網羅する。
// - opener spot (X-open): hero=IP=opener → spotId = '{X}-open' 系
// - defender spot (bb-vs-X): hero=OOP=BB → spotId = 'bb-vs-{X}' 系
// いずれも同じ物理ポット(BB vs opener の HU SRP)なので 1 構成が両シナリオを代表する。

const SRP_CONFIGS: PotConfig[] = [
  { potKey: 'srp-btn-bb', oopId: 'bb-vs-btn', ipId: 'btn-open', spotId: 'bb-vs-btn',
    potType: 'srp', potBB: 5.5, effStackBB: 100 },
  { potKey: 'srp-co-bb',  oopId: 'bb-vs-co',  ipId: 'co-open',  spotId: 'bb-vs-co',
    potType: 'srp', potBB: 5.5, effStackBB: 100 },
  { potKey: 'srp-mp-bb',  oopId: 'bb-vs-mp',  ipId: 'mp-open',  spotId: 'bb-vs-mp',
    potType: 'srp', potBB: 5.5, effStackBB: 100 },
  { potKey: 'srp-utg-bb', oopId: 'bb-vs-utg', ipId: 'utg-open', spotId: 'bb-vs-utg',
    potType: 'srp', potBB: 5.5, effStackBB: 100 },
  // SB open=3.0BB, BB calls 3.0BB, pot = 6.0BB (SB はブラインド払い者=OOP)
  { potKey: 'srp-sb-bb',  oopId: 'bb-vs-sb',  ipId: 'sb-open',  spotId: 'bb-vs-sb',
    potType: 'srp', potBB: 6.0, effStackBB: 100 },
]

// 3bet ポット: representativeBoards.ts の REPRESENTATIVE_3BET_SPOTS と同じ 5 ペア。
// potBB=22.5, effStackBB=89 は REPRESENTATIVE_SPOT_SETS と一致させる。
// oopId/ipId は消費側 (attachModelEV) の RangeScenario id。物理 OOP=3better, IP=opener(3bet 直面)。
// 例 3bp-bb-vs-btn: BB が 3better(=OOP, vOop→'bb-vs-btn'), BTN が opener(=IP, vIp→'btn-vs-bb-3bet')。
// 同一物理ポットの 2 構成 (bb-vs-btn/btn-vs-bb) は同じ id を持ち loadModels で先勝ち dedup される。
const THREE_BET_CONFIGS: PotConfig[] = [
  { potKey: '3bp-bb-vs-btn',  oopId: 'bb-vs-btn',  ipId: 'btn-vs-bb-3bet',
    spotId: '3bp-bb-vs-btn',  potType: '3bet', potBB: 22.5, effStackBB: 89 },
  { potKey: '3bp-btn-vs-bb',  oopId: 'bb-vs-btn',  ipId: 'btn-vs-bb-3bet',
    spotId: '3bp-btn-vs-bb',  potType: '3bet', potBB: 22.5, effStackBB: 89 },
  { potKey: '3bp-bb-vs-co',   oopId: 'bb-vs-co',   ipId: 'co-vs-bb-3bet',
    spotId: '3bp-bb-vs-co',   potType: '3bet', potBB: 22.5, effStackBB: 89 },
  { potKey: '3bp-co-vs-bb',   oopId: 'bb-vs-co',   ipId: 'co-vs-bb-3bet',
    spotId: '3bp-co-vs-bb',   potType: '3bet', potBB: 22.5, effStackBB: 89 },
  { potKey: '3bp-sb-vs-btn',  oopId: 'sb-vs-btn',  ipId: 'btn-vs-sb-3bet',
    spotId: '3bp-sb-vs-btn',  potType: '3bet', potBB: 22.5, effStackBB: 89 },
]

export const ALL_CONFIGS: PotConfig[] = [...SRP_CONFIGS, ...THREE_BET_CONFIGS]

// ── フロップ テクスチャ bucket 分類 ──────────────────────────────────────────────
// 正準フロップをテクスチャで層化しウェイト比例サンプリングする。

type SuitTexture = 'monotone' | 'twotone' | 'rainbow'
type RankTier    = 'high' | 'mid' | 'low'   // high=A/K/Q含む, mid=J/T/9/8, low=7以下
type PairStatus  = 'paired' | 'unpaired'

interface FlopBucket {
  suitTexture: SuitTexture
  rankTier: RankTier
  pairStatus: PairStatus
}

function classifyFlop(board: Card[]): FlopBucket {
  const suits = board.map(c => c.suit)
  const uniqueSuits = new Set(suits).size
  const suitTexture: SuitTexture =
    uniqueSuits === 1 ? 'monotone' : uniqueSuits === 2 ? 'twotone' : 'rainbow'

  const ranks = board.map(c => c.rank)
  const HIGH_RANKS = new Set(['A', 'K', 'Q'])
  const MID_RANKS  = new Set(['J', 'T', '9', '8'])
  const rankTier: RankTier = ranks.some(r => HIGH_RANKS.has(r)) ? 'high'
    : ranks.some(r => MID_RANKS.has(r)) ? 'mid' : 'low'

  const pairStatus: PairStatus = ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]
    ? 'paired' : 'unpaired'

  return { suitTexture, rankTier, pairStatus }
}

function bucketKey(b: FlopBucket): string {
  return `${b.suitTexture}-${b.rankTier}-${b.pairStatus}`
}

// ── 決定的疑似乱数 (simple seeded LCG) ──────────────────────────────────────────
class SeededRandom {
  private state: number
  constructor(seed: number) { this.state = seed >>> 0 }
  next(): number {
    // LCG: 同一シードで同一列を保証
    this.state = Math.imul(this.state, 1664525) + 1013904223 >>> 0
    return this.state / 0x100000000
  }
}

// ── 層化サンプル: bucket ごとにウェイト比例でフロップを抽選 ──────────────────────
function stratifiedSample(
  all: { board: Card[]; weight: number }[],
  n: number,
  seed: number,
): { board: Card[]; weight: number }[] {
  // bucket → フロップリスト
  const buckets = new Map<string, { board: Card[]; weight: number }[]>()
  for (const f of all) {
    const key = bucketKey(classifyFlop(f.board))
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(f)
  }

  // 各 bucket の総ウェイトで按分。n が bucket 数より小さい場合は上位 n バケットから 1 枚ずつ。
  const totalWeight = all.reduce((s, f) => s + f.weight, 0)
  const bucketList = [...buckets.entries()].map(([k, items]) => ({
    k, items, w: items.reduce((s, f) => s + f.weight, 0),
  })).sort((a, b) => b.w - a.w)

  const allocations = new Map<string, number>()

  if (n <= bucketList.length) {
    // n が bucket 数以下: ウェイト上位 n バケットに 1 枚ずつ割り当て
    for (let i = 0; i < bucketList.length; i++) {
      allocations.set(bucketList[i].k, i < n ? 1 : 0)
    }
  } else {
    // 通常ケース: ウェイト比例で割り当て、余りを最大バケットで調整
    let allocatedTotal = 0
    for (const { k, w } of bucketList) {
      const alloc = Math.max(1, Math.round(n * w / totalWeight))
      allocations.set(k, alloc)
      allocatedTotal += alloc
    }
    // 配分合計が n に一致しない場合は最大バケットで調整
    const diff = n - allocatedTotal
    if (diff !== 0) {
      const maxKey = bucketList[0].k
      allocations.set(maxKey, Math.max(1, (allocations.get(maxKey) ?? 1) + diff))
    }
  }

  const rng = new SeededRandom(seed)
  const result: { board: Card[]; weight: number }[] = []

  for (const [k, items] of buckets) {
    const alloc = Math.min(allocations.get(k) ?? 1, items.length)
    // ウェイト比例サンプリング (with replacement を避けるため Fisher-Yates ランダム順)
    const shuffled = [...items].sort(() => rng.next() - 0.5)
    // ウェイト比例で上位 alloc 枚を選ぶ: 単純にシャッフル後先頭 alloc 枚(均一近似)
    // より正確には重み付き reservoir sampling だが、クラス内ウェイト分散は小さいため近似十分
    result.push(...shuffled.slice(0, alloc))
  }

  return result
}

// ── キャッシュパス ─────────────────────────────────────────────────────────────
function boardStr(board: Card[]): string {
  return board.map(c => `${c.rank}${c.suit[0]}`).join('')
}

function cachePath(potKey: string, board: Card[]): string {
  return resolve(CACHE_DIR, `${potKey}__${boardStr(board)}.json`)
}

function outputPath(potKey: string): string {
  return resolve(OUTPUT_DIR, `${potKey}.json`)
}

// ── ボード単位キャッシュから構成 JSON を合成 ──────────────────────────────────────
interface BoardResult {
  board: string
  weight: number
  exploitPct: number
  vOop: (number | null)[][]
  vIp:  (number | null)[][]
}

function composeMatrix(boards: BoardResult[]): {
  vOop: (number | null)[][]
  vIp:  (number | null)[][]
} {
  const NC = CATEGORIES.length
  const wTotal = boards.reduce((s, b) => s + b.weight, 0)
  // 重み付き平均: null は除外(非衝突ペアのみ集計)
  const numOop = Array.from({ length: NC }, () => new Float64Array(NC))
  const denOop = Array.from({ length: NC }, () => new Float64Array(NC))
  const numIp  = Array.from({ length: NC }, () => new Float64Array(NC))
  const denIp  = Array.from({ length: NC }, () => new Float64Array(NC))

  for (const b of boards) {
    const w = b.weight / wTotal
    for (let i = 0; i < NC; i++) {
      for (let j = 0; j < NC; j++) {
        const vo = b.vOop[i][j]
        const vi = b.vIp[i][j]
        if (vo !== null) { numOop[i][j] += w * vo; denOop[i][j] += w }
        if (vi !== null) { numIp[i][j]  += w * vi; denIp[i][j]  += w }
      }
    }
  }

  const vOop: (number | null)[][] = Array.from({ length: NC }, (_, i) =>
    Array.from({ length: NC }, (__, j) =>
      denOop[i][j] > 0 ? numOop[i][j] / denOop[i][j] : null,
    ),
  )
  const vIp: (number | null)[][] = Array.from({ length: NC }, (_, i) =>
    Array.from({ length: NC }, (__, j) =>
      denIp[i][j] > 0 ? numIp[i][j] / denIp[i][j] : null,
    ),
  )
  return { vOop, vIp }
}

// ── V 行列 JSON スキーマ ───────────────────────────────────────────────────────
// schema: "flop-ev-matrix@1"
// V[ci][cj] = hero=CATEGORIES[ci] vs villain=CATEGORIES[cj] の
//             サブゲーム開始時点を基準とした hero の純チップ期待収支(BB)。
// 衝突ペア(同一ペア等) = null。coverage[pos=0..168] = カテゴリ別レンジ内質量 0..1。

interface FlopEvMatrix {
  schema: 'flop-ev-matrix@1'
  potKey: string
  potType: 'srp' | '3bet'
  potBB: number
  effStackBB: number
  oopId: string
  ipId: string
  vOop: (number | null)[][]
  vIp:  (number | null)[][]
  flopSample: { board: string; weight: number; exploitPct: number }[]
  coverage: { oop: number[]; ip: number[] }
  // support[ci] = そのカテゴリが非 null 行を持ったボードの重み比率 0..1。
  // capRangeSuitClosed(cap) で多くのボードから落ちる尾手は support が小さく値がノイズ。
  // 消費側 (attachModelEV) は support < 閾値 のカテゴリを heuristic にフォールバックさせる。
  support: { oop: number[]; ip: number[] }
  meta: {
    sourceName: string
    license: string
    version: string
    iters: number
    cap: number
    nBoards: number
    seed: number
  }
}

// カバレッジ(カテゴリ別の非 null 列/行数 / NC) を計算する。
function computeCoverage(vOop: (number | null)[][], vIp: (number | null)[][]): { oop: number[]; ip: number[] } {
  const NC = CATEGORIES.length
  const oopCov = new Array<number>(NC).fill(0)
  const ipCov  = new Array<number>(NC).fill(0)
  for (let i = 0; i < NC; i++) {
    let oopNonNull = 0, ipNonNull = 0
    for (let j = 0; j < NC; j++) {
      if (vOop[i][j] !== null) oopNonNull++
      if (vIp[i][j] !== null) ipNonNull++
    }
    oopCov[i] = oopNonNull / NC
    ipCov[i]  = ipNonNull / NC
  }
  return { oop: oopCov, ip: ipCov }
}

// support(カテゴリ別の「非 null 行を持ったボードの重み比率」0..1) を計算する。
// coverage が villain 到達カテゴリ数(≈ 相手レンジ幅)を測るのに対し、support は
// hero カテゴリ自身が何ボードで存在したかを測る信頼性指標。尾手は cap で多くの
// ボードから落ち support が小さい → 値が 1〜2 ボードのノイズになるため消費側で除外する。
function computeSupport(boards: BoardResult[]): { oop: number[]; ip: number[] } {
  const NC = CATEGORIES.length
  const wTotal = boards.reduce((s, b) => s + b.weight, 0) || 1
  const oopSup = new Array<number>(NC).fill(0)
  const ipSup  = new Array<number>(NC).fill(0)
  for (const b of boards) {
    for (let i = 0; i < NC; i++) {
      if (b.vOop[i].some(v => v !== null)) oopSup[i] += b.weight
      if (b.vIp[i].some(v => v !== null))  ipSup[i]  += b.weight
    }
  }
  for (let i = 0; i < NC; i++) { oopSup[i] /= wTotal; ipSup[i] /= wTotal }
  return { oop: oopSup, ip: ipSup }
}

// ── dry-run 表示 ────────────────────────────────────────────────────────────────
function printDryRun(
  configs: PotConfig[],
  samples: Map<string, { board: Card[]; weight: number }[]>,
): void {
  console.log('\n[dry-run] postflop EV モデル ジョブ一覧')
  console.log(`  --n ${N_SAMPLE} / --iters ${ITERS} / --cap ${CAP} / --workers ${WORKERS} / --seed ${SEED}`)
  console.log(`  構成数: ${configs.length} / ボード/構成: ${N_SAMPLE} / 総ジョブ: ${configs.length * N_SAMPLE}`)
  console.log()

  for (const cfg of configs) {
    const boards = samples.get(cfg.potKey) ?? []
    const bucketCounts = new Map<string, number>()
    for (const b of boards) {
      const k = bucketKey(classifyFlop(b.board))
      bucketCounts.set(k, (bucketCounts.get(k) ?? 0) + 1)
    }
    const cached = boards.filter(b => existsSync(cachePath(cfg.potKey, b.board))).length
    console.log(`  [${cfg.potType.toUpperCase()}] ${cfg.potKey}  potBB=${cfg.potBB}  stack=${cfg.effStackBB}BB  cached=${cached}/${boards.length}`)
    for (const [k, cnt] of [...bucketCounts.entries()].sort()) {
      console.log(`      ${k}: ${cnt}枚`)
    }
  }

  const totalJobs = configs.reduce((s, c) => {
    const boards = samples.get(c.potKey) ?? []
    return s + boards.filter(b => !existsSync(cachePath(c.potKey, b.board))).length
  }, 0)
  console.log(`\n  実行予定ジョブ(キャッシュ未ヒット): ${totalJobs} 件`)
  console.log('(--dry-run のため求解は実行しません)')
}

// ── メイン ──────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(CACHE_DIR,  { recursive: true })
  mkdirSync(OUTPUT_DIR, { recursive: true })

  // 対象構成の選択
  const configs = CONFIGS_ARG
    ? ALL_CONFIGS.filter(c => CONFIGS_ARG.includes(c.potKey))
    : ALL_CONFIGS

  if (configs.length === 0) {
    console.error('対象構成が 0 件。--configs の potKey を確認してください。')
    console.error('利用可能:', ALL_CONFIGS.map(c => c.potKey).join(', '))
    process.exit(1)
  }

  // 全正準フロップを取得 (1,755 枚)
  const allFlops = canonicalFlops()

  // 構成ごとに層化サンプル
  const samplesByConfig = new Map<string, { board: Card[]; weight: number }[]>()
  for (const cfg of configs) {
    const sample = stratifiedSample(allFlops, N_SAMPLE, SEED + cfg.potKey.length)
    samplesByConfig.set(cfg.potKey, sample)
  }

  if (DRY_RUN) {
    printDryRun(configs, samplesByConfig)
    return
  }

  // ジョブ構築: キャッシュ済みはスキップ
  interface JobSpec {
    cfg: PotConfig
    boardEntry: { board: Card[]; weight: number }
  }
  const allSpecs: JobSpec[] = []
  for (const cfg of configs) {
    const boards = samplesByConfig.get(cfg.potKey) ?? []
    for (const b of boards) {
      allSpecs.push({ cfg, boardEntry: b })
    }
  }

  const skipSpecs = allSpecs.filter(s => existsSync(cachePath(s.cfg.potKey, s.boardEntry.board)))
  const runSpecs  = allSpecs.filter(s => !existsSync(cachePath(s.cfg.potKey, s.boardEntry.board)))

  console.log(`postflop EV モデル構築 開始: ${runSpecs.length} ジョブ (スキップ済み ${skipSpecs.length}) / workers=${WORKERS} / heap=${WORKER_HEAP}MB`)

  // ジョブ入力を構築 (レンジ解決はメインプロセスで行い worker は受け取るだけ)
  const jobInputs: EvModelJobInput[] = runSpecs.map(spec => {
    const { cfg, boardEntry } = spec
    const ranges = spotRanges(cfg.spotId, boardEntry.board)
    const rawOop = ranges?.oop ?? []
    const rawIp  = ranges?.ip  ?? []
    const perms = boardSuitPerms(boardEntry.board).filter(Boolean)
    // capRangeSuitClosed で iso 縮約の置換閉性を保つ (precompute-flop.ts と同じ手順)
    const capped = {
      oop: capRangeSuitClosed(rawOop, CAP, perms),
      ip:  capRangeSuitClosed(rawIp,  CAP, perms),
    }
    return {
      potKey:  cfg.potKey,
      board:   boardEntry.board as EvModelJobInput['board'],
      oop:     capped.oop as EvModelJobInput['oop'],
      ip:      capped.ip  as EvModelJobInput['ip'],
      potBB:   cfg.potBB,
      stackBB: cfg.effStackBB,
      iters:   ITERS,
      cap:     CAP,
      cfrOpts: CFR_OPTS,
    }
  })

  let written = 0

  const handleResult = (res: { jobIndex: number; result?: EvModelJobOutput; error?: string }) => {
    const spec = runSpecs[res.jobIndex]

    if (res.error) {
      console.error(`\n  [ERROR] ${spec.cfg.potKey} ${boardStr(spec.boardEntry.board)}: ${res.error}`)
      return
    }
    const output = res.result!

    // ボード単位キャッシュに書き出し (再開可能にする)
    const cp = cachePath(spec.cfg.potKey, spec.boardEntry.board)
    const cacheEntry = {
      potKey:        output.potKey,
      board:         output.board,
      weight:        spec.boardEntry.weight,
      exploitPct:    +(output.exploitability * 100).toFixed(3),
      vOop:          output.vOop,
      vIp:           output.vIp,
      potBB:         output.potBB,
      stackBB:       output.stackBB,
    }
    writeFileSync(cp, JSON.stringify(cacheEntry))
    written++
    console.log(
      `  ✓ ${output.potKey} ${boardStr(spec.boardEntry.board)}` +
      `  exploit=${(output.exploitability * 100).toFixed(1)}%  →  ${cp}`,
    )
  }

  const t0 = Date.now()
  await runJobPool<EvModelJobInput, EvModelJobOutput>(jobInputs, {
    concurrency: WORKERS,
    workerPath: WORKER_PATH,
    maxOldGenerationSizeMb: WORKER_HEAP,
    onResult: handleResult,
    onProgress: ({ done, total, elapsedMs }) => {
      process.stdout.write(`\r  進捗: ${done}/${total}  (${(elapsedMs / 1000).toFixed(0)}s elapsed)`)
    },
  })
  console.log()

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\n求解完了: ${written} ジョブ書き出し (${elapsed}s)`)

  // 構成単位 V 行列を合成して出力
  console.log('\n構成 JSON 合成中…')
  for (const cfg of configs) {
    const boards = samplesByConfig.get(cfg.potKey) ?? []
    const boardResults: BoardResult[] = []

    for (const b of boards) {
      const cp = cachePath(cfg.potKey, b.board)
      if (!existsSync(cp)) {
        console.warn(`  [WARN] キャッシュが見つかりません: ${cp} (スキップ)`)
        continue
      }
      const cached = JSON.parse(readFileSync(cp, 'utf8')) as {
        weight: number; exploitPct: number
        vOop: (number | null)[][]; vIp: (number | null)[][]
        board: { rank: string; suit: string }[]
      }
      boardResults.push({
        board:      cached.board.map(c => `${c.rank}${c.suit[0]}`).join(''),
        weight:     cached.weight,
        exploitPct: cached.exploitPct,
        vOop:       cached.vOop,
        vIp:        cached.vIp,
      })
    }

    if (boardResults.length === 0) {
      console.warn(`  [WARN] ${cfg.potKey}: キャッシュ結果なし。構成 JSON をスキップ。`)
      continue
    }

    const { vOop, vIp } = composeMatrix(boardResults)
    const coverage = computeCoverage(vOop, vIp)
    const support = computeSupport(boardResults)

    const matrix: FlopEvMatrix = {
      schema:     'flop-ev-matrix@1',
      potKey:     cfg.potKey,
      potType:    cfg.potType,
      potBB:      cfg.potBB,
      effStackBB: cfg.effStackBB,
      oopId:      cfg.oopId,
      ipId:       cfg.ipId,
      vOop,
      vIp,
      flopSample: boardResults.map(b => ({
        board:      b.board,
        weight:     b.weight,
        exploitPct: b.exploitPct,
      })),
      coverage,
      support,
      meta: {
        sourceName: 'self CFR flop subgame EV (Phase B)',
        license:    'self-generated',
        version:    '1',
        iters:      ITERS,
        cap:        CAP,
        nBoards:    boardResults.length,
        seed:       SEED,
      },
    }

    const op = outputPath(cfg.potKey)
    writeFileSync(op, JSON.stringify(matrix, null, 2))
    console.log(`  → ${op}  (${boardResults.length} boards)`)
  }

  console.log('\n完了.')
}

// CLI 起動時のみ実行 (テストから ALL_CONFIGS を import しても main() を走らせない)。
const isEntry = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) main().catch(err => { console.error(err); process.exit(1) })
