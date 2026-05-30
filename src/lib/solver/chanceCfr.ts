import type { Card, Rank } from '../../types/game'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import { sameCard, RANK_VALUES } from '../../engine/cards/Card'
import { createDeck } from '../../engine/cards/Deck'
import type { Combo, SolvedAction, SolvedNodeSummary } from './riverSolver'

// ── 共有チャンスノード CFR コア ────────────────────────────────────────────────
// turn(1チャンス層)/ flop(2チャンス層・turn→river)を同じベクトル CFR(CFR+)で求解する。
// traverse/valueAvg/massAvg/brValue は node.kind==='chance' で再帰するため、チャンス層が
// 何層ネストしていても同一コードで動く(turnSolver/flopSolver はツリー構築のみ差し替える)。
// riverSolver.ts は別アルゴリズム(チャンス層なし・ランナウト平均エクイティ)で不変。
//
// 設計(R14② 統一スペック準拠): eq 明示パラメータ化・二重(以上)の half 体系・チャンス分岐は
// 値に 1/N(N=その node の runout 数)・常に全 N で割る・nature には best-response しない。

export const PRECISION = 1e-9

type ActionLabel = SolvedAction['action']
export interface TreeAction { label: ActionLabel; addBB: number; child: Node }
export interface DecisionNode {
  kind: 'decision'
  player: 0 | 1 // 0=OOP, 1=IP
  toCall: number
  committed: [number, number] // この層(街)のサブゲーム内投入額(層頭で [0,0] にリセット)
  actions: TreeAction[]
  regret: number[][]
  stratSum: number[][]
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
}
export interface ChanceChild {
  card: Card
  // 5枚ボードの厳密2値ショーダウン eq[oop_i][ip_j]。最終(river)チャンスのみ非null。
  // 中間(turn)チャンスは subtree にさらに深いチャンスがあり直下に showdown が無いため null。
  eq: number[][] | null
  removedOOP: boolean[] // ranges[0](OOP) で配られた札を含む combo
  removedIP: boolean[]  // ranges[1](IP)
  subtree: Node         // この runout 専用の次街部分木(独立 regret/stratSum)
}
export type Node = DecisionNode | TerminalNode | ChanceNode

export interface ChanceSolution {
  root: Node
  oopRootStrategy: SolvedAction[][]
  nodes: SolvedNodeSummary[]
  exploitability: number // % pot(チャンスサンプリングのため river より緩い収束=目標 <10%)
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
function regretMatch(regret: number[]): number[] {
  let sum = 0
  const pos = regret.map(r => (r > 0 ? r : 0))
  for (const p of pos) sum += p
  if (sum <= PRECISION) return regret.map(() => 1 / regret.length)
  return pos.map(p => p / sum)
}

// 5枚ボードの厳密2値ショーダウン。eq[i][j] = oop_i が ip_j に勝つ確率(tie=0.5)。
// ボードと衝突する手は -1(配られた札と衝突する手は呼び出し側で reach=0)。
export function strictEquity5(oop: Combo[], ip: Combo[], board: Card[]): number[][] {
  const bk = new Set(board.map(cardKey))
  const valid = (c: Combo) => !bk.has(cardKey(c.cards[0])) && !bk.has(cardKey(c.cards[1]))
  const sOOP = oop.map(c => (valid(c) ? evaluateBestHand([...c.cards, ...board]).rankValue : -1))
  const sIP = ip.map(c => (valid(c) ? evaluateBestHand([...c.cards, ...board]).rankValue : -1))
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
  ): DecisionNode => ({ kind: 'decision', player, toCall, committed, actions, regret: [], stratSum: [] })

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

// ── 求解本体(ツリー非依存・チャンス層の深さに非依存)──────────────────────────
// potBB = ルート街入口のポット(= root cf 値のフレーム / exploitability の %pot 除数)。
export function solveChanceTree(
  root: Node, oop: Combo[], ip: Combo[], potBB: number, iterations: number,
): ChanceSolution {
  const ranges: [Combo[], Combo[]] = [oop, ip]

  function initArrays(node: Node) {
    if (node.kind === 'chance') { for (const ro of node.runouts) initArrays(ro.subtree); return }
    if (node.kind !== 'decision') return
    const n = ranges[node.player].length
    const a = node.actions.length
    node.regret = Array.from({ length: n }, () => new Array<number>(a).fill(0))
    node.stratSum = Array.from({ length: n }, () => new Array<number>(a).fill(0))
    for (const act of node.actions) initArrays(act.child)
  }
  initArrays(root)

  const mul = (reach: number[], strat: number[][], a: number): number[] =>
    reach.map((r, c) => r * (strat[c]?.[a] ?? 0))

  function terminalValue(node: TerminalNode, up: 0 | 1, oppReach: number[], eq: number[][] | null): number[] {
    const opp = (1 - up) as 0 | 1
    const myCombos = ranges[up]
    const oppCombos = ranges[opp]
    const res = new Array<number>(myCombos.length).fill(0)
    const myCommit = node.committed[up]
    const oppCommit = node.committed[opp]
    const half = node.half
    for (let i = 0; i < myCombos.length; i++) {
      let v = 0
      for (let j = 0; j < oppCombos.length; j++) {
        const r = oppReach[j]
        if (r <= 0) continue
        if (conflicts(myCombos[i], oppCombos[j])) continue
        let net: number
        if (node.kind === 'fold') {
          net = node.folder === up ? -(half + myCommit) : (half + oppCommit)
        } else {
          // showdown 終端は必ず最終 runout サブツリー内 → eq 非null。
          const e = up === 0 ? eq![i][j] : 1 - eq![j][i]
          net = e * (half + oppCommit) - (1 - e) * (half + myCommit)
        }
        v += r * net
      }
      res[i] = v
    }
    return res
  }

  // チャンス分岐: 各 runout で配られた札を含む手の reach を 0 にし、子 subtree を eq=ro.eq で評価して
  // 1/N(N=この node の runout 数)平均。1/N は値にのみ乗せ reach には乗せない。除数は常に全 N。
  function chanceAccumulate(
    node: ChanceNode, up: 0 | 1,
    recurse: (ro: ChanceChild, adjUp: number[] | null, adjOpp: number[]) => number[],
    reachUp: number[] | null, reachOpp: number[],
  ): number[] {
    const N = node.runouts.length
    const acc = new Array<number>(ranges[up].length).fill(0)
    for (const ro of node.runouts) {
      const upMask = up === 0 ? ro.removedOOP : ro.removedIP
      const oppMask = up === 0 ? ro.removedIP : ro.removedOOP
      const adjUp = reachUp ? reachUp.map((r, i) => (upMask[i] ? 0 : r)) : null
      const adjOpp = reachOpp.map((r, j) => (oppMask[j] ? 0 : r))
      const v = recurse(ro, adjUp, adjOpp)
      for (let c = 0; c < acc.length; c++) acc[c] += upMask[c] ? 0 : v[c] / N
    }
    return acc
  }

  function traverse(node: Node, up: 0 | 1, reachUp: number[], reachOpp: number[], eq: number[][] | null): number[] {
    if (node.kind === 'chance') {
      return chanceAccumulate(node, up,
        (ro, adjUp, adjOpp) => traverse(ro.subtree, up, adjUp!, adjOpp, ro.eq), reachUp, reachOpp)
    }
    if (node.kind !== 'decision') return terminalValue(node, up, reachOpp, eq)
    const acting = node.player
    const combos = ranges[acting]
    const strat = node.regret.map(regretMatch)
    const A = node.actions.length
    if (acting === up) {
      const actionVals: number[][] = node.actions.map((_act, a) =>
        traverse(node.actions[a].child, up, mul(reachUp, strat, a), reachOpp, eq))
      const nodeVal = new Array<number>(combos.length).fill(0)
      for (let c = 0; c < combos.length; c++)
        for (let a = 0; a < A; a++) nodeVal[c] += strat[c][a] * actionVals[a][c]
      for (let c = 0; c < combos.length; c++) {
        for (let a = 0; a < A; a++) {
          node.regret[c][a] = Math.max(0, node.regret[c][a] + actionVals[a][c] - nodeVal[c]) // CFR+
          node.stratSum[c][a] += reachUp[c] * strat[c][a]
        }
      }
      return nodeVal
    } else {
      const nodeVal = new Array<number>(ranges[up].length).fill(0)
      for (let a = 0; a < A; a++) {
        const v = traverse(node.actions[a].child, up, reachUp, mul(reachOpp, strat, a), eq)
        for (let c = 0; c < nodeVal.length; c++) nodeVal[c] += v[c]
      }
      return nodeVal
    }
  }

  const initReach = (combos: Combo[]) => combos.map(c => c.weight)
  for (let t = 0; t < iterations; t++) {
    traverse(root, 0, initReach(oop), initReach(ip), null)
    traverse(root, 1, initReach(ip), initReach(oop), null)
  }

  // ── 平均戦略下の評価(EV / exploitability)──────────────────────────────────
  const avgOf = (node: DecisionNode): number[][] =>
    node.stratSum.map(sums => {
      const tot = sums.reduce((s, x) => s + x, 0)
      return tot > PRECISION ? sums.map(x => x / tot) : sums.map(() => 1 / sums.length)
    })

  function valueAvg(node: Node, up: 0 | 1, reachOpp: number[], eq: number[][] | null): number[] {
    if (node.kind === 'chance') {
      return chanceAccumulate(node, up,
        (ro, _adjUp, adjOpp) => valueAvg(ro.subtree, up, adjOpp, ro.eq), null, reachOpp)
    }
    if (node.kind !== 'decision') return terminalValue(node, up, reachOpp, eq)
    const strat = avgOf(node)
    if (node.player === up) {
      const vals = node.actions.map((_a, a) => valueAvg(node.actions[a].child, up, reachOpp, eq))
      const res = new Array<number>(ranges[up].length).fill(0)
      for (let c = 0; c < res.length; c++)
        for (let a = 0; a < node.actions.length; a++) res[c] += strat[c][a] * vals[a][c]
      return res
    }
    const res = new Array<number>(ranges[up].length).fill(0)
    for (let a = 0; a < node.actions.length; a++) {
      const v = valueAvg(node.actions[a].child, up, mul(reachOpp, strat, a), eq)
      for (let c = 0; c < res.length; c++) res[c] += v[c]
    }
    return res
  }

  // massAvg: net≡1 の質量伝播(EV 正規化分母)。value と同じ戦略ルーティング + チャンス除去/平均。
  function terminalMass(_node: TerminalNode, up: 0 | 1, oppReach: number[]): number[] {
    const opp = (1 - up) as 0 | 1
    const myCombos = ranges[up]
    const oppCombos = ranges[opp]
    return myCombos.map((mc) => {
      let s = 0
      for (let j = 0; j < oppCombos.length; j++) {
        const r = oppReach[j]
        if (r <= 0) continue
        if (conflicts(mc, oppCombos[j])) continue
        s += r
      }
      return s
    })
  }
  function massAvg(node: Node, up: 0 | 1, reachOpp: number[]): number[] {
    if (node.kind === 'chance') {
      return chanceAccumulate(node, up,
        (ro, _adjUp, adjOpp) => massAvg(ro.subtree, up, adjOpp), null, reachOpp)
    }
    if (node.kind !== 'decision') return terminalMass(node, up, reachOpp)
    const strat = avgOf(node)
    if (node.player === up) {
      const vals = node.actions.map((_a, a) => massAvg(node.actions[a].child, up, reachOpp))
      const res = new Array<number>(ranges[up].length).fill(0)
      for (let c = 0; c < res.length; c++)
        for (let a = 0; a < node.actions.length; a++) res[c] += strat[c][a] * vals[a][c]
      return res
    }
    const res = new Array<number>(ranges[up].length).fill(0)
    for (let a = 0; a < node.actions.length; a++) {
      const v = massAvg(node.actions[a].child, up, mul(reachOpp, strat, a))
      for (let c = 0; c < res.length; c++) res[c] += v[c]
    }
    return res
  }

  // 各 decision ノードの「コンボ×アクション EV(BB)」。分母は value と同経路の reach 質量(massAvg)。
  // チャンス層のカード除去で /N された分子と整合(静的 norm だと除去バイアスで EV がずれ ground-truth
  // ベットなし=エクイティ近似 と一致しない)。/N は分子分母で相殺し条件付き EV を返す。
  function actionEVs(node: DecisionNode, reachOpp: number[]): number[][] {
    const up = node.player
    return node.actions.map((_a, a) => {
      const v = valueAvg(node.actions[a].child, up, reachOpp, null)
      const m = massAvg(node.actions[a].child, up, reachOpp)
      return v.map((val, c) => (Math.abs(m[c]) > PRECISION ? val / m[c] : 0))
    })
  }

  // 平坦化(ルート街の decision ノードのみ。チャンス/終端は skip → 後続街サブツリーは要約に出ない)。
  const nodes: SolvedNodeSummary[] = []
  const initW: [number[], number[]] = [oop.map(c => c.weight), ip.map(c => c.weight)]
  function flatten(node: Node, path: number[], reach: [number[], number[]]) {
    if (node.kind !== 'decision') return
    const p = node.player
    const opp = (1 - p) as 0 | 1
    const avg = avgOf(node)
    const evs = actionEVs(node, reach[opp])
    nodes.push({
      path: [...path], player: p, toCall: node.toCall,
      actions: node.actions.map(a => ({ action: a.label, sizeBB: a.addBB > 0 ? a.addBB : undefined })),
      strategy: avg.map(row => row.map(x => +x.toFixed(4))),
      ev: avg.map((_row, c) => node.actions.map((_a, ai) => +evs[ai][c].toFixed(3))),
    })
    node.actions.forEach((act, ai) => {
      const childReach: [number[], number[]] = [reach[0].slice(), reach[1].slice()]
      childReach[p] = reach[p].map((r, c) => r * (avg[c]?.[ai] ?? 0))
      flatten(act.child, [...path, ai], childReach)
    })
  }
  flatten(root, [], initW)

  // root(OOP)戦略ビュー。
  const rootDecision = root as DecisionNode
  const rootEVs = actionEVs(rootDecision, ip.map(cc => cc.weight))
  const rootAvg = avgOf(rootDecision)
  const oopRootStrategy: SolvedAction[][] = rootAvg.map((probs, c) =>
    rootDecision.actions.map((a, ai) => ({
      action: a.label,
      sizeBB: a.addBB > 0 ? a.addBB : undefined,
      frequency: +probs[ai].toFixed(4),
      ev: +rootEVs[ai][c].toFixed(3),
    })))

  // exploitability(収束度, %pot)。BR は nature には best-response しない(runout 平均)。除数は potBB。
  function brValue(node: Node, brP: 0 | 1, reachOpp: number[], eq: number[][] | null): number[] {
    if (node.kind === 'chance') {
      return chanceAccumulate(node, brP,
        (ro, _adjUp, adjOpp) => brValue(ro.subtree, brP, adjOpp, ro.eq), null, reachOpp)
    }
    if (node.kind !== 'decision') return terminalValue(node, brP, reachOpp, eq)
    if (node.player === brP) {
      const vals = node.actions.map((_a, a) => brValue(node.actions[a].child, brP, reachOpp, eq))
      return ranges[brP].map((_c, c) => Math.max(...vals.map(v => v[c])))
    }
    const strat = avgOf(node)
    const res = new Array<number>(ranges[brP].length).fill(0)
    for (let a = 0; a < node.actions.length; a++) {
      const v = brValue(node.actions[a].child, brP, mul(reachOpp, strat, a), eq)
      for (let c = 0; c < res.length; c++) res[c] += v[c]
    }
    return res
  }
  const sumOOP = oop.reduce((s, c) => s + c.weight, 0) || 1
  const sumIP = ip.reduce((s, c) => s + c.weight, 0) || 1
  const weighted = (vec: number[], w: Combo[], selfSum: number, oppSum: number) =>
    vec.reduce((s, v, c) => s + w[c].weight * v, 0) / (selfSum * oppSum)
  const avg0 = weighted(valueAvg(root, 0, ip.map(c => c.weight), null), oop, sumOOP, sumIP)
  const avg1 = weighted(valueAvg(root, 1, oop.map(c => c.weight), null), ip, sumIP, sumOOP)
  const br0 = weighted(brValue(root, 0, ip.map(c => c.weight), null), oop, sumOOP, sumIP)
  const br1 = weighted(brValue(root, 1, oop.map(c => c.weight), null), ip, sumIP, sumOOP)
  const exploitability = Math.max(0, ((br0 - avg0) + (br1 - avg1)) / 2 / potBB)

  return { root, oopRootStrategy, nodes, exploitability: +exploitability.toFixed(4) }
}
