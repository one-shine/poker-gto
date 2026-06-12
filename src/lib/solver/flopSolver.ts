import type { Card } from '../../types/game'
import { sameCard } from '../../engine/cards/Card'
import type { Combo, RiverInput } from './riverSolver'
import {
  type Node, type ChanceChild, type ChanceChildMember, type ChanceSolution, type CfrOpts,
  buildBettingLayer, strictEquity5, allRunouts, selectRunouts, removalMasks, solveChanceTree, cardKey,
} from './chanceCfr'
import {
  boardSuitPerms, runoutClasses, comboIndexPerm, applyPermToCard,
  type SuitPerm, type RunoutClass,
} from './suitIsomorphism'

// ── flop 完全チャンスノード CFR(3ストリート・2チャンス層)──────────────────────
// flop(board=3枚)を「flop ベッティング → ChanceNode(turn札) → turn ベッティング →
// ChanceNode(river札) → river ベッティング → 厳密2値ショーダウン」の3街 CFR で求解する。
// turn の完全チャンス CFR(R14②)を1層深くしたもの。チャンス CFR コア(chanceCfr.ts)は
// チャンス層の深さに非依存なので、ここでは2層ネストの木を構築するだけ。
//
// ⚠ 計算量は O(N_turn × N_river × combos² × ノード) で重い。live solve には不向きで、
// **事前計算(scripts/precompute-flop.ts)専用**。getSolution は生成済み JSON を配給する。
// turn/river のランナウトは独立にサブサンプル可能(turnRunoutN / riverRunoutN)。
//
// suitIso(opt-in): ボードを集合として固定するスート置換でランナウトを同値類に縮約し、
// 代表 subtree のみ構築・traverse する(値は chanceCfr の置換アキュムレートで合成)。
// 両レンジが置換で閉じている(comboIndexPerm 非null)ことが前提で、閉じない置換は捨てる。
// 全置換が落ちれば従来動作。getSolution→solverClient のライブ経路は suitIso を渡さない。
// ランナウトをサブサンプルする場合、member の river 札集合は「代表の置換像」になるため
// 従来(member ごとに selectRunouts)とは集合が一致せず、解は厳密一致しない(全列挙では一致)。

export type FlopSolution = ChanceSolution

export interface FlopInput extends RiverInput {
  turnRunoutN?: number  // turn 札のサンプル数(未指定=全49列挙)
  riverRunoutN?: number // turn 確定後の river 札のサンプル数(未指定=全48列挙)
  cfrOpts?: CfrOpts     // 収束改善(linearAveraging / dcfr)。未指定=従来 CFR+ と同一挙動
  suitIso?: boolean     // スート同型ランナウト縮約(opt-in・事前計算専用)。未指定=従来動作
}

const HALF = (pot: number) => pot / 2

// (turnCard, riverCard) ごとの eq / カードごとの除去マスクは flop終端×turn終端 の組み合わせ分
// (~5×5=25回)同一計算が走るため、solveFlop スコープで dedup する(eq はユニーク N_turn×N_river 回)。
interface BuildCache {
  eq: Map<string, number[][]>
  masks: Map<string, { removedOOP: boolean[]; removedIP: boolean[] }>
  riverCards: Map<string, Card[]>
}

function getMasks(cache: BuildCache, oop: Combo[], ip: Combo[], card: Card) {
  const k = cardKey(card)
  let m = cache.masks.get(k)
  if (!m) { m = removalMasks(oop, ip, card); cache.masks.set(k, m) }
  return m
}

// suitIso コンテキスト。perms = flop を集合固定し、かつ両レンジが閉じる置換群(恒等含む)。
// invCache は置換(代表→member)ごとの「member→代表」combo 写像 = comboIndexPerm(combos, perm⁻¹)。
interface IsoCtx {
  perms: SuitPerm[]
  invCache: Map<string, { oop: Int32Array; ip: Int32Array } | null>
}

const permKey = (p: SuitPerm): string => `${p[0]}${p[1]}${p[2]}${p[3]}`

function invertPerm(p: SuitPerm): SuitPerm {
  const inv = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) inv[p[i]] = i
  return [inv[0], inv[1], inv[2], inv[3]]
}

// クラスの全物理 runout を ChanceChildMember[] へ(代表自身=恒等も含む)。
// permOOP/permIP は member→代表の combo index 写像(v_member[i] = v_repr[permOOP[i]] の向き)。
// member の置換でレンジが閉じていなければ null = このクラスは縮約しない(安全弁)。
function buildMembers(
  cls: RunoutClass, oop: Combo[], ip: Combo[], cache: BuildCache, iso: IsoCtx,
): ChanceChildMember[] | null {
  const out: ChanceChildMember[] = []
  for (const m of cls.members) {
    const key = permKey(m.perm)
    let inv = iso.invCache.get(key)
    if (inv === undefined) {
      const invPerm = invertPerm(m.perm) // m.perm は代表→member。読み出しは逆向きで構築
      const o = comboIndexPerm(oop, invPerm)
      const i = comboIndexPerm(ip, invPerm)
      inv = o && i ? { oop: o, ip: i } : null
      iso.invCache.set(key, inv)
    }
    if (!inv) return null
    const masks = getMasks(cache, oop, ip, m.card)
    out.push({
      card: m.card, removedOOP: masks.removedOOP, removedIP: masks.removedIP,
      permOOP: inv.oop, permIP: inv.ip,
    })
  }
  return out
}

// river ChanceNode(turn 確定後)。river サブツリーは厳密ショーダウン終端。
function makeRiverChance(
  flop3: Card[], turnCard: Card, potAfterFlop: number, turnStack: number,
  turnCommitted: [number, number], oop: Combo[], ip: Combo[],
  betSizes: number[], raiseSizes: number[], riverRunoutN: number | undefined,
  cache: BuildCache, iso: IsoCtx | undefined,
): Node {
  if (Math.abs(turnCommitted[0] - turnCommitted[1]) > 1e-9) throw new Error('river chance: asymmetric commits')
  const potAfterTurn = potAfterFlop + turnCommitted[0] + turnCommitted[1]
  const halfR = HALF(potAfterTurn)
  const riverStack = turnStack - turnCommitted[0]
  const board4 = [...flop3, turnCard]
  const tKey = cardKey(turnCard)
  let riverCards = cache.riverCards.get(tKey)
  if (!riverCards) {
    riverCards = riverRunoutN != null ? selectRunouts(board4, riverRunoutN) : allRunouts(board4)
    cache.riverCards.set(tKey, riverCards)
  }
  const mkChild = (riverCard: Card, members?: ChanceChildMember[]): ChanceChild => {
    const rKey = tKey + cardKey(riverCard)
    let eq = cache.eq.get(rKey)
    if (!eq) { eq = strictEquity5(oop, ip, [...board4, riverCard]); cache.eq.set(rKey, eq) }
    const masks = getMasks(cache, oop, ip, riverCard)
    return {
      card: riverCard, eq, removedOOP: masks.removedOOP, removedIP: masks.removedIP, members,
      subtree: buildBettingLayer({
        pot: potAfterTurn, stack: riverStack, betSizes, raiseSizes, foldHalf: halfR,
        onShowdown: (committed) => ({ kind: 'showdown', committed, half: halfR }),
      }),
    }
  }
  // river 縮約に使えるのは flop 集合に加え turn 札も固定する置換のみ(reach に flop/turn 層の
  // 戦略が乗るため、対称性が保証されるのはこの stabilizer 部分群に限る)。
  const perms = iso ? iso.perms.filter(p => sameCard(applyPermToCard(turnCard, p), turnCard)) : []
  let runouts: ChanceChild[]
  if (perms.length > 1) {
    runouts = []
    for (const cls of runoutClasses(board4, riverCards, perms)) {
      if (cls.members.length === 1) { runouts.push(mkChild(cls.repr)); continue }
      const members = buildMembers(cls, oop, ip, cache, iso!)
      if (members) runouts.push(mkChild(cls.repr, members))
      else for (const m of cls.members) runouts.push(mkChild(m.card)) // 安全弁: 類ごと従来構築
    }
  } else {
    runouts = riverCards.map(rc => mkChild(rc))
  }
  return { kind: 'chance', potAfter: potAfterTurn, committedAtChance: turnCommitted, runouts }
}

// turn ChanceNode(flop 確定後)。turn サブツリーの非fold 終端は river ChanceNode(eq は最終層のみ)。
function makeTurnChance(
  flop3: Card[], potBB: number, stack: number, flopCommitted: [number, number],
  oop: Combo[], ip: Combo[], betSizes: number[], raiseSizes: number[],
  turnRunoutN: number | undefined, riverRunoutN: number | undefined,
  cache: BuildCache, iso: IsoCtx | undefined,
): Node {
  if (Math.abs(flopCommitted[0] - flopCommitted[1]) > 1e-9) throw new Error('turn chance: asymmetric commits')
  const potAfterFlop = potBB + flopCommitted[0] + flopCommitted[1]
  const halfT = HALF(potAfterFlop)
  const turnStack = stack - flopCommitted[0]
  const turnCards = turnRunoutN != null ? selectRunouts(flop3, turnRunoutN) : allRunouts(flop3)
  const mkChild = (turnCard: Card, members?: ChanceChildMember[]): ChanceChild => {
    const masks = getMasks(cache, oop, ip, turnCard)
    return {
      card: turnCard,
      eq: null, // 中間チャンス: 直下に showdown 無し(さらに river チャンスへ)
      removedOOP: masks.removedOOP, removedIP: masks.removedIP, members,
      subtree: buildBettingLayer({
        pot: potAfterFlop, stack: turnStack, betSizes, raiseSizes, foldHalf: halfT,
        onShowdown: (turnCommitted) => makeRiverChance(
          flop3, turnCard, potAfterFlop, turnStack, turnCommitted, oop, ip, betSizes, raiseSizes,
          riverRunoutN, cache, iso,
        ),
      }),
    }
  }
  let runouts: ChanceChild[]
  if (iso) {
    runouts = []
    for (const cls of runoutClasses(flop3, turnCards, iso.perms)) {
      if (cls.members.length === 1) { runouts.push(mkChild(cls.repr)); continue }
      const members = buildMembers(cls, oop, ip, cache, iso)
      if (members) runouts.push(mkChild(cls.repr, members))
      else for (const m of cls.members) runouts.push(mkChild(m.card)) // 安全弁: 類ごと従来構築
    }
  } else {
    runouts = turnCards.map(tc => mkChild(tc))
  }
  return { kind: 'chance', potAfter: potAfterFlop, committedAtChance: flopCommitted, runouts }
}

export function solveFlop(input: FlopInput): FlopSolution {
  const { oop, ip, potBB } = input
  const iterations = input.iterations ?? 60
  const betSizes = input.betSizes ?? [0.66]
  const raiseSizes = input.raiseSizes ?? []
  const flop3 = input.board
  const cache: BuildCache = { eq: new Map(), masks: new Map(), riverCards: new Map() }

  let iso: IsoCtx | undefined
  if (input.suitIso) {
    // 板を集合固定し、かつ両レンジが閉じる置換のみ残す(comboIndexPerm null は捨てる)。
    // 閉性でのフィルタは部分群を保つ(合成・逆元で閉じる)ので runoutClasses の分割性は不変。
    const perms = boardSuitPerms(flop3).filter(p =>
      comboIndexPerm(oop, p) != null && comboIndexPerm(ip, p) != null)
    if (perms.length > 1) iso = { perms, invCache: new Map() }
    // 恒等のみ → 縮約余地なし: 従来動作へフォールバック
  }

  const root = buildBettingLayer({
    pot: potBB, stack: input.stackBB, betSizes, raiseSizes, foldHalf: HALF(potBB),
    onShowdown: (flopCommitted) => makeTurnChance(
      flop3, potBB, input.stackBB, flopCommitted, oop, ip, betSizes, raiseSizes,
      input.turnRunoutN, input.riverRunoutN, cache, iso,
    ),
  })

  return solveChanceTree(root, oop, ip, potBB, iterations, input.cfrOpts)
}
