import type { Card, Rank } from '../../types/game'
import { sameCard, RANK_VALUES } from '../../engine/cards/Card'
import { createDeck } from '../../engine/cards/Deck'
import { fastCardId, evaluate7 } from './fastEval7'
import type { Combo, SolvedAction, SolvedNodeSummary } from './riverSolver'

// ── 共有チャンスノード CFR コア ────────────────────────────────────────────────
// turn(1チャンス層)/ flop(2チャンス層・turn→river)を同じベクトル CFR(CFR+)で求解する。
// traverse/valueAvg/massAvg/brValue は node.kind==='chance' で再帰するため、チャンス層が
// 何層ネストしていても同一コードで動く(turnSolver/flopSolver はツリー構築のみ差し替える)。
// riverSolver.ts は別アルゴリズム(チャンス層なし・ランナウト平均エクイティ)で不変。
//
// 設計(R14② 統一スペック準拠): eq 明示パラメータ化・二重(以上)の half 体系・チャンス分岐は
// 値に 1/N(N=その node の runout 数)・常に全 N で割る・nature には best-response しない。
//
// ホットパス最適化(事前計算高速化): コンボを整数カードID化し衝突マスク/カード別インデックスを
// 1回だけ構築、regret/stratSum はノードごと flat Float64Array、reach/値ベクトルは深さ別
// スクラッチプールで per-call 確保ゼロ。出力(SolvedNodeSummary 等)の型・形状は従来どおり。

export const PRECISION = 1e-9

type ActionLabel = SolvedAction['action']
export interface TreeAction { label: ActionLabel; addBB: number; child: Node }
export interface DecisionNode {
  kind: 'decision'
  player: 0 | 1 // 0=OOP, 1=IP
  toCall: number
  committed: [number, number] // この層(街)のサブゲーム内投入額(層頭で [0,0] にリセット)
  actions: TreeAction[]
  regret: Float64Array   // flat [combo*A + a](solveChanceTree が初期化)
  stratSum: Float64Array // flat [combo*A + a]
}
export interface TerminalNode {
  kind: 'showdown' | 'fold'
  committed: [number, number]
  folder?: 0 | 1
  half: number // 死にポット取り分。各街で potAfterPrevStreets/2(層により異なる二重以上の体系)
}
export interface ChanceNode {
  kind: 'chance'
  potAfter: number               // チャンス入口での確定ポット(直前街までの投入を畳んだ額)
  committedAtChance: [number, number]
  runouts: ChanceChild[]
  physN?: number // solveChanceTree が初期化。members 含む物理 runout 総数(チャンス分岐の除数)
}
// スート同型縮約 (suitIso) の同値類 member。card は物理 runout、permOOP/permIP は
// 「member 側 combo index i → 代表側 combo index」の写像で、member の値ベクトルは
// 代表の置換像 v_member[i] = v_repr[permOOP[i]] として読み出す(代表→member のスート置換
// π に対し combo を π⁻¹ で写した index。構築は comboIndexPerm(combos, π⁻¹))。
export interface ChanceChildMember {
  card: Card
  removedOOP: boolean[]
  removedIP: boolean[]
  permOOP: Int32Array
  permIP: Int32Array
  // solveChanceTree が初期化する内部キャッシュ
  remOOP?: Uint8Array
  remIP?: Uint8Array
}
export interface ChanceChild {
  card: Card
  // 5枚ボードの厳密2値ショーダウン eq[oop_i][ip_j]。最終(river)チャンスのみ非null。
  // 中間(turn)チャンスは subtree にさらに深いチャンスがあり直下に showdown が無いため null。
  eq: number[][] | null
  removedOOP: boolean[] // ranges[0](OOP) で配られた札を含む combo
  removedIP: boolean[]  // ranges[1](IP)
  subtree: Node         // この runout 専用の次街部分木(独立 regret/stratSum)
  // suitIso 縮約時のみ設定 (undefined=従来動作)。この child はスート同値類の代表で、
  // members は類内の全物理 runout(代表自身=恒等置換も含む)。subtree は代表1本だけ
  // traverse し、各 member の値は置換アキュムレートで合成する。
  members?: ChanceChildMember[]
  // 以下は solveChanceTree が初期化する内部キャッシュ(ツリー構築側は設定不要)。
  // eqFlat は衝突ペアを 0 に潰した flat eq(+転置)で、ショーダウンを分岐なし matvec にする。
  eqFlat?: { em: Float64Array; emT: Float64Array } | null
  remOOP?: Uint8Array
  remIP?: Uint8Array
}
export type Node = DecisionNode | TerminalNode | ChanceNode

export interface ChanceSolution {
  root: Node
  oopRootStrategy: SolvedAction[][]
  nodes: SolvedNodeSummary[]
  exploitability: number // % pot(チャンスサンプリングのため river より緩い収束=目標 <10%)
}

// 収束改善オプション(opt-in・既定 off=従来 CFR+ と同一挙動)。
// linearAveraging: stratSum を反復番号 t で加重(後半の戦略を重視)。
// dcfr: Discounted CFR(regret 正負別割引 + stratSum 割引)。指定時は CFR+ の床打ちを行わない。
export interface CfrOpts {
  linearAveraging?: boolean
  dcfr?: { alpha: number; beta: number; gamma: number }
}

// ── 小ヘルパ ────────────────────────────────────────────────────────────────────
export function cardKey(c: Card): string { return `${c.rank}${c.suit}` }
export function comboHasCard(combo: Combo, card: Card): boolean {
  return sameCard(combo.cards[0], card) || sameCard(combo.cards[1], card)
}
export function conflicts(a: Combo, b: Combo): boolean {
  return sameCard(a.cards[0], b.cards[0]) || sameCard(a.cards[0], b.cards[1]) ||
    sameCard(a.cards[1], b.cards[0]) || sameCard(a.cards[1], b.cards[1])
}

// 5枚ボードの厳密2値ショーダウン。eq[i][j] = oop_i が ip_j に勝つ確率(tie=0.5)。
// ボードと衝突する手は -1(配られた札と衝突する手は呼び出し側で reach=0)。
// 評価は fastEval7(encodeScore が HandEvaluator と数式一致=rankValue ビット互換)で行う。
const _ids7 = new Int32Array(7)
export function strictEquity5(oop: Combo[], ip: Combo[], board: Card[]): number[][] {
  for (let b = 0; b < 5; b++) _ids7[2 + b] = fastCardId(board[b])
  const bid = new Set<number>([_ids7[2], _ids7[3], _ids7[4], _ids7[5], _ids7[6]])
  const score = (c: Combo): number => {
    const a = fastCardId(c.cards[0])
    const b = fastCardId(c.cards[1])
    if (bid.has(a) || bid.has(b)) return -1
    _ids7[0] = a
    _ids7[1] = b
    return evaluate7(_ids7)
  }
  const sOOP = oop.map(score)
  const sIP = ip.map(score)
  const eq = oop.map(() => new Array<number>(ip.length).fill(-1))
  for (let i = 0; i < oop.length; i++) {
    if (sOOP[i] < 0) continue
    for (let j = 0; j < ip.length; j++) {
      if (sIP[j] < 0) continue
      eq[i][j] = sOOP[i] > sIP[j] ? 1 : sOOP[i] < sIP[j] ? 0 : 0.5
    }
  }
  return eq
}

// 配り得る次札 = デッキ − 盤面。単一札を配る街(turn 後の river / flop 後の turn)で全列挙に使う。
export function allRunouts(board: Card[]): Card[] {
  const used = new Set(board.map(cardKey))
  return createDeck().filter(c => !used.has(cardKey(c)))
}

// サブセット抽出(主にテスト/事前計算のコスト調整用)。createDeck は suit-outer/rank-inner で
// suit ブロック化されており素のストライドは同一ランク帯ばかり拾う(R14② レビューで発見・修正)。
// ランク昇順に1枚ずつ巡回し周回ごとにスートをずらして拾い、ランク被覆 + スート分散を確保する。
export function selectRunouts(board: Card[], n: number): Card[] {
  const remaining = allRunouts(board)
  if (remaining.length <= n) return remaining
  const byRank = new Map<Rank, Card[]>()
  for (const card of remaining) {
    const arr = byRank.get(card.rank) ?? []
    arr.push(card)
    byRank.set(card.rank, arr)
  }
  const ranksAsc = [...byRank.keys()].sort((a, b) => RANK_VALUES[a] - RANK_VALUES[b])
  const out: Card[] = []
  for (let round = 0; out.length < n; round++) {
    let added = false
    for (let ri = 0; ri < ranksAsc.length && out.length < n; ri++) {
      const arr = byRank.get(ranksAsc[ri])!
      if (round < arr.length) { out.push(arr[(round + ri) % arr.length]); added = true }
    }
    if (!added) break
  }
  return out
}

// ── ベッティング層ツリー構築(riverSolver.buildTree を foldHalf + onShowdown で一般化)──
// onShowdown: 非fold 終端(両チェック / コール後)に置く子。最終街=showdown 終端、中間街=ChanceNode。
export interface LayerOpts {
  pot: number
  stack: number
  betSizes: number[]
  raiseSizes: number[]
  foldHalf: number
  onShowdown: (committed: [number, number]) => Node
}
export function buildBettingLayer(o: LayerOpts): Node {
  const { pot, stack, betSizes, raiseSizes, foldHalf, onShowdown } = o
  const fold = (committed: [number, number], folder: 0 | 1): TerminalNode =>
    ({ kind: 'fold', committed, folder, half: foldHalf })
  const mkDecision = (
    player: 0 | 1, toCall: number, committed: [number, number], actions: TreeAction[],
  ): DecisionNode => ({
    kind: 'decision', player, toCall, committed, actions,
    regret: new Float64Array(0), stratSum: new Float64Array(0),
  })

  function facingBet(
    player: 0 | 1, toCall: number, committed: [number, number], potNow: number, raisesLeft: number,
  ): Node {
    const acts: TreeAction[] = []
    acts.push({ label: 'fold', addBB: 0, child: fold(committed, player) })
    const callCommitted: [number, number] = [committed[0], committed[1]]
    callCommitted[player] += toCall
    acts.push({ label: 'call', addBB: toCall, child: onShowdown(callCommitted) })
    if (raisesLeft > 0) {
      for (const rs of raiseSizes) {
        const potAfterCall = potNow + toCall
        const raiseAdd = toCall + +(potAfterCall * rs).toFixed(2)
        const maxAdd = stack - committed[player]
        const add = Math.min(raiseAdd, maxAdd)
        if (add <= toCall + PRECISION) continue
        const rc: [number, number] = [committed[0], committed[1]]
        rc[player] += add
        const opp = (1 - player) as 0 | 1
        const oppToCall = rc[player] - rc[opp]
        acts.push({
          label: 'raise', addBB: add,
          child: facingBet(opp, oppToCall, rc, potNow + add, raisesLeft - 1),
        })
      }
    }
    return mkDecision(player, toCall, committed, acts)
  }

  const oopActs: TreeAction[] = []
  const ipAfterCheckActs: TreeAction[] = [
    { label: 'check', addBB: 0, child: onShowdown([0, 0]) },
  ]
  for (const bs of betSizes) {
    const add = Math.min(+(pot * bs).toFixed(2), stack)
    if (add <= PRECISION) continue
    const committed: [number, number] = [0, add]
    ipAfterCheckActs.push({
      label: 'bet', addBB: add,
      child: facingBet(0, add, committed, pot + add, raiseSizes.length > 0 ? 1 : 0),
    })
  }
  oopActs.push({ label: 'check', addBB: 0, child: mkDecision(1, 0, [0, 0], ipAfterCheckActs) })
  for (const bs of betSizes) {
    const add = Math.min(+(pot * bs).toFixed(2), stack)
    if (add <= PRECISION) continue
    const committed: [number, number] = [add, 0]
    oopActs.push({
      label: 'bet', addBB: add,
      child: facingBet(1, add, committed, pot + add, raiseSizes.length > 0 ? 1 : 0),
    })
  }
  return mkDecision(0, 0, [0, 0], oopActs)
}

// 配られた札を含む手の per-runout 除去マスクを構築(eq の付与は呼び出し側=最終街のみ)。
export function removalMasks(oop: Combo[], ip: Combo[], card: Card): { removedOOP: boolean[]; removedIP: boolean[] } {
  return { removedOOP: oop.map(c => comboHasCard(c, card)), removedIP: ip.map(c => comboHasCard(c, card)) }
}

const SUIT_ID: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 }
const EMPTY_IDX: number[] = []

// ── 求解本体(ツリー非依存・チャンス層の深さに非依存)──────────────────────────
// potBB = ルート街入口のポット(= root cf 値のフレーム / exploitability の %pot 除数)。
export function solveChanceTree(
  root: Node, oop: Combo[], ip: Combo[], potBB: number, iterations: number, opts?: CfrOpts,
): ChanceSolution {
  const nOOP = oop.length
  const nIP = ip.length
  const nP: [number, number] = [nOOP, nIP]
  const useDcfr = opts?.dcfr != null
  const linAvg = opts?.linearAveraging === true

  // ── intカード化 + 衝突構造の事前計算(1回)────────────────────────────────────
  const cid = (c: Card): number => (RANK_VALUES[c.rank] - 2) * 4 + SUIT_ID[c.suit]
  const c1: [Uint8Array, Uint8Array] = [new Uint8Array(nOOP), new Uint8Array(nIP)]
  const c2: [Uint8Array, Uint8Array] = [new Uint8Array(nOOP), new Uint8Array(nIP)]
  for (let i = 0; i < nOOP; i++) { c1[0][i] = cid(oop[i].cards[0]); c2[0][i] = cid(oop[i].cards[1]) }
  for (let j = 0; j < nIP; j++) { c1[1][j] = cid(ip[j].cards[0]); c2[1][j] = cid(ip[j].cards[1]) }
  const conflictMask = new Uint8Array(nOOP * nIP)
  for (let i = 0; i < nOOP; i++) {
    const a = c1[0][i], b = c2[0][i], base = i * nIP
    for (let j = 0; j < nIP; j++) {
      const x = c1[1][j], y = c2[1][j]
      conflictMask[base + j] = a === x || a === y || b === x || b === y ? 1 : 0
    }
  }
  // カード別コンボ索引 + 同一2枚ペア索引(fold/質量の衝突合計を O(衝突数) で引く)。
  const byCard: [number[][], number[][]] = [
    Array.from({ length: 52 }, () => [] as number[]),
    Array.from({ length: 52 }, () => [] as number[]),
  ]
  const pairLists: [Map<number, number[]>, Map<number, number[]>] = [new Map(), new Map()]
  const pairKey = (a: number, b: number) => (a < b ? a * 52 + b : b * 52 + a)
  for (let p = 0; p <= 1; p++) {
    const pp = p as 0 | 1
    for (let i = 0; i < nP[pp]; i++) {
      byCard[pp][c1[pp][i]].push(i)
      byCard[pp][c2[pp][i]].push(i)
      const k = pairKey(c1[pp][i], c2[pp][i])
      const list = pairLists[pp].get(k)
      if (list) list.push(i)
      else pairLists[pp].set(k, [i])
    }
  }
  // bothIdx[up][i] = up 側 combo i と2枚とも被る相手 combo(byCard 2回で二重減算した分の補正)。
  const bothIdx: [number[][], number[][]] = [new Array<number[]>(nOOP), new Array<number[]>(nIP)]
  for (let i = 0; i < nOOP; i++) bothIdx[0][i] = pairLists[1].get(pairKey(c1[0][i], c2[0][i])) ?? EMPTY_IDX
  for (let j = 0; j < nIP; j++) bothIdx[1][j] = pairLists[0].get(pairKey(c1[1][j], c2[1][j])) ?? EMPTY_IDX

  // ── ノード初期化(flat 配列)+ チャンス子の flat キャッシュ ────────────────────
  const decisionNodes: DecisionNode[] = []
  let maxMat = 1
  type EqFlat = { em: Float64Array; emT: Float64Array }
  const eqFlatCache = new WeakMap<number[][], EqFlat>() // dedup された eq 参照を共有変換
  const maskFlatCache = new WeakMap<boolean[], Uint8Array>()
  // 衝突ペアの寄与は 0 に潰しておく(0 加算は丸め誤差ゼロ=分岐版と同値)。emT は IP 視点の連続アクセス用。
  const toEqFlat = (eq: number[][]): EqFlat => {
    const hit = eqFlatCache.get(eq)
    if (hit) return hit
    const em = new Float64Array(nOOP * nIP)
    const emT = new Float64Array(nOOP * nIP)
    for (let i = 0; i < nOOP; i++) {
      const row = eq[i], base = i * nIP
      for (let j = 0; j < nIP; j++) {
        const v = conflictMask[base + j] ? 0 : row[j]
        em[base + j] = v
        emT[j * nOOP + i] = v
      }
    }
    const f = { em, emT }
    eqFlatCache.set(eq, f)
    return f
  }
  const toMaskFlat = (m: boolean[]): Uint8Array => {
    const hit = maskFlatCache.get(m)
    if (hit) return hit
    const u = new Uint8Array(m.length)
    for (let i = 0; i < m.length; i++) u[i] = m[i] ? 1 : 0
    maskFlatCache.set(m, u)
    return u
  }
  function initArrays(node: Node) {
    if (node.kind === 'chance') {
      let phys = 0
      for (const ro of node.runouts) {
        ro.eqFlat = ro.eq ? toEqFlat(ro.eq) : null
        ro.remOOP = toMaskFlat(ro.removedOOP)
        ro.remIP = toMaskFlat(ro.removedIP)
        if (ro.members) {
          for (const m of ro.members) {
            m.remOOP = toMaskFlat(m.removedOOP)
            m.remIP = toMaskFlat(m.removedIP)
          }
          phys += ro.members.length
        } else phys += 1
        initArrays(ro.subtree)
      }
      node.physN = phys
      return
    }
    if (node.kind !== 'decision') return
    const n = nP[node.player]
    const A = node.actions.length
    node.regret = new Float64Array(n * A)
    node.stratSum = new Float64Array(n * A)
    if (n * A > maxMat) maxMat = n * A
    decisionNodes.push(node)
    for (const act of node.actions) initArrays(act.child)
  }
  initArrays(root)

  // ── 深さ別スクラッチプール(再帰は深さ単調増加なので同 index の競合は起きない)──
  const reachPools: [Float64Array[], Float64Array[]] = [[], []]
  const getReach = (p: 0 | 1, d: number): Float64Array =>
    reachPools[p][d] ?? (reachPools[p][d] = new Float64Array(nP[p]))
  const valPools: [Float64Array[][], Float64Array[][]] = [[], []]
  const valSlots = (p: 0 | 1, d: number, need: number): Float64Array[] => {
    const slots = valPools[p][d] ?? (valPools[p][d] = [])
    for (let a = slots.length; a < need; a++) slots.push(new Float64Array(nP[p]))
    return slots
  }
  const matPool: Float64Array[] = []
  const getMat = (d: number): Float64Array => matPool[d] ?? (matPool[d] = new Float64Array(maxMat))

  // チャンス分岐の runout 値合成。members 無し=従来(代表=物理 runout 自身)。
  // members 有り(suitIso 縮約)= 代表 subtree の値ベクトル childOut を member ごとに
  // 置換して加算する: out[c] += v_member[c]/N = childOut[perm[c]]/N(perm=member→代表)。
  // ⚠ 「クラスサイズを掛けるだけ」は per-combo 値では誤り(v_member は代表の置換像であり
  // 一般に v_repr[c]×サイズ ≠ Σ_m v_repr[π_m⁻¹(c)])。N は物理 runout 総数(physN)のまま。
  // 正当性: レンジが置換で閉じ(weight 一致)・regret/stratSum ゼロ初期化の決定的 CFR は
  // 帰納的にスート対称性を保つ(reach も対称・除去マスクも置換で代表のものに写る)ため、
  // member subtree の regret/値は代表 subtree の置換像に等しく、代表への蓄積のみで均衡が正しい。
  function accumRunout(ro: ChanceChild, up: 0 | 1, childOut: Float64Array, out: Float64Array, N: number): void {
    const nUp = nP[up]
    if (!ro.members) {
      const mask = (up === 0 ? ro.remOOP : ro.remIP)!
      for (let cI = 0; cI < nUp; cI++) { if (!mask[cI]) out[cI] += childOut[cI] / N }
      return
    }
    for (const m of ro.members) {
      const mask = (up === 0 ? m.remOOP : m.remIP)!
      const perm = up === 0 ? m.permOOP : m.permIP
      for (let cI = 0; cI < nUp; cI++) { if (!mask[cI]) out[cI] += childOut[perm[cI]] / N }
    }
  }

  function regretMatchInto(regret: Float64Array, off: number, A: number, dst: Float64Array): void {
    let sum = 0
    for (let a = 0; a < A; a++) { const r = regret[off + a]; if (r > 0) sum += r }
    if (sum <= PRECISION) {
      const u = 1 / A
      for (let a = 0; a < A; a++) dst[off + a] = u
      return
    }
    for (let a = 0; a < A; a++) { const r = regret[off + a]; dst[off + a] = r > 0 ? r / sum : 0 }
  }

  // out[i] = Σ_j 衝突しない oppReach[j](= 全和 − カード共有分 + 2枚被り二重減算の補正)。
  function nonConflictMass(up: 0 | 1, oppReach: Float64Array, out: Float64Array): void {
    const opp = (1 - up) as 0 | 1
    const nMy = nP[up], nOpp = nP[opp]
    let S = 0
    for (let j = 0; j < nOpp; j++) S += oppReach[j]
    const bc = byCard[opp], a1 = c1[up], a2 = c2[up], both = bothIdx[up]
    for (let i = 0; i < nMy; i++) {
      let cs = 0
      const l1 = bc[a1[i]]
      for (let k = 0; k < l1.length; k++) cs += oppReach[l1[k]]
      const l2 = bc[a2[i]]
      for (let k = 0; k < l2.length; k++) cs += oppReach[l2[k]]
      const lb = both[i]
      for (let k = 0; k < lb.length; k++) cs -= oppReach[lb[k]]
      out[i] = S - cs
    }
  }

  function terminalValueFlat(
    node: TerminalNode, up: 0 | 1, oppReach: Float64Array, eq: EqFlat | null, out: Float64Array,
  ): void {
    const opp = (1 - up) as 0 | 1
    const myCommit = node.committed[up]
    const oppCommit = node.committed[opp]
    const half = node.half
    if (node.kind === 'fold') {
      // net は相手 combo に依らず一定 → 衝突しない reach 質量 × net。
      nonConflictMass(up, oppReach, out)
      const net = node.folder === up ? -(half + myCommit) : half + oppCommit
      for (let i = 0; i < nP[up]; i++) out[i] *= net
      return
    }
    // showdown: net = e*K − L(K/L は combo に依らず一定)。衝突は em で 0 に潰してあるので
    // 値和は分岐なし matvec、reach 和は nonConflictMass → out = K·(em·r) − L·mass。
    const K = 2 * half + myCommit + oppCommit
    const L = half + myCommit
    const e = eq! // showdown 終端は必ず最終 runout サブツリー内 → eq 非null
    nonConflictMass(up, oppReach, out)
    if (up === 0) {
      const em = e.em
      for (let i = 0; i < nOOP; i++) {
        const base = i * nIP
        let dot = 0
        for (let j = 0; j < nIP; j++) dot += oppReach[j] * em[base + j]
        out[i] = K * dot - L * out[i]
      }
    } else {
      // IP 視点: e' = 1−e より K·Σr(1−e) − L·mass = (K−L)·mass − K·(emT·r)。
      const emT = e.emT
      const KL = K - L
      for (let i = 0; i < nIP; i++) {
        const base = i * nOOP
        let dot = 0
        for (let j = 0; j < nOOP; j++) dot += oppReach[j] * emT[base + j]
        out[i] = KL * out[i] - K * dot
      }
    }
  }

  // ── CFR 本体 ─────────────────────────────────────────────────────────────────
  let stratWeight = 1 // linearAveraging 時のみ反復ごとに t+1 へ更新

  function traverse(
    node: Node, up: 0 | 1, reachUp: Float64Array, reachOpp: Float64Array,
    eq: EqFlat | null, depth: number, out: Float64Array,
  ): void {
    if (node.kind === 'chance') {
      // 各 runout で配られた札を含む手の reach を 0 にし、値は 1/N 平均(reach には乗せない)。
      // N は物理 runout 総数(suitIso 縮約時も代表数ではなく members 込みの総数)。
      const opp = (1 - up) as 0 | 1
      const N = node.physN ?? node.runouts.length
      const nUp = nP[up], nOpp = nP[opp]
      const adjUp = getReach(up, depth)
      const adjOpp = getReach(opp, depth)
      const childOut = valSlots(up, depth, 1)[0]
      out.fill(0)
      for (let ri = 0; ri < node.runouts.length; ri++) {
        const ro = node.runouts[ri]
        const upMask = (up === 0 ? ro.remOOP : ro.remIP)!
        const oppMask = (up === 0 ? ro.remIP : ro.remOOP)!
        for (let cI = 0; cI < nUp; cI++) adjUp[cI] = upMask[cI] ? 0 : reachUp[cI]
        for (let j = 0; j < nOpp; j++) adjOpp[j] = oppMask[j] ? 0 : reachOpp[j]
        traverse(ro.subtree, up, adjUp, adjOpp, ro.eqFlat ?? null, depth + 1, childOut)
        accumRunout(ro, up, childOut, out, N)
      }
      return
    }
    if (node.kind !== 'decision') { terminalValueFlat(node, up, reachOpp, eq, out); return }
    const acting = node.player
    const acts = node.actions
    const A = acts.length
    const nAct = nP[acting]
    const regret = node.regret
    const strat = getMat(depth)
    for (let cI = 0; cI < nAct; cI++) regretMatchInto(regret, cI * A, A, strat)
    if (acting === up) {
      const slots = valSlots(up, depth, A)
      const scaled = getReach(up, depth)
      for (let a = 0; a < A; a++) {
        for (let cI = 0; cI < nAct; cI++) scaled[cI] = reachUp[cI] * strat[cI * A + a]
        traverse(acts[a].child, up, scaled, reachOpp, eq, depth + 1, slots[a])
      }
      const stratSum = node.stratSum
      const sw = stratWeight
      for (let cI = 0; cI < nAct; cI++) {
        const base = cI * A
        let nv = 0
        for (let a = 0; a < A; a++) nv += strat[base + a] * slots[a][cI]
        out[cI] = nv
        const rw = reachUp[cI]
        if (useDcfr) {
          for (let a = 0; a < A; a++) {
            regret[base + a] += slots[a][cI] - nv // 符号付き regret(割引は反復末尾)
            stratSum[base + a] += sw * rw * strat[base + a]
          }
        } else {
          for (let a = 0; a < A; a++) {
            const r = regret[base + a] + slots[a][cI] - nv
            regret[base + a] = r > 0 ? r : 0 // CFR+
            stratSum[base + a] += sw * rw * strat[base + a]
          }
        }
      }
      return
    }
    const nUp = nP[up]
    out.fill(0)
    const scaledOpp = getReach(acting, depth)
    const v = valSlots(up, depth, 1)[0]
    for (let a = 0; a < A; a++) {
      for (let j = 0; j < nAct; j++) scaledOpp[j] = reachOpp[j] * strat[j * A + a]
      traverse(acts[a].child, up, reachUp, scaledOpp, eq, depth + 1, v)
      for (let cI = 0; cI < nUp; cI++) out[cI] += v[cI]
    }
  }

  // DCFR: 反復 t 終了時に regret を正負別割引、stratSum を (t/(t+1))^γ で割引。
  function discountDcfr(t: number): void {
    const d = opts!.dcfr!
    const ta = Math.pow(t, d.alpha)
    const tb = Math.pow(t, d.beta)
    const posD = ta / (ta + 1)
    const negD = tb / (tb + 1)
    const sD = Math.pow(t / (t + 1), d.gamma)
    for (const dn of decisionNodes) {
      const r = dn.regret, s = dn.stratSum
      for (let k = 0; k < r.length; k++) { const x = r[k]; r[k] = x > 0 ? x * posD : x * negD }
      for (let k = 0; k < s.length; k++) s[k] *= sD
    }
  }

  const w0 = Float64Array.from(oop, c => c.weight)
  const w1 = Float64Array.from(ip, c => c.weight)
  const buf0 = new Float64Array(nOOP)
  const buf1 = new Float64Array(nIP)
  for (let t = 0; t < iterations; t++) {
    if (linAvg) stratWeight = t + 1
    traverse(root, 0, w0, w1, null, 0, buf0)
    traverse(root, 1, w1, w0, null, 0, buf1)
    if (useDcfr) discountDcfr(t + 1)
  }

  // ── 平均戦略下の評価(EV / exploitability)──────────────────────────────────
  // 平均戦略を深さ別スクラッチへ展開(反復終了後しか呼ばれないため都度計算で安全)。
  function avgInto(node: DecisionNode, depth: number): Float64Array {
    const A = node.actions.length
    const n = nP[node.player]
    const s = node.stratSum
    const mat = getMat(depth)
    for (let cI = 0; cI < n; cI++) {
      const base = cI * A
      let tot = 0
      for (let a = 0; a < A; a++) tot += s[base + a]
      if (tot > PRECISION) { for (let a = 0; a < A; a++) mat[base + a] = s[base + a] / tot }
      else { const u = 1 / A; for (let a = 0; a < A; a++) mat[base + a] = u }
    }
    return mat
  }
  // 出力用 number[][](形状は従来どおり)。
  function avgMatrix(node: DecisionNode): number[][] {
    const A = node.actions.length
    const n = nP[node.player]
    const s = node.stratSum
    const out: number[][] = new Array(n)
    for (let cI = 0; cI < n; cI++) {
      const base = cI * A
      let tot = 0
      for (let a = 0; a < A; a++) tot += s[base + a]
      const row = new Array<number>(A)
      if (tot > PRECISION) { for (let a = 0; a < A; a++) row[a] = s[base + a] / tot }
      else row.fill(1 / A)
      out[cI] = row
    }
    return out
  }

  function valueAvgF(
    node: Node, up: 0 | 1, reachOpp: Float64Array, eq: EqFlat | null, depth: number, out: Float64Array,
  ): void {
    if (node.kind === 'chance') {
      const opp = (1 - up) as 0 | 1
      const N = node.physN ?? node.runouts.length
      const nOpp = nP[opp]
      const adjOpp = getReach(opp, depth)
      const childOut = valSlots(up, depth, 1)[0]
      out.fill(0)
      for (let ri = 0; ri < node.runouts.length; ri++) {
        const ro = node.runouts[ri]
        const oppMask = (up === 0 ? ro.remIP : ro.remOOP)!
        for (let j = 0; j < nOpp; j++) adjOpp[j] = oppMask[j] ? 0 : reachOpp[j]
        valueAvgF(ro.subtree, up, adjOpp, ro.eqFlat ?? null, depth + 1, childOut)
        accumRunout(ro, up, childOut, out, N)
      }
      return
    }
    if (node.kind !== 'decision') { terminalValueFlat(node, up, reachOpp, eq, out); return }
    const acts = node.actions
    const A = acts.length
    const avg = avgInto(node, depth)
    if (node.player === up) {
      const nAct = nP[up]
      const slots = valSlots(up, depth, A)
      for (let a = 0; a < A; a++) valueAvgF(acts[a].child, up, reachOpp, eq, depth + 1, slots[a])
      for (let cI = 0; cI < nAct; cI++) {
        const base = cI * A
        let s = 0
        for (let a = 0; a < A; a++) s += avg[base + a] * slots[a][cI]
        out[cI] = s
      }
      return
    }
    const nUp = nP[up]
    const nOpp = nP[node.player]
    out.fill(0)
    const scaled = getReach(node.player, depth)
    const v = valSlots(up, depth, 1)[0]
    for (let a = 0; a < A; a++) {
      for (let j = 0; j < nOpp; j++) scaled[j] = reachOpp[j] * avg[j * A + a]
      valueAvgF(acts[a].child, up, scaled, eq, depth + 1, v)
      for (let cI = 0; cI < nUp; cI++) out[cI] += v[cI]
    }
  }

  // massAvg: net≡1 の質量伝播(EV 正規化分母)。value と同じ戦略ルーティング + チャンス除去/平均。
  function massAvgF(node: Node, up: 0 | 1, reachOpp: Float64Array, depth: number, out: Float64Array): void {
    if (node.kind === 'chance') {
      const opp = (1 - up) as 0 | 1
      const N = node.physN ?? node.runouts.length
      const nOpp = nP[opp]
      const adjOpp = getReach(opp, depth)
      const childOut = valSlots(up, depth, 1)[0]
      out.fill(0)
      for (let ri = 0; ri < node.runouts.length; ri++) {
        const ro = node.runouts[ri]
        const oppMask = (up === 0 ? ro.remIP : ro.remOOP)!
        for (let j = 0; j < nOpp; j++) adjOpp[j] = oppMask[j] ? 0 : reachOpp[j]
        massAvgF(ro.subtree, up, adjOpp, depth + 1, childOut)
        accumRunout(ro, up, childOut, out, N)
      }
      return
    }
    if (node.kind !== 'decision') { nonConflictMass(up, reachOpp, out); return }
    const acts = node.actions
    const A = acts.length
    const avg = avgInto(node, depth)
    if (node.player === up) {
      const nAct = nP[up]
      const slots = valSlots(up, depth, A)
      for (let a = 0; a < A; a++) massAvgF(acts[a].child, up, reachOpp, depth + 1, slots[a])
      for (let cI = 0; cI < nAct; cI++) {
        const base = cI * A
        let s = 0
        for (let a = 0; a < A; a++) s += avg[base + a] * slots[a][cI]
        out[cI] = s
      }
      return
    }
    const nUp = nP[up]
    const nOpp = nP[node.player]
    out.fill(0)
    const scaled = getReach(node.player, depth)
    const v = valSlots(up, depth, 1)[0]
    for (let a = 0; a < A; a++) {
      for (let j = 0; j < nOpp; j++) scaled[j] = reachOpp[j] * avg[j * A + a]
      massAvgF(acts[a].child, up, scaled, depth + 1, v)
      for (let cI = 0; cI < nUp; cI++) out[cI] += v[cI]
    }
  }

  // 各 decision ノードの「コンボ×アクション EV(BB)」。分母は value と同経路の reach 質量(massAvg)。
  // チャンス層のカード除去で /N された分子と整合(静的 norm だと除去バイアスで EV がずれ ground-truth
  // ベットなし=エクイティ近似 と一致しない)。/N は分子分母で相殺し条件付き EV を返す。
  function actionEVs(node: DecisionNode, reachOpp: Float64Array): number[][] {
    const up = node.player
    const n = nP[up]
    const outV = new Float64Array(n)
    const outM = new Float64Array(n)
    return node.actions.map((_a, a) => {
      valueAvgF(node.actions[a].child, up, reachOpp, null, 0, outV)
      massAvgF(node.actions[a].child, up, reachOpp, 0, outM)
      const row = new Array<number>(n)
      for (let cI = 0; cI < n; cI++) row[cI] = Math.abs(outM[cI]) > PRECISION ? outV[cI] / outM[cI] : 0
      return row
    })
  }

  // 平坦化(ルート街の decision ノードのみ。チャンス/終端は skip → 後続街サブツリーは要約に出ない)。
  const nodes: SolvedNodeSummary[] = []
  const initW: [number[], number[]] = [oop.map(c => c.weight), ip.map(c => c.weight)]
  let rootEVsCached: number[][] | null = null // root の actionEVs は oopRootStrategy と同一引数なので再利用
  function flatten(node: Node, path: number[], reach: [number[], number[]]) {
    if (node.kind !== 'decision') return
    const p = node.player
    const opp = (1 - p) as 0 | 1
    const avg = avgMatrix(node)
    const evs = actionEVs(node, Float64Array.from(reach[opp]))
    if (path.length === 0) rootEVsCached = evs
    nodes.push({
      path: [...path], player: p, toCall: node.toCall,
      actions: node.actions.map(a => ({ action: a.label, sizeBB: a.addBB > 0 ? a.addBB : undefined })),
      strategy: avg.map(row => row.map(x => +x.toFixed(4))),
      ev: avg.map((_row, cI) => node.actions.map((_a, ai) => +evs[ai][cI].toFixed(3))),
    })
    node.actions.forEach((act, ai) => {
      const childReach: [number[], number[]] = [reach[0].slice(), reach[1].slice()]
      childReach[p] = reach[p].map((r, cI) => r * (avg[cI]?.[ai] ?? 0))
      flatten(act.child, [...path, ai], childReach)
    })
  }
  flatten(root, [], initW)

  // root(OOP)戦略ビュー。
  const rootDecision = root as DecisionNode
  const rootEVs = rootEVsCached ?? actionEVs(rootDecision, w1)
  const rootAvg = avgMatrix(rootDecision)
  const oopRootStrategy: SolvedAction[][] = rootAvg.map((probs, cI) =>
    rootDecision.actions.map((a, ai) => ({
      action: a.label,
      sizeBB: a.addBB > 0 ? a.addBB : undefined,
      frequency: +probs[ai].toFixed(4),
      ev: +rootEVs[ai][cI].toFixed(3),
    })))

  // exploitability(収束度, %pot)。BR は nature には best-response しない(runout 平均)。除数は potBB。
  function brValueF(
    node: Node, brP: 0 | 1, reachOpp: Float64Array, eq: EqFlat | null, depth: number, out: Float64Array,
  ): void {
    if (node.kind === 'chance') {
      const opp = (1 - brP) as 0 | 1
      const N = node.physN ?? node.runouts.length
      const nOpp = nP[opp]
      const adjOpp = getReach(opp, depth)
      const childOut = valSlots(brP, depth, 1)[0]
      out.fill(0)
      for (let ri = 0; ri < node.runouts.length; ri++) {
        const ro = node.runouts[ri]
        const oppMask = (brP === 0 ? ro.remIP : ro.remOOP)!
        for (let j = 0; j < nOpp; j++) adjOpp[j] = oppMask[j] ? 0 : reachOpp[j]
        brValueF(ro.subtree, brP, adjOpp, ro.eqFlat ?? null, depth + 1, childOut)
        accumRunout(ro, brP, childOut, out, N)
      }
      return
    }
    if (node.kind !== 'decision') { terminalValueFlat(node, brP, reachOpp, eq, out); return }
    const acts = node.actions
    const A = acts.length
    if (node.player === brP) {
      const n = nP[brP]
      const slots = valSlots(brP, depth, A)
      for (let a = 0; a < A; a++) brValueF(acts[a].child, brP, reachOpp, eq, depth + 1, slots[a])
      for (let cI = 0; cI < n; cI++) {
        let best = slots[0][cI]
        for (let a = 1; a < A; a++) { const x = slots[a][cI]; if (x > best) best = x }
        out[cI] = best
      }
      return
    }
    const avg = avgInto(node, depth)
    const nUp = nP[brP]
    const nOpp = nP[node.player]
    out.fill(0)
    const scaled = getReach(node.player, depth)
    const v = valSlots(brP, depth, 1)[0]
    for (let a = 0; a < A; a++) {
      for (let j = 0; j < nOpp; j++) scaled[j] = reachOpp[j] * avg[j * A + a]
      brValueF(acts[a].child, brP, scaled, eq, depth + 1, v)
      for (let cI = 0; cI < nUp; cI++) out[cI] += v[cI]
    }
  }
  const sumOOP = oop.reduce((s, c) => s + c.weight, 0) || 1
  const sumIP = ip.reduce((s, c) => s + c.weight, 0) || 1
  const weighted = (vec: ArrayLike<number>, w: Combo[], selfSum: number, oppSum: number) => {
    let s = 0
    for (let i = 0; i < w.length; i++) s += w[i].weight * vec[i]
    return s / (selfSum * oppSum)
  }
  valueAvgF(root, 0, w1, null, 0, buf0)
  const avg0 = weighted(buf0, oop, sumOOP, sumIP)
  valueAvgF(root, 1, w0, null, 0, buf1)
  const avg1 = weighted(buf1, ip, sumIP, sumOOP)
  brValueF(root, 0, w1, null, 0, buf0)
  const br0 = weighted(buf0, oop, sumOOP, sumIP)
  brValueF(root, 1, w0, null, 0, buf1)
  const br1 = weighted(buf1, ip, sumIP, sumOOP)
  const exploitability = Math.max(0, ((br0 - avg0) + (br1 - avg1)) / 2 / potBB)

  return { root, oopRootStrategy, nodes, exploitability: +exploitability.toFixed(4) }
}
