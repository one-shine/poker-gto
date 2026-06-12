import type { Card, Suit } from '../../types/game'
import { RANKS, SUITS, RANK_VALUES } from '../../engine/cards/Card'
import type { Combo } from './riverSolver'

// ── スート同型 (suit isomorphism) ユーティリティ ────────────────────────────────
// プリフロップレンジは169カテゴリでスート対称なので、ボードを集合として固定する
// スート置換の下で runout (turn/river 札) を同値類に縮約できる (flop CFR 事前計算の
// 高速化)。本モジュールは純粋ユーティリティのみ (chanceCfr への統合は次工程)。
// 依存方向: engine ← solver。React 非依存の純 TS。

// SUITS index の置換。perm[i] = 元 suit i の写像先 index。
export type SuitPerm = readonly [number, number, number, number]

const SUIT_INDEX = SUITS.reduce((acc, s, i) => { acc[s] = i; return acc }, {} as Record<Suit, number>)

export const IDENTITY_PERM: SuitPerm = [0, 1, 2, 3]

// rank/suit からの一意整数 (0..51)。repr の決定的選定とコンボ照合キーの基礎。
export function cardId(c: Card): number {
  return (RANK_VALUES[c.rank] - 2) * 4 + SUIT_INDEX[c.suit]
}

export function applyPermToCard(card: Card, perm: SuitPerm): Card {
  return { rank: card.rank, suit: SUITS[perm[SUIT_INDEX[card.suit]]] }
}

function buildAllPerms(): SuitPerm[] {
  const out: SuitPerm[] = []
  const cur: number[] = []
  const used = [false, false, false, false]
  const rec = (): void => {
    if (cur.length === 4) { out.push([cur[0], cur[1], cur[2], cur[3]]); return }
    for (let v = 0; v < 4; v++) {
      if (used[v]) continue
      used[v] = true
      cur.push(v)
      rec()
      cur.pop()
      used[v] = false
    }
  }
  rec()
  return out
}
// 辞書順生成 → 先頭は恒等置換 (runoutClasses が repr に恒等 perm を割り当てる根拠)
const ALL_PERMS: readonly SuitPerm[] = buildAllPerms()

// ボードを「集合として」固定する置換群。4!=24 を総当りし、板の各カードが置換後も
// 板に存在するものだけ残す。恒等置換は常に含まれ、結果は群を成す。
export function boardSuitPerms(board: Card[]): SuitPerm[] {
  const ids = new Set(board.map(cardId))
  return ALL_PERMS.filter(p => board.every(c => ids.has(cardId(applyPermToCard(c, p)))))
}

export interface RunoutClass {
  repr: Card // クラス内最小 cardId の代表札
  members: { card: Card; perm: SuitPerm }[] // perm は repr → card の置換。repr 自身 (恒等) も含む
}

// runouts を perms の軌道で同値類に分割する。perms は boardSuitPerms の戻り値 (群) を想定。
// 群でない perms では分割性が壊れ得るため、板を固定しない perm は即座に拒否する。
export function runoutClasses(board: Card[], runouts: Card[], perms: SuitPerm[]): RunoutClass[] {
  const boardIds = new Set(board.map(cardId))
  for (const p of perms) {
    if (!board.every(c => boardIds.has(cardId(applyPermToCard(c, p)))))
      throw new Error('runoutClasses: perm がボードを固定していない')
  }
  const byId = new Map<number, Card>()
  for (const c of runouts) byId.set(cardId(c), c)
  const visited = new Set<number>()
  const classes: RunoutClass[] = []
  const ascending = [...byId.keys()].sort((a, b) => a - b)
  for (const id of ascending) {
    if (visited.has(id)) continue
    // 昇順走査なので、軌道で最初に出会う未訪問札 = クラス内最小 cardId = repr
    const repr = byId.get(id)!
    const memberPerm = new Map<number, SuitPerm>()
    for (const perm of perms) {
      const mid = cardId(applyPermToCard(repr, perm))
      if (byId.has(mid) && !memberPerm.has(mid)) memberPerm.set(mid, perm)
    }
    const members = [...memberPerm.keys()].sort((a, b) => a - b)
      .map(mid => ({ card: byId.get(mid)!, perm: memberPerm.get(mid)! }))
    for (const m of members) visited.add(cardId(m.card))
    classes.push({ repr, members })
  }
  return classes
}

// combos[i] を perm で写した先のコンボ index を返す。写し先が combos に無い、または
// weight が一致 (誤差1e-9) しなければ null (スート非対称レンジ = 縮約不可の安全弁)。
// コンボ内の2枚の順序は cardId で正規化して照合する (入力の順序に依存しない)。
export function comboIndexPerm(combos: Combo[], perm: SuitPerm): Int32Array | null {
  const pairKey = (a: Card, b: Card): number => {
    const ia = cardId(a)
    const ib = cardId(b)
    return ia < ib ? ia * 52 + ib : ib * 52 + ia
  }
  const index = new Map<number, number>()
  for (let i = 0; i < combos.length; i++) {
    const k = pairKey(combos[i].cards[0], combos[i].cards[1])
    if (!index.has(k)) index.set(k, i)
  }
  const out = new Int32Array(combos.length)
  for (let i = 0; i < combos.length; i++) {
    const j = index.get(pairKey(
      applyPermToCard(combos[i].cards[0], perm),
      applyPermToCard(combos[i].cards[1], perm),
    ))
    if (j === undefined) return null
    if (Math.abs(combos[j].weight - combos[i].weight) > 1e-9) return null
    out[i] = j
  }
  return out
}

// ── 正準フロップ ────────────────────────────────────────────────────────────────
// 正準形の定義: カードを code = (14 - rankValue)*4 + suitIndex に符号化し (code 昇順 =
// ランク降順・同ランクはスート index 昇順)、3枚を code 昇順に並べた数値キー
// (c0*52 + c1)*52 + c2 を 24 スート置換すべてについて計算した最小値をクラスの正準キーと
// する。正準キーを復号した3枚が代表ボード (自身を再正準化しても不動)。

function codeOf(c: Card, perm: SuitPerm): number {
  return (14 - RANK_VALUES[c.rank]) * 4 + perm[SUIT_INDEX[c.suit]]
}

function flopKey(b0: Card, b1: Card, b2: Card, perm: SuitPerm): number {
  let a = codeOf(b0, perm)
  let b = codeOf(b1, perm)
  let c = codeOf(b2, perm)
  if (a > b) { const t = a; a = b; b = t }
  if (b > c) { const t = b; b = c; c = t }
  if (a > b) { const t = a; a = b; b = t }
  return (a * 52 + b) * 52 + c
}

function cardFromCode(code: number): Card {
  return { rank: RANKS[12 - (code >> 2)], suit: SUITS[code & 3] }
}

function boardFromKey(key: number): Card[] {
  const c2 = key % 52
  const rest = (key - c2) / 52
  const c1 = rest % 52
  const c0 = (rest - c1) / 52
  return [cardFromCode(c0), cardFromCode(c1), cardFromCode(c2)]
}

function minFlopKey(b0: Card, b1: Card, b2: Card): number {
  let best = Number.MAX_SAFE_INTEGER
  for (const perm of ALL_PERMS) {
    const k = flopKey(b0, b1, b2, perm)
    if (k < best) best = k
  }
  return best
}

// 任意のフロップをスート同型の正準形 (代表ボード) へ写す。
export function canonicalizeFlop(board: Card[]): Card[] {
  return boardFromKey(minFlopKey(board[0], board[1], board[2]))
}

// 全 C(52,3)=22,100 フロップをスート同型で正準化した代表 1,755 枚と各クラスサイズ (weight)。
export function canonicalFlops(): { board: Card[]; weight: number }[] {
  const deck: Card[] = []
  for (const rank of RANKS) for (const suit of SUITS) deck.push({ rank, suit })
  const counts = new Map<number, number>()
  for (let i = 0; i < 52; i++) {
    for (let j = i + 1; j < 52; j++) {
      for (let k = j + 1; k < 52; k++) {
        const key = minFlopKey(deck[i], deck[j], deck[k])
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0])
    .map(([key, weight]) => ({ board: boardFromKey(key), weight }))
}
