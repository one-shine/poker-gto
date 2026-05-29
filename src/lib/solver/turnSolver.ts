import type { Card, Rank } from '../../types/game'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import { sameCard, RANK_VALUES } from '../../engine/cards/Card'
import { createDeck } from '../../engine/cards/Deck'
import type { Combo, RiverInput, SolvedAction, SolvedNodeSummary } from './riverSolver'

// ── R14② turn 完全チャンスノード CFR ──────────────────────────────────────────
// turn (board=4枚) を「turn ベッティング → ChanceNode(river札を配る) → river ベッティング
// → 厳密2値ショーダウン」の2ストリート CFR で求解する。riverSolver の turn 近似(リバーまで
// オールイン相当のエクイティ平均=以降の賭け未考慮)と違い、river のベッティング判断を織り込む
// ため、ドロー(降ろされる/降ろさない)の過大評価を解消する。
//
// riverSolver.ts は不変(回帰安全網)。本ファイルは opt-in: solverClient/Worker が
// `useChanceCFR` のとき solveTurn へ振り替える。設計は docs/PHASE_3_5.md R14② 計画書 +
// 設計検証ワークフローの統一スペック(eq 明示パラメータ化・二重 half 体系・チャンス分岐は
// 値に 1/N・常に全 N で割る・nature に best-response しない)に従う。

const PRECISION = 1e-9

// ── ノード型 (riverSolver の DecisionNode/TerminalNode を踏襲し ChanceNode を追加) ──
type ActionLabel = SolvedAction['action']
interface TreeAction { label: ActionLabel; addBB: number; child: Node }
interface DecisionNode {
  kind: 'decision'
  player: 0 | 1 // 0=OOP, 1=IP
  toCall: number
  committed: [number, number]
  actions: TreeAction[]
  regret: number[][]
  stratSum: number[][]
}
interface TerminalNode {
  kind: 'showdown' | 'fold'
  committed: [number, number] // この層(turn or river サブゲーム)内の投入額
  folder?: 0 | 1
  half: number // 死にポット取り分。turn-fold=potBB/2 / river サブツリー終端=potAfterTurn/2
}
interface ChanceNode {
  kind: 'chance'
  potAfterTurn: number
  committedAtChance: [number, number]
  runouts: ChanceChild[]
}
interface ChanceChild {
  card: Card
  eq: number[][]        // 5枚ボードの厳密2値ショーダウン eq[oop_i][ip_j] (衝突手=-1, 到達時 reach=0)
  removedOOP: boolean[] // ranges[0](OOP) で配られた river 札を含む combo
  removedIP: boolean[]  // ranges[1](IP)
  subtree: Node         // この runout 専用の river ベッティング部分木 (独立 regret/stratSum)
}
type Node = DecisionNode | TerminalNode | ChanceNode

export interface TurnSolution {
  root: Node
  oopRootStrategy: SolvedAction[][]
  nodes: SolvedNodeSummary[]
  exploitability: number // % pot (チャンスサンプリングのため river より緩い収束=目標 <10%)
}

// ── 小ヘルパ (riverSolver と同等・本ファイル自己完結で river を不変に保つ) ─────────
function cardKey(c: Card): string { return `${c.rank}${c.suit}` }
function comboHasCard(combo: Combo, card: Card): boolean {
  return sameCard(combo.cards[0], card) || sameCard(combo.cards[1], card)
}
function conflicts(a: Combo, b: Combo): boolean {
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

// 5枚ボードの厳密2値ショーダウン。eq[i][j] = oop_i が ip_j に勝つ確率 (tie=0.5)。
// ボードと衝突する手は -1 (river 札と衝突する手は呼び出し側で reach=0、turn 札との衝突手は
// 元々レンジに含まれない)。runoutBoards 不要(5枚=ランナウト無し)で river より軽量。
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

// turn 後に配り得る river 札 = デッキ − 盤面4枚 = 48通り。turn river は単一札なので
// production は全列挙する(ランク/スート完全被覆 = サンプリングバイアス無し)。river 札と手の
// 衝突は removed* マスクで per-runout 処理する(札集合からは除かない)。
export function allTurnRunouts(board: Card[]): Card[] {
  const used = new Set(board.map(cardKey))
  return createDeck().filter(c => !used.has(cardKey(c)))
}

// サブセット抽出 (主にテスト用)。createDeck は suit-outer/rank-inner で suit ブロック化されており、
// 素のストライドは同一ランク帯ばかり拾う(R14② レビューで発見・修正したバグ)。ランク昇順に
// 1枚ずつ巡回し、周回ごとにスートをずらして拾うことで、ランク被覆 + スート分散を確保する。
export function selectRunouts(board: Card[], n: number): Card[] {
  const remaining = allTurnRunouts(board)
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

// 1つの runout (card+eq+removed) は全 ChanceNode で共通 (盤面+レンジが同一) なので solveTurn で
// 一度だけ算出して共有する。ChanceNode 間で変わるのは pot/stack(=subtree)のみ。
interface RunoutData { card: Card; eq: number[][]; removedOOP: boolean[]; removedIP: boolean[] }

// ── ベッティング層ツリー構築 (riverSolver.buildTree を foldHalf + onShowdown で一般化) ──
interface LayerOpts {
  pot: number
  stack: number
  betSizes: number[]
  raiseSizes: number[]
  foldHalf: number
  onShowdown: (committed: [number, number]) => Node // turn 層=ChanceNode / river 層=showdown終端
}
function buildBettingLayer(o: LayerOpts): Node {
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

// 非fold の turn 終端を置換する ChanceNode を構築。river サブツリーは potAfterTurn(=turn 投入を
// 死にポットへ畳んだ額)とスタック(turn 投入を差し引いた残り)で組む。river の committed は [0,0] に
// リセットされる(turn チップは potAfterTurn=halfR 側にあるため二重計上にならない)。
function makeChance(
  turnCommitted: [number, number], input: RiverInput, runoutData: RunoutData[],
): ChanceNode {
  if (Math.abs(turnCommitted[0] - turnCommitted[1]) > PRECISION) {
    // チャンスノードはマッチしたアクション(両チェック=[0,0] / コール=[add,add])でのみ到達する。
    // 未マッチのベットは必ず fold 終端。ツリー構築の将来変更で破れたら即失敗させる。
    throw new Error('chance node reached with asymmetric commits')
  }
  const potAfterTurn = input.potBB + turnCommitted[0] + turnCommitted[1]
  const halfR = potAfterTurn / 2
  const riverStack = input.stackBB - turnCommitted[0]
  const betSizes = input.betSizes ?? [0.66]
  const raiseSizes = input.raiseSizes ?? []
  const runouts: ChanceChild[] = runoutData.map(rd => ({
    card: rd.card, eq: rd.eq, removedOOP: rd.removedOOP, removedIP: rd.removedIP,
    subtree: buildBettingLayer({
      pot: potAfterTurn, stack: riverStack, betSizes, raiseSizes,
      foldHalf: halfR,
      onShowdown: (committed) => ({ kind: 'showdown', committed, half: halfR }),
    }),
  }))
  return { kind: 'chance', potAfterTurn, committedAtChance: turnCommitted, runouts }
}

// ── 求解本体 ──────────────────────────────────────────────────────────────────
export function solveTurn(input: RiverInput): TurnSolution {
  const iterations = input.iterations ?? 100
  const { oop, ip, potBB } = input
  const ranges: [Combo[], Combo[]] = [oop, ip]
  // turn river は単一札・48通り。production はサンプリングせず全列挙(ランク/スート完全被覆)。
  // runoutN 指定時のみサブセット(主にテスト用)。
  const runoutCards = input.runoutN != null ? selectRunouts(input.board, input.runoutN) : allTurnRunouts(input.board)
  const runoutData: RunoutData[] = runoutCards.map(card => {
    const board5 = [...input.board, card]
    return {
      card, eq: strictEquity5(oop, ip, board5),
      removedOOP: oop.map(c => comboHasCard(c, card)),
      removedIP: ip.map(c => comboHasCard(c, card)),
    }
  })
  const realN = runoutCards.length // 実 runout 数 (デッキ枯渇時に N 未満になり得る)

  // turn ベッティング層 (fold=halfT=potBB/2) + 非fold終端を ChanceNode へ。
  const root = buildBettingLayer({
    pot: potBB, stack: input.stackBB,
    betSizes: input.betSizes ?? [0.66], raiseSizes: input.raiseSizes ?? [],
    foldHalf: potBB / 2,
    onShowdown: (committed) => makeChance(committed, input, runoutData),
  })

  // regret/stratSum 初期化。ChanceNode は子 subtree へ再帰し自身は配列を持たない。
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

  // 終端値: showdown は eq(その runout の厳密2値) を使う。half は node.half(二重体系)。
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
          // showdown 終端は必ず runout サブツリー内 → eq 非null。
          const e = up === 0 ? eq![i][j] : 1 - eq![j][i]
          net = e * (half + oppCommit) - (1 - e) * (half + myCommit)
        }
        v += r * net
      }
      res[i] = v
    }
    return res
  }

  // チャンス分岐: 各 runout で配られた river 札を含む手の reach を 0 にし、子 subtree を eq=ro.eq で
  // 評価して 1/N(=realN)平均する。1/N は値にのみ乗せ reach には乗せない。除数は常に realN。
  function chanceAccumulate(
    node: ChanceNode, up: 0 | 1, recurse: (ro: ChanceChild, adjUp: number[] | null, adjOpp: number[]) => number[],
    reachUp: number[] | null, reachOpp: number[],
  ): number[] {
    const acc = new Array<number>(ranges[up].length).fill(0)
    for (const ro of node.runouts) {
      const upMask = up === 0 ? ro.removedOOP : ro.removedIP
      const oppMask = up === 0 ? ro.removedIP : ro.removedOOP
      const adjUp = reachUp ? reachUp.map((r, i) => (upMask[i] ? 0 : r)) : null
      const adjOpp = reachOpp.map((r, j) => (oppMask[j] ? 0 : r))
      const v = recurse(ro, adjUp, adjOpp)
      for (let c = 0; c < acc.length; c++) acc[c] += upMask[c] ? 0 : v[c] / realN
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

  // ── 平均戦略下の評価 (EV / exploitability) ────────────────────────────────────
  const avgOf = (node: DecisionNode): number[][] =>
    node.stratSum.map(sums => {
      const tot = sums.reduce((s, x) => s + x, 0)
      return tot > PRECISION ? sums.map(x => x / tot) : sums.map(() => 1 / sums.length)
    })

  // net≡1 の終端評価。EV 正規化の分母「到達した非衝突 相手 reach の質量」を value と同じ経路
  // (同じ戦略ルーティング + チャンスのカード除去/1N 平均)で算出するために使う。
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

  // 平均戦略下の up の counterfactual 量を伝播する共通関数。term=terminalValue で EV(分子)、
  // term=terminalMass で reach 質量(分母)。チャンスは runout 平均 (1/N・カード除去) で共通。
  type TermEval = (node: TerminalNode, up: 0 | 1, oppReach: number[], eq: number[][] | null) => number[]
  function propagateAvg(node: Node, up: 0 | 1, reachOpp: number[], eq: number[][] | null, term: TermEval): number[] {
    if (node.kind === 'chance') {
      return chanceAccumulate(node, up,
        (ro, _adjUp, adjOpp) => propagateAvg(ro.subtree, up, adjOpp, ro.eq, term), null, reachOpp)
    }
    if (node.kind !== 'decision') return term(node, up, reachOpp, eq)
    const strat = avgOf(node)
    if (node.player === up) {
      const vals = node.actions.map((_a, a) => propagateAvg(node.actions[a].child, up, reachOpp, eq, term))
      const res = new Array<number>(ranges[up].length).fill(0)
      for (let c = 0; c < res.length; c++)
        for (let a = 0; a < node.actions.length; a++) res[c] += strat[c][a] * vals[a][c]
      return res
    }
    const res = new Array<number>(ranges[up].length).fill(0)
    for (let a = 0; a < node.actions.length; a++) {
      const v = propagateAvg(node.actions[a].child, up, mul(reachOpp, strat, a), eq, term)
      for (let c = 0; c < res.length; c++) res[c] += v[c]
    }
    return res
  }
  const valueAvg = (node: Node, up: 0 | 1, reachOpp: number[], eq: number[][] | null) =>
    propagateAvg(node, up, reachOpp, eq, terminalValue)
  const massAvg = (node: Node, up: 0 | 1, reachOpp: number[], eq: number[][] | null) =>
    propagateAvg(node, up, reachOpp, eq, terminalMass)

  // 各 decision ノードの「コンボ×アクション EV(BB)」。分母は value と同経路の reach 質量(massAvg)。
  // チャンス層のカード除去で /N された分子と整合する(静的 norm だと除去バイアスで EV がずれる:
  // ground-truth ベットなし=エクイティ近似 と一致しない)。/N は分子分母で相殺し条件付き EV を返す。
  function actionEVs(node: DecisionNode, reachOpp: number[]): number[][] {
    const up = node.player
    return node.actions.map((_a, a) => {
      const v = valueAvg(node.actions[a].child, up, reachOpp, null)
      const m = massAvg(node.actions[a].child, up, reachOpp, null)
      return v.map((val, c) => (Math.abs(m[c]) > PRECISION ? val / m[c] : 0))
    })
  }

  function avgStrategyAt(node: DecisionNode): SolvedAction[][] {
    return node.stratSum.map(sums => {
      const total = sums.reduce((s, x) => s + x, 0)
      return node.actions.map((act, a) => ({
        action: act.label,
        sizeBB: act.addBB > 0 ? act.addBB : undefined,
        frequency: total > PRECISION ? sums[a] / total : 1 / node.actions.length,
        ev: 0,
      }))
    })
  }

  const ipReach = ip.map(c => c.weight)
  const rootDecision = root as DecisionNode
  const rootEVs = actionEVs(rootDecision, ipReach)
  const oopRootStrategy = avgStrategyAt(rootDecision).map((acts, c) =>
    acts.map((a, ai) => ({ ...a, ev: +rootEVs[ai][c].toFixed(3) })))

  // turn decision ノードのみ平坦化 (チャンス/終端は skip → river サブツリーは要約に出ない=
  // turn 判断のコーチング用。river コーチングは従来通り riverSolver 経路)。
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

  // ── exploitability (収束度, %pot)。BR は nature には best-response しない(runout 平均)。
  // 正規化は river と同一・除数は input.potBB(turn 入口ポット=root cf 値のフレーム)。
  function brValue(node: Node, brP: 0 | 1, reachOpp: number[], eq: number[][] | null): number[] {
    if (node.kind === 'chance') {
      return chanceAccumulate(node, brP,
        (ro, _adjUp, adjOpp) => brValue(ro.subtree, brP, adjOpp, ro.eq), null, reachOpp)
    }
    if (node.kind !== 'decision') return terminalValue(node, brP, reachOpp, eq)
    if (node.player === brP) {
      const vals = node.actions.map((_a, a) => brValue(node.actions[a].child, brP, reachOpp, eq))
      return ranges[brP].map((_c, c) => Math.max(...vals.map(v => v[c]))) // アクションのみ best-response
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
