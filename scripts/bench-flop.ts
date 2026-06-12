#!/usr/bin/env node
/**
 * フロップ CFR ベンチマーク。
 * cap × iters の組み合わせを直列で求解し、収束特性 (exploitability) と所要時間を表形式で出力。
 *
 *   npx tsx scripts/bench-flop.ts \
 *     --board AhKd7s --spot bb-vs-btn [--pot-type srp] \
 *     --caps 64,80,100 --iters 50,100,200,400 \
 *     [--iso] [--linear] [--dcfr] [--subsample t,r]
 *
 * --iso       capRangeSuitClosed + suitIso:true を使う
 * --linear    linearAveraging を有効化
 * --dcfr      DCFR (alpha=1.5 / beta=0 / gamma=2) を有効化
 * --subsample t,r  turn/river のサブサンプル数 (整数カンマ区切り)
 *
 * 各行を求解完了のたびにフラッシュ出力するため、長時間実行でも進捗が見える。
 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { solveFlop } from '../src/lib/solver/flopSolver.ts'
import { spotRanges } from '../src/lib/solver/riverRanges.ts'
import { capRange, capRangeSuitClosed } from '../src/lib/solver/rangeNarrowing.ts'
import { boardSuitPerms } from '../src/lib/solver/suitIsomorphism.ts'
import { REPRESENTATIVE_BOARDS } from '../src/lib/solver/representativeBoards.ts'
import type { Card } from '../src/types/game.ts'
import type { CfrOpts } from '../src/lib/solver/chanceCfr.ts'

const _dirname = dirname(fileURLToPath(import.meta.url))
void _dirname // scripts ディレクトリ参照用・将来の出力パス拡張に備えて保持

// ── FLOP_BOARDS (representativeBoards.ts の flop エントリから生成) ──
const FLOP_BOARDS = REPRESENTATIVE_BOARDS.filter(b => b.street === 'flop')

// --board のトークン結合形 (AhKd7s) をパースするため parseCard は bench 内に残す。
const RANK_MAP: Record<string, string> = {
  A:'A',K:'K',Q:'Q',J:'J',T:'T','9':'9','8':'8','7':'7','6':'6','5':'5','4':'4','3':'3','2':'2',
}
const SUIT_OF: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

function parseCard(tok: string): Card {
  const rank = RANK_MAP[tok[0]] as Card['rank']
  const suit = SUIT_OF[tok[1]] as Card['suit']
  if (!rank || !suit) throw new Error(`invalid card token: ${tok}`)
  return { rank, suit }
}

// ── REPRESENTATIVE_SPOT_SETS (src/lib/solver/representativeBoards.ts から)──
// SRP は potBB=5.5 / effStack=100、3bet は potBB=22.5 / effStack=89。
const SPOT_POT: Record<'srp' | '3bet', { potBB: number; effStackBB: number }> = {
  srp:  { potBB: 5.5,  effStackBB: 100 },
  '3bet': { potBB: 22.5, effStackBB: 89 },
}

// ── CLI 引数パーサ ─────────────────────────────────────────────────────────────
function argVal(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function argFlag(name: string): boolean { return process.argv.includes(`--${name}`) }

const BOARD_STR   = argVal('board')
const SPOT_ID     = argVal('spot')
const POT_TYPE    = (argVal('pot-type') ?? 'srp') as 'srp' | '3bet'
const CAPS_STR    = argVal('caps')   ?? '100'
const ITERS_STR   = argVal('iters')  ?? '200'
const USE_ISO     = argFlag('iso')
const USE_LINEAR  = argFlag('linear')
const USE_DCFR    = argFlag('dcfr')
const SUBSAMPLE   = argVal('subsample')

// バリデーション
if (!BOARD_STR) { console.error('[bench-flop] --board が必要です (例: --board AhKd7s)'); process.exit(1) }
if (!SPOT_ID)   { console.error('[bench-flop] --spot が必要です (例: --spot bb-vs-btn)'); process.exit(1) }

function parseIntList(s: string): number[] {
  return s.split(',').map(v => {
    const n = parseInt(v.trim(), 10)
    if (isNaN(n) || n <= 0) throw new Error(`invalid number: ${v}`)
    return n
  })
}

const CAPS  = parseIntList(CAPS_STR)
const ITERS = parseIntList(ITERS_STR)

let TURN_N: number | undefined
let RIVER_N: number | undefined
if (SUBSAMPLE) {
  const [t, r] = SUBSAMPLE.split(',').map(v => parseInt(v.trim(), 10))
  if (!t || !r || isNaN(t) || isNaN(r)) {
    console.error('[bench-flop] --subsample の形式は t,r (例: --subsample 6,6)')
    process.exit(1)
  }
  TURN_N  = t
  RIVER_N = r
}

// ── ボード解決 ─────────────────────────────────────────────────────────────────
// --board はトークン結合形 (AhKd7s) または空白区切り。FLOP_BOARDS から id での参照も可。
function resolveBoard(): Card[] {
  // FLOP_BOARDS の id で検索
  const known = FLOP_BOARDS.find(b => b.id === BOARD_STR)
  if (known) return known.board
  // トークン結合形 (AhKd7s など) をパース
  const toks = BOARD_STR!.match(/.{2}/g)
  if (!toks || toks.length !== 3) {
    console.error(`[bench-flop] --board の形式が不正です: ${BOARD_STR}`)
    console.error('  例: --board AhKd7s  (ランク+スート頭文字を3枚連結)')
    process.exit(1)
  }
  return toks.map(parseCard)
}
const BOARD = resolveBoard()
const boardStr = BOARD.map(c => `${c.rank}${c.suit[0]}`).join('')

// ── レンジ取得 ─────────────────────────────────────────────────────────────────
const ranges = spotRanges(SPOT_ID, BOARD)
if (!ranges) {
  console.error(`[bench-flop] spot "${SPOT_ID}" のレンジが見つかりません`)
  process.exit(1)
}
const RAW_OOP = ranges.oop
const RAW_IP  = ranges.ip

// ── CFR オプション ─────────────────────────────────────────────────────────────
function buildCfrOpts(): CfrOpts | undefined {
  if (!USE_LINEAR && !USE_DCFR) return undefined
  const opts: CfrOpts = {}
  if (USE_LINEAR) opts.linearAveraging = true
  if (USE_DCFR)   opts.dcfr = { alpha: 1.5, beta: 0, gamma: 2 }
  return opts
}
const CFR_OPTS = buildCfrOpts()

// ── iso 用 cap ─────────────────────────────────────────────────────────────────
function capWithIso(raw: typeof RAW_OOP, cap: number) {
  if (!USE_ISO) return capRange(raw, undefined, cap)
  const perms = boardSuitPerms(BOARD).filter(Boolean)
  return capRangeSuitClosed(raw, cap, perms)
}

// ── ピーク RSS 追跡 ────────────────────────────────────────────────────────────
let peakRss = process.memoryUsage().rss
function sampleRss(): void {
  const cur = process.memoryUsage().rss
  if (cur > peakRss) peakRss = cur
}

// ── テーブルヘッダ ─────────────────────────────────────────────────────────────
const ISO_LABEL    = USE_ISO    ? 'iso'    : '-'
const LINEAR_LABEL = USE_LINEAR ? 'linear' : '-'
const DCFR_LABEL   = USE_DCFR   ? 'dcfr'  : '-'
const SUB_LABEL    = SUBSAMPLE  ? SUBSAMPLE : 'full'

console.log()
console.log(`=== bench-flop ===`)
console.log(`  board  : ${boardStr}`)
console.log(`  spot   : ${SPOT_ID}  (${POT_TYPE})`)
const { potBB, effStackBB } = SPOT_POT[POT_TYPE]
console.log(`  pot/stack: ${potBB}BB / ${effStackBB}BB`)
console.log(`  caps   : ${CAPS.join(', ')}`)
console.log(`  iters  : ${ITERS.join(', ')}`)
console.log(`  iso    : ${ISO_LABEL}`)
console.log(`  cfrOpts: ${LINEAR_LABEL} / ${DCFR_LABEL}`)
console.log(`  subsample turn/river: ${SUB_LABEL}`)
console.log()

// ヘッダ行の列幅
const COL = { cap: 6, iters: 6, iso: 5, secs: 8, exploit: 12, rss: 10 }
function pad(s: string, w: number) { return s.padStart(w) }
function header() {
  return [
    pad('cap',     COL.cap),
    pad('iters',   COL.iters),
    pad('iso',     COL.iso),
    pad('sec',     COL.secs),
    pad('exploit%', COL.exploit),
    pad('peakRSS',  COL.rss),
  ].join('  ')
}
console.log(header())
console.log('-'.repeat(Object.values(COL).reduce((a, b) => a + b, 0) + (Object.keys(COL).length - 1) * 2))

// ── 求解ループ (iters 昇順で各行フラッシュ) ────────────────────────────────────
// CAPS × ITERS のすべての組み合わせを直列実行し、各行を完了次第 stdout へ出力する。
for (const cap of CAPS) {
  const oop = capWithIso(RAW_OOP, cap)
  const ip  = capWithIso(RAW_IP,  cap)

  for (const iters of [...ITERS].sort((a, b) => a - b)) {
    sampleRss()
    const t0 = performance.now()

    const sol = solveFlop({
      board: BOARD,
      oop,
      ip,
      potBB,
      stackBB: effStackBB,
      iterations: iters,
      turnRunoutN:  TURN_N,
      riverRunoutN: RIVER_N,
      cfrOpts: CFR_OPTS,
      suitIso: USE_ISO ? true : undefined,
    })

    const elapsed = (performance.now() - t0) / 1000
    sampleRss()

    const exploit = (sol.exploitability * 100).toFixed(2) + '%'
    const rssMB   = (peakRss / 1024 / 1024).toFixed(0) + 'MB'
    const isoStr  = USE_ISO ? 'yes' : 'no'

    const row = [
      pad(String(cap),    COL.cap),
      pad(String(iters),  COL.iters),
      pad(isoStr,         COL.iso),
      pad(elapsed.toFixed(2) + 's', COL.secs),
      pad(exploit,        COL.exploit),
      pad(rssMB,          COL.rss),
    ].join('  ')

    // フラッシュ出力 (長時間実行での進捗確認用)
    process.stdout.write(row + '\n')
  }
}

console.log()
console.log(`完了。`)
