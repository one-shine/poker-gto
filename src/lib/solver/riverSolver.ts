import type { Card } from '../../types/game'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import { sameCard } from '../../engine/cards/Card'
import { createDeck } from '../../engine/cards/Deck'

// ── HU リバーサブゲームの厳密求解 (vector CFR / CFR+) ───────────────────────────
// 外部依存ゼロの自前ソルバー。リバーはチャンスノードが無く、ショーダウン勝敗が
// 確定するため、限定ベットツリー上の CFR で高速に均衡へ収束する。
// 依存方向: engine ← solver。engine は本層に依存しない。

export interface Combo {
  cards: [Card, Card]
  weight: number
}

export interface RiverInput {
  board: Card[] // river=5枚 / turn=4枚 / flop=3枚 (ショーダウンをランナウト平均エクイティで近似)
  oop: Combo[]  // アウトオブポジション (先行)
  ip: Combo[]   // インポジション
  potBB: number
  stackBB: number     // 各プレイヤーのストリート開始時の残りスタック (有効スタック)
  betSizes?: number[] // ポット比のベットサイズ (既定 [0.66])
  raiseSizes?: number[] // ポット比のレイズ (既定 [], レイズ無し)
  iterations?: number
  runoutSamples?: number // flop のランナウト組サンプル数 (既定 80)。turn は全44, river は無視
  // R14②: turn 完全チャンス CFR の opt-in。solveRiver は無視し、solverClient/Worker が
  // useChanceCFR=true のとき turnSolver.solveTurn へ振り替える。
  useChanceCFR?: boolean
  runoutN?: number // chance ノードの river ランナウトサンプル数 (既定 12)
}

export type RiverActionLabel = 'check' | 'call' | 'fold' | { bet: number } | { raise: number }

export interface SolvedAction {
  action: 'check' | 'call' | 'fold' | 'bet' | 'raise'
  sizeBB?: number   // bet/raise の追加投入額 (このアクションで足す額)
  frequency: number // そのプレイヤーの該当コンボでの平均採用頻度
  ev: number        // そのアクションの EV (BB, サブゲーム純損益)
}

// シリアライズ可能なノード要約 (Worker 境界・ノード探索用)。
export interface SolvedNodeSummary {
  path: number[]    // root からのアクション index 列 (例: [] ルート, [0] 1つ目のアクション)
  player: 0 | 1
  toCall: number
  actions: { action: SolvedAction['action']; sizeBB?: number }[]
  strategy: number[][] // [combo][actionIdx] 頻度
  ev: number[][]       // [combo][actionIdx] EV(BB)
}

interface DecisionNode {
  kind: 'decision'
  player: 0 | 1 // 0=OOP, 1=IP
  toCall: number       // このノードで直面しているコール額 (0=ベット無し)
  committed: [number, number] // 各プレイヤーのサブゲーム投入額 (これまで)
  actions: { label: SolvedAction['action']; addBB: number; child: Node }[]
  // CFR 用 (acting player のコンボ数ぶん)
  regret: number[][]   // [combo][actionIdx]
  stratSum: number[][]
}
interface TerminalNode {
  kind: 'showdown' | 'fold'
  committed: [number, number]
  folder?: 0 | 1
}
type Node = DecisionNode | TerminalNode

export interface RiverSolution {
  // 各ノードの平均戦略を引くためのツリー。getSolution が現ノードを辿って戦略を取り出す。
  root: Node
  // ルート(OOP)戦略を combo ごとに返す簡易ビュー (テスト/簡易表示用)
  oopRootStrategy: SolvedAction[][]
  // 全 decision ノードの要約 (シリアライズ可能・Worker/探索用)
  nodes: SolvedNodeSummary[]
  exploitability: number // % pot (近似)
}

const PRECISION = 1e-9

// ── ツリー構築 ────────────────────────────────────────────────────────────────
// OOP 先行。check/bet → 相手 check(SD)/bet, call/fold(+任意raise)。レイズ上限1回。
function buildTree(input: RiverInput): Node {
  const pot = input.potBB
  const stack = input.stackBB
  const betSizes = input.betSizes ?? [0.66]
  const raiseSizes = input.raiseSizes ?? []

  const showdown = (committed: [number, number]): TerminalNode => ({ kind: 'showdown', committed })
  const fold = (committed: [number, number], folder: 0 | 1): TerminalNode => ({ kind: 'fold', committed, folder })

  const mkDecision = (
    player: 0 | 1,
    toCall: number,
    committed: [number, number],
    actions: { label: SolvedAction['action']; addBB: number; child: Node }[],
  ): DecisionNode => ({ kind: 'decision', player, toCall, committed, actions, regret: [], stratSum: [] })

  // 相手のベットに直面したノード (player が応答): fold / call / (raise)
  function facingBet(
    player: 0 | 1, toCall: number, committed: [number, number], potNow: number, raisesLeft: number,
  ): Node {
    const acts: { label: SolvedAction['action']; addBB: number; child: Node }[] = []
    // fold
    acts.push({ label: 'fold', addBB: 0, child: fold(committed, player) })
    // call
    const callCommitted: [number, number] = [...committed] as [number, number]
    callCommitted[player] += toCall
    acts.push({ label: 'call', addBB: toCall, child: showdown(callCommitted) })
    // raise (上限内・スタック内)
    if (raisesLeft > 0) {
      for (const rs of raiseSizes) {
        const potAfterCall = potNow + toCall
        const raiseAdd = toCall + +(potAfterCall * rs).toFixed(2)
        const maxAdd = stack - committed[player]
        const add = Math.min(raiseAdd, maxAdd)
        if (add <= toCall + PRECISION) continue
        const rc: [number, number] = [...committed] as [number, number]
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

  // OOP ルート: check / bet
  const oopActs: { label: SolvedAction['action']; addBB: number; child: Node }[] = []
  // check → IP: check(SD) / bet
  const ipAfterCheckActs: { label: SolvedAction['action']; addBB: number; child: Node }[] = [
    { label: 'check', addBB: 0, child: showdown([0, 0]) },
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
  // bet → IP faces bet: fold/call/(raise)
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

// ── ショーダウン: エクイティ行列 (river=二値 / turn・flop=ランナウト平均) ─────────
// eqOOP[i][j] = oop combo i が ip combo j に勝つエクイティ (tie=0.5)。
// board 5枚=リバー(二値比較)。4枚=ターン(残り1枚を回す)。3枚=フロップ(残り2枚, サンプリング)。
// ※ turn/flop は「リバーまでオールイン相当」の簡易近似 (リバーのベッティングは無視)。
function cardKey(c: Card): string { return `${c.rank}${c.suit}` }

function runoutBoards(board: Card[], sampleN: number): Card[][] {
  const need = 5 - board.length
  if (need <= 0) return [board]
  const used = new Set(board.map(cardKey))
  const remaining = createDeck().filter(c => !used.has(cardKey(c)))
  if (need === 1) return remaining.map(r => [...board, r])
  // need === 2 (flop): 残りカードの組をサンプリング (決定的: ストライド)
  const pairs: Card[][] = []
  for (let i = 0; i < remaining.length; i++)
    for (let j = i + 1; j < remaining.length; j++) pairs.push([...board, remaining[i], remaining[j]])
  if (pairs.length <= sampleN) return pairs
  const stride = pairs.length / sampleN
  const out: Card[][] = []
  for (let k = 0; k < sampleN; k++) out.push(pairs[Math.floor(k * stride)])
  return out
}

function equityMatrix(oop: Combo[], ip: Combo[], board: Card[], sampleN: number): number[][] {
  const eq = oop.map(() => new Array(ip.length).fill(0))
  const cnt = oop.map(() => new Array(ip.length).fill(0))
  const boards = runoutBoards(board, sampleN)
  for (const b of boards) {
    const bk = new Set(b.map(cardKey))
    // この5枚ボードを使うコンボの強度を事前計算 (ボードと衝突する手は無効)
    const sOOP = oop.map(c => (bk.has(cardKey(c.cards[0])) || bk.has(cardKey(c.cards[1])) ? -1 : evaluateBestHand([...c.cards, ...b]).rankValue))
    const sIP = ip.map(c => (bk.has(cardKey(c.cards[0])) || bk.has(cardKey(c.cards[1])) ? -1 : evaluateBestHand([...c.cards, ...b]).rankValue))
    for (let i = 0; i < oop.length; i++) {
      if (sOOP[i] < 0) continue
      for (let j = 0; j < ip.length; j++) {
        if (sIP[j] < 0) continue
        eq[i][j] += sOOP[i] > sIP[j] ? 1 : sOOP[i] < sIP[j] ? 0 : 0.5
        cnt[i][j] += 1
      }
    }
  }
  for (let i = 0; i < oop.length; i++)
    for (let j = 0; j < ip.length; j++) eq[i][j] = cnt[i][j] > 0 ? eq[i][j] / cnt[i][j] : 0.5
  return eq
}

function conflicts(a: Combo, b: Combo): boolean {
  return sameCard(a.cards[0], b.cards[0]) || sameCard(a.cards[0], b.cards[1]) ||
    sameCard(a.cards[1], b.cards[0]) || sameCard(a.cards[1], b.cards[1])
}

// ── CFR 本体 ──────────────────────────────────────────────────────────────────
function regretMatch(regret: number[]): number[] {
  let sum = 0
  const pos = regret.map(r => (r > 0 ? r : 0))
  for (const p of pos) sum += p
  if (sum <= PRECISION) return regret.map(() => 1 / regret.length)
  return pos.map(p => p / sum)
}

export function solveRiver(input: RiverInput): RiverSolution {
  const iterations = input.iterations ?? 600
  const { oop, ip, board, potBB } = input
  const ranges: [Combo[], Combo[]] = [oop, ip]
  // eqOOP[i][j] = oop combo i の ip combo j に対するエクイティ (river=二値, turn/flop=平均)
  const eqOOP = equityMatrix(oop, ip, board, input.runoutSamples ?? 80)
  const root = buildTree(input)
  const half = potBB / 2 // 死にポットの取り分 (zero-sum 化のため各自 half を保有とみなす)

  // ノードの regret/stratSum 配列をプレイヤーのコンボ数で初期化
  function initArrays(node: Node) {
    if (node.kind !== 'decision') return
    const n = ranges[node.player].length
    const a = node.actions.length
    node.regret = Array.from({ length: n }, () => new Array(a).fill(0))
    node.stratSum = Array.from({ length: n }, () => new Array(a).fill(0))
    for (const act of node.actions) initArrays(act.child)
  }
  initArrays(root)

  // ターミナル: updatingPlayer の各 combo に対する、相手 reach 加重 EV ベクトル
  function terminalValue(node: TerminalNode, up: 0 | 1, oppReach: number[]): number[] {
    const opp = (1 - up) as 0 | 1
    const myCombos = ranges[up]
    const oppCombos = ranges[opp]
    const res = new Array(myCombos.length).fill(0)
    // committed: サブゲーム投入額
    const myCommit = node.committed[up]
    const oppCommit = node.committed[opp]
    for (let i = 0; i < myCombos.length; i++) {
      let v = 0
      for (let j = 0; j < oppCombos.length; j++) {
        const r = oppReach[j]
        if (r <= 0) continue
        if (conflicts(myCombos[i], oppCombos[j])) continue
        let net: number
        if (node.kind === 'fold') {
          // folder が負け。up が folder なら負け、そうでなければ勝ち。
          net = node.folder === up ? -(half + myCommit) : (half + oppCommit)
        } else {
          // showdown: up のエクイティ e で期待損益 (e=1で +half+oppCommit, e=0で -(half+myCommit))
          const e = up === 0 ? eqOOP[i][j] : 1 - eqOOP[j][i]
          net = e * (half + oppCommit) - (1 - e) * (half + myCommit)
        }
        v += r * net
      }
      res[i] = v
    }
    return res
  }

  // traverse: updatingPlayer の combo ごとの counterfactual value を返す。
  function traverse(node: Node, up: 0 | 1, reachUp: number[], reachOpp: number[]): number[] {
    if (node.kind !== 'decision') return terminalValue(node, up, reachOpp)
    const acting = node.player
    const combos = ranges[acting]
    const strat = node.regret.map(regretMatch)
    const A = node.actions.length

    if (acting === up) {
      // 自分の手番: アクションごとに自分の reach を strat でスケールして子を評価 → regret 更新
      const actionVals: number[][] = node.actions.map((_act, a) =>
        traverse(node.actions[a].child, up, mul(reachUp, strat, a), reachOpp),
      )
      const nodeVal = new Array(combos.length).fill(0)
      for (let c = 0; c < combos.length; c++) {
        for (let a = 0; a < A; a++) nodeVal[c] += strat[c][a] * actionVals[a][c]
      }
      for (let c = 0; c < combos.length; c++) {
        for (let a = 0; a < A; a++) {
          node.regret[c][a] = Math.max(0, node.regret[c][a] + actionVals[a][c] - nodeVal[c]) // CFR+
          node.stratSum[c][a] += reachUp[c] * strat[c][a]
        }
      }
      return nodeVal
    } else {
      // 相手の手番: アクション確率を相手 reach に畳み込み、合算
      const nodeVal = new Array(ranges[up].length).fill(0)
      for (let a = 0; a < A; a++) {
        const childOppReach = mul(reachOpp, strat, a)
        const v = traverse(node.actions[a].child, up, reachUp, childOppReach)
        for (let c = 0; c < nodeVal.length; c++) nodeVal[c] += v[c]
      }
      return nodeVal
    }
  }
  // reach[c] を acting プレイヤーの action a 採用確率 strat[c][a] でスケール
  function mul(reach: number[], strat: number[][], a: number): number[] {
    return reach.map((r, c) => r * (strat[c]?.[a] ?? 0))
  }

  // 反復
  const initReach = (combos: Combo[]) => combos.map(c => c.weight)
  for (let t = 0; t < iterations; t++) {
    traverse(root, 0, initReach(oop), initReach(ip))
    traverse(root, 1, initReach(ip), initReach(oop))
  }

  // ── EV 計算: 平均戦略を固定し、各アクションの EV を combo 別に算出 ──────────
  const avgOf = (node: DecisionNode): number[][] =>
    node.stratSum.map(sums => {
      const tot = sums.reduce((s, x) => s + x, 0)
      return tot > PRECISION ? sums.map(x => x / tot) : sums.map(() => 1 / sums.length)
    })
  // 平均戦略下での up の counterfactual value ベクトル
  function valueAvg(node: Node, up: 0 | 1, reachOpp: number[]): number[] {
    if (node.kind !== 'decision') return terminalValue(node, up, reachOpp)
    const strat = avgOf(node)
    if (node.player === up) {
      const vals = node.actions.map((_a, a) => valueAvg(node.actions[a].child, up, reachOpp))
      const res = new Array(ranges[up].length).fill(0)
      for (let c = 0; c < res.length; c++)
        for (let a = 0; a < node.actions.length; a++) res[c] += strat[c][a] * vals[a][c]
      return res
    }
    const res = new Array(ranges[up].length).fill(0)
    for (let a = 0; a < node.actions.length; a++) {
      const v = valueAvg(node.actions[a].child, up, mul(reachOpp, strat, a))
      for (let c = 0; c < res.length; c++) res[c] += v[c]
    }
    return res
  }
  // 指定 decision ノードでの「各コンボ×各アクションの EV(BB)」を返す
  function actionEVs(node: DecisionNode, reachOpp: number[]): number[][] {
    const up = node.player
    const opp = (1 - up) as 0 | 1
    // combo c の正規化係数 = 衝突しない相手 reach の総和
    const norm = ranges[up].map((mc) => {
      let s = 0
      ranges[opp].forEach((oc, o) => { if (!conflicts(mc, oc)) s += reachOpp[o] })
      return s > PRECISION ? s : 1
    })
    return node.actions.map((_a, a) => {
      const v = valueAvg(node.actions[a].child, up, reachOpp)
      return v.map((val, c) => val / norm[c])
    })
  }

  const ipReach = ip.map(c => c.weight)
  const rootEVs = actionEVs(root as DecisionNode, ipReach) // [action][combo]
  const oopRootStrategy = avgStrategyAt(root as DecisionNode).map((acts, c) =>
    acts.map((a, ai) => ({ ...a, ev: +rootEVs[ai][c].toFixed(3) })),
  )

  // 全 decision ノードを平坦化 (前向きパスで各ノードの相手 reach を伝播)。
  const nodes: SolvedNodeSummary[] = []
  const initW: [number[], number[]] = [oop.map(c => c.weight), ip.map(c => c.weight)]
  function flatten(node: Node, path: number[], reach: [number[], number[]]) {
    if (node.kind !== 'decision') return
    const p = node.player
    const opp = (1 - p) as 0 | 1
    const avg = avgOf(node)
    const evs = actionEVs(node, reach[opp]) // [action][combo]
    nodes.push({
      path: [...path], player: p, toCall: node.toCall,
      actions: node.actions.map(a => ({ action: a.label, sizeBB: a.addBB > 0 ? a.addBB : undefined })),
      strategy: avg.map(row => row.map(x => +x.toFixed(4))),
      ev: avg.map((_row, c) => node.actions.map((_a, ai) => +evs[ai][c].toFixed(3))),
    })
    node.actions.forEach((act, ai) => {
      // p の reach をこのアクション採用確率でスケール、opp はそのまま
      const childReach: [number[], number[]] = [reach[0].slice(), reach[1].slice()]
      childReach[p] = reach[p].map((r, c) => r * (avg[c]?.[ai] ?? 0))
      flatten(act.child, [...path, ai], childReach)
    })
  }
  flatten(root, [], initW)

  // ── exploitability (CFR 収束度の指標, %pot) ───────────────────────────────────
  // br プレイヤーが各ノードで最大値アクションを取り (best response)、相手は平均戦略を打つ
  // ときの cf 値。均衡なら BR ≒ 平均 → exploitability ≒ 0。
  // 注意: これは「CFR がどれだけ収束したか」であって、turn/flop のエクイティ抽象化誤差(R14)は測らない。
  function brValue(node: Node, brP: 0 | 1, reachOpp: number[]): number[] {
    if (node.kind !== 'decision') return terminalValue(node, brP, reachOpp)
    if (node.player === brP) {
      const vals = node.actions.map((_a, a) => brValue(node.actions[a].child, brP, reachOpp))
      return ranges[brP].map((_c, c) => Math.max(...vals.map(v => v[c]))) // best response
    }
    const strat = avgOf(node)
    const res = new Array(ranges[brP].length).fill(0)
    for (let a = 0; a < node.actions.length; a++) {
      const v = brValue(node.actions[a].child, brP, mul(reachOpp, strat, a))
      for (let c = 0; c < res.length; c++) res[c] += v[c]
    }
    return res
  }
  const sumOOP = oop.reduce((s, c) => s + c.weight, 0) || 1
  const sumIP = ip.reduce((s, c) => s + c.weight, 0) || 1
  // p の平均/BR の「1ハンドあたり BB」値 (cf値を両者reach総和で正規化)
  const weighted = (vec: number[], w: Combo[], selfSum: number, oppSum: number) =>
    vec.reduce((s, v, c) => s + w[c].weight * v, 0) / (selfSum * oppSum)
  const avg0 = weighted(valueAvg(root, 0, ip.map(c => c.weight)), oop, sumOOP, sumIP)
  const avg1 = weighted(valueAvg(root, 1, oop.map(c => c.weight)), ip, sumIP, sumOOP)
  const br0 = weighted(brValue(root, 0, ip.map(c => c.weight)), oop, sumOOP, sumIP)
  const br1 = weighted(brValue(root, 1, oop.map(c => c.weight)), ip, sumIP, sumOOP)
  const exploitability = Math.max(0, ((br0 - avg0) + (br1 - avg1)) / 2 / potBB)

  return { root, oopRootStrategy, nodes, exploitability: +exploitability.toFixed(4) }
}

// 指定 decision ノードの平均戦略を SolvedAction[][] (combo→actions) で返す
export function avgStrategyAt(node: DecisionNode): SolvedAction[][] {
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
