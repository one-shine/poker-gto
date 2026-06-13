import { CATEGORIES, COMBO_COUNT, AVAIL } from './pushFold'

// ── マルチウェイ プリフロップ ジョイント CFR (Phase C2 / R4) ──────────────────────
// Phase C(HU縮約)の構造的限界 = opener と BB の間のプレイヤーを「全員フォールド済」と
// 仮定して早い位置の open が過広になった問題を、背後プレイヤーを**1つのアクション順ゲーム木**
// に入れて構造から解く。postflop は解かず終端 EV テーブルに落とす(路線(3): Simple Preflop
// Holdem / HRC v3 がデスクトップで実証)。
//
// 抽象化: 手 = 169 カテゴリ / アクション = fold/call/raise / レイズサイズは段ごと離散1種
//   (open/3bet/4bet/5bet-allin)/ レイズ上限 = MAX_RAISE。6 席を順に処理。リンプ無し
//   (ブラインドに対面した最初のプレイヤーは fold か open-raise のみ)。
// 終端 EV(hero 視点・ハンド開始 0 基準・BB):
//   foldout      = 厳密(勝者が pot 取得・他は forfeit)
//   allin showdown = N-way 厳密エクイティ(showdown=真値)
//   HU seen-flop = Phase B の V 行列(契約フレーム)
//   multiway seen-flop = 粗いマルチウェイ EV(N-way share × 実現率・**最弱リンク**・正直に明記)
// 多人数 CFR は収束保証なし(2人ゼロ和のみ保証)→ 平均戦略の安定性と既知アンカーで品質を測る。
// source は 'solver_model'(採用ゲート通過後のみ配線)。依存方向: engine ← solver。

const NP = 6
export const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'] as const
const SB_SEAT = 4
const BB_SEAT = 5
const NCAT = CATEGORIES.length

// アクションコード。raise は「次の段へ上げる」単一アクション(サイズは段で一意)。
export const FOLD = 0
export const CALL = 1
export const RAISE = 2
export type ActionCode = typeof FOLD | typeof CALL | typeof RAISE

export interface TreeConfig {
  maxRaise: number        // 4 = 5bet-allin まで / 3 = 4bet 上限
  sizes: number[]         // sizes[level] = その段のレイザー総投入。sizes[maxRaise] は通常 = stack(allin)
  stack: number           // 有効スタック(既定 100)
  smallBlind: number      // 既定 0.5
  bigBlind: number        // 既定 1.0
}

export const DEFAULT_TREE_CONFIG: TreeConfig = {
  // 3bet 11 / 4bet 24 は Phase B モデルの pot(srp 5.5 / 3bet 22.5)に整合させ V 行列配線を可能に。
  maxRaise: 4,
  sizes: [1.0, 2.5, 11, 24, 100], // [blind, open, 3bet, 4bet, 5bet-allin]
  stack: 100,
  smallBlind: 0.5,
  bigBlind: 1.0,
}

// 終端の種別。
export type TerminalKind = 'foldout' | 'allin' | 'hu_flop' | 'multiway_flop'

export interface DecisionNode {
  kind: 'decision'
  id: number
  player: number              // 行動するシート
  raiseLevel: number          // この決定に入る時点のレイズ段(0=ブラインドのみ)
  actions: ActionCode[]       // 取りうるアクション
  children: number[]          // actions[i] を取った先の node id
}

export interface TerminalNode {
  kind: 'terminal'
  id: number
  terminal: TerminalKind
  invested: Float64Array      // 各シートの総投入(pot = Σ・各自の forfeit/利得計算に使う)
  active: number[]            // showdown に残ったシート(foldout は winner 1 人)
}

export type GameNode = DecisionNode | TerminalNode

export interface PreflopTree {
  nodes: GameNode[]
  root: number
  config: TreeConfig
  decisionCount: number
  terminalCounts: Record<TerminalKind, number>
}

interface BuildState {
  inv: Float64Array
  folded: boolean[]
  allin: boolean[]
  raiseLevel: number
  lastRaiser: number          // 直近のレイザー(初期 = BB。ここに行動が戻れば締切)
  lastActor: number           // 直近に行動したシート(初期 = BB)
}

// ブラインドに対面した最初の行動 or レイズに対する行動を、アクション順に展開してゲーム木を作る。
export function buildPreflopTree(config: TreeConfig = DEFAULT_TREE_CONFIG): PreflopTree {
  const nodes: GameNode[] = []
  const terminalCounts: Record<TerminalKind, number> = { foldout: 0, allin: 0, hu_flop: 0, multiway_flop: 0 }

  const addTerminal = (s: BuildState): number => {
    const active: number[] = []
    for (let p = 0; p < NP; p++) if (!s.folded[p]) active.push(p)
    let terminal: TerminalKind
    if (active.length <= 1) terminal = 'foldout'
    else if (active.some(p => s.allin[p])) terminal = 'allin'
    else if (active.length === 2) terminal = 'hu_flop'
    else terminal = 'multiway_flop'
    terminalCounts[terminal]++
    const id = nodes.length
    nodes.push({ kind: 'terminal', id, terminal, invested: Float64Array.from(s.inv), active })
    return id
  }

  // s.lastActor の次に行動する適格者を探す。lastRaiser に戻れば締切(=終端)。
  const proceed = (s: BuildState): number => {
    let actor = -1
    for (let i = 1; i <= NP; i++) {
      const seat = (s.lastActor + i) % NP
      if (seat === s.lastRaiser) break              // アグレッサーに戻った = 全員応答済 → 締切
      if (!s.folded[seat] && !s.allin[seat]) { actor = seat; break }
    }
    if (actor === -1) return addTerminal(s)         // 行動できる者が居ない → 締切

    const currentBet = maxInvested(s.inv)
    const canRaise = s.raiseLevel < config.maxRaise
    const actions: ActionCode[] = []
    if (s.raiseLevel === 0) {
      // ブラインドのみ = リンプ無し。fold か open-raise。
      actions.push(FOLD, RAISE)
    } else {
      actions.push(FOLD, CALL)
      if (canRaise) actions.push(RAISE)
    }

    const id = nodes.length
    const node: DecisionNode = { kind: 'decision', id, player: actor, raiseLevel: s.raiseLevel, actions, children: [] }
    nodes.push(node)

    for (const a of actions) {
      const ns: BuildState = {
        inv: Float64Array.from(s.inv),
        folded: s.folded.slice(),
        allin: s.allin.slice(),
        raiseLevel: s.raiseLevel,
        lastRaiser: s.lastRaiser,
        lastActor: actor,
      }
      if (a === FOLD) {
        ns.folded[actor] = true
      } else if (a === CALL) {
        const target = Math.min(currentBet, config.stack)
        ns.inv[actor] = target
        if (target >= config.stack) ns.allin[actor] = true
      } else {
        // RAISE: 次の段へ。サイズは段で一意(stack 超は allin にクランプ)。
        const lvl = s.raiseLevel + 1
        const target = Math.min(config.sizes[lvl], config.stack)
        ns.inv[actor] = target
        ns.raiseLevel = lvl
        ns.lastRaiser = actor
        if (target >= config.stack) ns.allin[actor] = true
      }
      node.children.push(buildFrom(ns))
    }
    return id
  }

  const buildFrom = (s: BuildState): number => proceed(s)

  // 初期状態: ブラインド投入済・BB を「アグレッサー」「直近行動者」に置き UTG から開始。
  const inv = new Float64Array(NP)
  inv[SB_SEAT] = config.smallBlind
  inv[BB_SEAT] = config.bigBlind
  const root = buildFrom({
    inv,
    folded: new Array(NP).fill(false),
    allin: new Array(NP).fill(false),
    raiseLevel: 0,
    lastRaiser: BB_SEAT,
    lastActor: BB_SEAT,
  })

  const decisionCount = nodes.reduce((n, x) => n + (x.kind === 'decision' ? 1 : 0), 0)
  return { nodes, root, config, decisionCount, terminalCounts }
}

function maxInvested(inv: Float64Array): number {
  let m = 0
  for (let i = 0; i < inv.length; i++) if (inv[i] > m) m = inv[i]
  return m
}

// ── ジョイント CFR(+) 求解 ───────────────────────────────────────────────────────
// 公開(アクション)木を CFR+ で解く。私的情報 = 169 カテゴリ。カテゴリ事前確率は独立近似
// (席間カードリムーバルは v1 では無視 = 計画が許す multiway 近似)。終端で相手のレンジ
// (到達 reach 正規化)に対しエクイティを周辺化する。多人数 CFR は収束保証なし → 平均戦略の
// 安定性とアンカーで品質を測る。
const PRIOR: Float64Array = (() => {
  const p = new Float64Array(NCAT)
  let tot = 0
  for (let c = 0; c < NCAT; c++) tot += COMBO_COUNT[c]
  for (let c = 0; c < NCAT; c++) p[c] = COMBO_COUNT[c] / tot
  return p
})()

// ハンドクラス別の実現率乗数(V3・seen-flop 終端の equity×pot×R 項に hero カテゴリで掛ける)。
// heuristic: not GTO-exact — showdown 勝率ベースの終端 EV は **スーテッドのポストフロップ実現**
// (フラッシュ/ストレート/ナッツ性)を取りこぼし、公開 GTO 比でスーテッドを過小・オフスート高カードを
// 過大にオープンする系統誤差を生む(V1 で実測・docs/SOLVER.md §6.6)。確立した GTO 理論「スーテッド/
// 連結/ナッツ性の高い手は equity を多く実現する」を乗数で近似(magnitude は公開 RFI に較正・V3-0 実験)。
// allin showdown(R=1)と foldout には掛けない(真値・カード非依存)。
const RANK_I = new Map(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'].map((r, i) => [r, i]))
const classMult: Float64Array = (() => {
  const m = new Float64Array(NCAT)
  for (let c = 0; c < NCAT; c++) {
    const cat = CATEGORIES[c]
    if (cat.length === 2) { m[c] = 1.00; continue }   // ペア
    if (cat[2] !== 's') { m[c] = 0.90; continue }      // オフスート非ペア = 実現率低
    const hi = RANK_I.get(cat[0])!, lo = RANK_I.get(cat[1])!
    const gap = hi - lo
    const wheelAce = cat[0] === 'A' && lo <= 3          // A2s–A5s(ウィール + ナッツフラッシュ)
    const broadway = hi >= 8 && lo >= 8                 // 両 ≥ T(JTs/QJs/KQs/QTs/KJs/KTs)
    const nutFlush = cat[0] === 'A' || cat[0] === 'K'   // A/K ハイ = ナッツ寄りフラッシュ
    if (gap <= 1 || wheelAce || broadway) m[c] = 1.20  // 強: 連結 / ウィール / スーテッドブロードウェイ
    else if (gap <= 3 || nutFlush) m[c] = 1.13         // 良: 1–2ギャップ or ナッツフラッシュ性
    else if (lo <= 4) m[c] = 1.05                       // 弱: disconnected かつ低カード(T2s 等の trash)
    else m[c] = 1.10                                    // 中: disconnected だが中カード
  }
  return m
})()

// postflop アクション順(SB→BB→UTG→MP→CO→BTN)の席→順位。IP = active 中で最大順位 = 最後に
// 行動 = ポジション優位。seen-flop の実現率に IP/OOP 非対称を入れて後ろ位置のオープンを正当化。
const PF_RANK = [2, 3, 4, 5, 0, 1] // index = seat(UTG..BB)

// HU seen-flop 終端を Phase B の解いたサブゲーム V 行列で評価する解決器の返り値。
// v[i]/support[i] は active[i] 視点(契約フレーム・V=stack value・恒等式 vOop+vIp^T=potBB)。
// 被覆スポット(opener-vs-BB の SRP/3bet 等)のみ非null・未被覆は呼び出し側が null を返し flat 近似へ。
export interface HuTerminalEV {
  v: ((number | null)[][] | null)[]   // [active0 の V, active1 の V]
  support: (number[] | null)[]        // [active0 の support, active1 の support]
}
export type HuSeenFlopResolver = (activeSeats: number[], invested: Float64Array) => HuTerminalEV | null
const MIN_SUPPORT_HU = 0.5

export interface MultiwaySolveOptions {
  eq: number[][]            // 169×169 オールイン勝率(HU showdown 厳密 + multiway proxy の素)
  iters: number
  config?: TreeConfig
  realization?: number      // 指定時は IP/OOP 共通の実現率(後方互換)。allin は常に R=1。
  ipRealization?: number    // seen-flop で IP(postflop 最後)のエクイティ実現率(既定 1.0)
  oopRealization?: number   // seen-flop で OOP のエクイティ実現率(既定 0.86)
  huSeenFlopEV?: HuSeenFlopResolver  // 被覆 HU seen-flop を Phase B V 行列で評価(未被覆は flat)
  linearAveraging?: boolean // CFR+ 線形平均(既定 true)
}

export interface MultiwaySolveResult {
  tree: PreflopTree
  avgStrategy: (Float64Array | null)[]  // node id → NCAT×nActions 平均戦略(terminal=null)
  openPctBySeat: number[]               // RFI raise%(UTG..SB)。BB は NaN
  rfiNodeBySeat: number[]               // 各席の RFI 決定ノード id(BB=-1)
  iters: number
}

// regret(+) からカテゴリ別 regret-matching 戦略。out[c*nA + a]。
function regretMatching(regret: Float64Array, nA: number, out: Float64Array): void {
  for (let c = 0; c < NCAT; c++) {
    let sum = 0
    const base = c * nA
    for (let a = 0; a < nA; a++) { const r = regret[base + a]; if (r > 0) sum += r }
    if (sum > 0) for (let a = 0; a < nA; a++) { const r = regret[base + a]; out[base + a] = r > 0 ? r / sum : 0 }
    else for (let a = 0; a < nA; a++) out[base + a] = 1 / nA
  }
}

export function solvePreflopMultiway(opts: MultiwaySolveOptions): MultiwaySolveResult {
  const tree = buildPreflopTree(opts.config ?? DEFAULT_TREE_CONFIG)
  const eq = opts.eq
  const R_IP = opts.realization ?? opts.ipRealization ?? 1.0
  const R_OOP = opts.realization ?? opts.oopRealization ?? 0.86
  const linear = opts.linearAveraging ?? true
  const { nodes } = tree

  // HU seen-flop 終端ごとに Phase B V 行列を1回だけ解決(被覆スポットのみ非null)。
  const huEV: (HuTerminalEV | null)[] = nodes.map(n =>
    (n.kind === 'terminal' && n.terminal === 'hu_flop' && opts.huSeenFlopEV)
      ? opts.huSeenFlopEV(n.active, n.invested) : null)

  // 決定ノードごとに regret / strategy-sum を確保。
  const regretSum: (Float64Array | null)[] = nodes.map(n => (n.kind === 'decision' ? new Float64Array(NCAT * n.actions.length) : null))
  const stratSum: (Float64Array | null)[] = nodes.map(n => (n.kind === 'decision' ? new Float64Array(NCAT * n.actions.length) : null))
  const stratScratch: (Float64Array | null)[] = nodes.map(n => (n.kind === 'decision' ? new Float64Array(NCAT * n.actions.length) : null))

  // 相手レンジ(reach 正規化)に対する hero 各カテゴリの勝率ベクトル u[c] = Σ_c' eq[c][c'] w[c']。
  const matvec = (w: Float64Array, wSum: number, out: Float64Array): void => {
    if (wSum <= 0) { out.fill(0.5); return }
    for (let c = 0; c < NCAT; c++) {
      const row = eq[c]
      let s = 0
      for (let cp = 0; cp < NCAT; cp++) s += row[cp] * w[cp]
      out[c] = s / wSum
    }
  }

  // 被覆 HU seen-flop: hero 各カテゴリ value = (Σ_cj reachNorm_opp[cj] cellVal) × prodOthers。
  // cellVal = support[c]≥0.5 かつ V[c][cj] 非null なら V[c][cj]−invHero(Phase B 解値)、さもなくば
  // flat(eq×pot×R−invHero)。全 cell flat なら flat 分岐と厳密一致(正規化整合)。
  const huHeroValue = (
    rbOpp: Float64Array, rsOpp: number, V: (number | null)[][] | null, sup: number[] | null,
    pot: number, Rh: number, invHero: number, prodH: number, out: Float64Array,
  ): void => {
    const gatedAll = V != null && sup != null
    for (let c = 0; c < NCAT; c++) {
      const vrow = gatedAll && sup![c] >= MIN_SUPPORT_HU ? V![c] : null
      const erow = eq[c]
      let s = 0
      for (let cj = 0; cj < NCAT; cj++) {
        const w = rbOpp[cj]
        if (w === 0) continue
        let cell: number
        if (vrow) { const v = vrow[cj]; cell = v != null && Number.isFinite(v) ? v - invHero : erow[cj] * pot * Rh * classMult[c] - invHero }
        else cell = erow[cj] * pot * Rh * classMult[c] - invHero
        s += w * cell
      }
      out[c] = (rsOpp > 0 ? s / rsOpp : 0) * prodH
    }
  }

  // 終端の各プレイヤー各カテゴリ**反実仮想値**(他プレイヤーの reach 積で非正規化重み付け)。
  // 標準 CFR の cfv[p][c] = Σ_{c_{-p}} (Π_{p'≠p} reach[p']) × U_p。share は reach 正規化 u で
  // 出し、最後に prodOthers[p]=Π_{p'≠p} reachSum[p'] を掛けて到達確率を織り込む。
  const uScratch: Float64Array[] = Array.from({ length: NP }, () => new Float64Array(NCAT))
  const reachSum = new Float64Array(NP)
  const prodOthers = new Float64Array(NP)
  const evalTerminal = (t: TerminalNode, reach: Float64Array[], value: Float64Array[]): void => {
    let pot = 0
    for (let p = 0; p < NP; p++) pot += t.invested[p]
    for (let p = 0; p < NP; p++) { let s = 0; const rp = reach[p]; for (let c = 0; c < NCAT; c++) s += rp[c]; reachSum[p] = s }
    for (let p = 0; p < NP; p++) { let pr = 1; for (let q = 0; q < NP; q++) if (q !== p) pr *= reachSum[q]; prodOthers[p] = pr }
    const active = t.active
    for (let p = 0; p < NP; p++) if (!active.includes(p)) value[p].fill(-t.invested[p] * prodOthers[p])
    if (t.terminal === 'foldout') {
      const w = active[0]
      value[w].fill((pot - t.invested[w]) * prodOthers[w])
      return
    }
    // allin は postflop 無し = 純エクイティ(R=1)。seen-flop は IP/OOP 非対称実現率。
    const allin = t.terminal === 'allin'
    let ip = active[0]
    for (const p of active) if (PF_RANK[p] > PF_RANK[ip]) ip = p
    const rOf = (p: number): number => (allin ? 1 : p === ip ? R_IP : R_OOP)
    if (active.length === 2) {
      const a = active[0], b = active[1]
      const ra = rOf(a), rb = rOf(b)
      const hu = allin ? null : huEV[t.id]
      if (hu) {
        huHeroValue(reach[b], reachSum[b], hu.v[0], hu.support[0], pot, ra, t.invested[a], prodOthers[a], value[a])
        huHeroValue(reach[a], reachSum[a], hu.v[1], hu.support[1], pot, rb, t.invested[b], prodOthers[b], value[b])
        return
      }
      matvec(reach[b], reachSum[b], uScratch[0]) // a が b レンジに勝つ率
      matvec(reach[a], reachSum[a], uScratch[1]) // b が a レンジに勝つ率
      for (let c = 0; c < NCAT; c++) {
        const mc = allin ? 1 : classMult[c]
        value[a][c] = (uScratch[0][c] * pot * ra * mc - t.invested[a]) * prodOthers[a]
        value[b][c] = (uScratch[1][c] * pot * rb * mc - t.invested[b]) * prodOthers[b]
      }
      return
    }
    // multiway(k≥3): 粗い proxy。strength_p(c)=Π_{q≠p}(c が q レンジに勝つ率)。**最弱リンク**。
    const u: Float64Array[] = active.map((q, i) => { matvec(reach[q], reachSum[q], uScratch[i]); return uScratch[i] })
    for (let c = 0; c < NCAT; c++) {
      let prod = 1
      for (let i = 0; i < active.length; i++) prod *= u[i][c]
      for (let i = 0; i < active.length; i++) {
        const p = active[i]
        const ui = u[i][c]
        const strength = ui > 1e-9 ? prod / ui : 0
        value[p][c] = (strength * pot * rOf(p) * (allin ? 1 : classMult[c]) - t.invested[p]) * prodOthers[p]
      }
    }
  }

  // 1 イテレーションの再帰トラバース。reach[p][c] = prior×戦略積。value を返す。
  let iterWeight = 1
  const traverse = (nodeId: number, reach: Float64Array[]): Float64Array[] => {
    const node = nodes[nodeId]
    const value: Float64Array[] = Array.from({ length: NP }, () => new Float64Array(NCAT))
    if (node.kind === 'terminal') {
      evalTerminal(node, reach, value)
      return value
    }
    const q = node.player
    const nA = node.actions.length
    const reg = regretSum[nodeId]!
    const strat = stratScratch[nodeId]!
    regretMatching(reg, nA, strat)

    // 平均戦略を acting player の reach で加重。
    const ss = stratSum[nodeId]!
    for (let c = 0; c < NCAT; c++) {
      const w = reach[q][c] * (linear ? iterWeight : 1)
      if (w === 0) continue
      const base = c * nA
      for (let a = 0; a < nA; a++) ss[base + a] += w * strat[base + a]
    }

    // 各アクションへ。childReach は acting player の reach に戦略を掛ける。
    const childVals: Float64Array[][] = []
    for (let a = 0; a < nA; a++) {
      const childReach: Float64Array[] = reach.map((r, p) => (p === q ? new Float64Array(NCAT) : r))
      const cr = childReach[q]
      for (let c = 0; c < NCAT; c++) cr[c] = reach[q][c] * strat[c * nA + a]
      childVals.push(traverse(node.children[a], childReach))
    }

    // node 価値: acting q は戦略加重 / 他は単純和(戦略は reach に内包済)。
    for (let p = 0; p < NP; p++) {
      const vp = value[p]
      if (p === q) {
        for (let c = 0; c < NCAT; c++) {
          let s = 0
          const base = c * nA
          for (let a = 0; a < nA; a++) s += strat[base + a] * childVals[a][p][c]
          vp[c] = s
        }
      } else {
        for (let c = 0; c < NCAT; c++) {
          let s = 0
          for (let a = 0; a < nA; a++) s += childVals[a][p][c]
          vp[c] = s
        }
      }
    }

    // regret 更新(CFR+: 0 床)。reach 重みは cfv に prodOthers として内包済 → 追加加重不要。
    const vq = value[q]
    for (let c = 0; c < NCAT; c++) {
      const base = c * nA
      const nodev = vq[c]
      for (let a = 0; a < nA; a++) {
        const nr = reg[base + a] + (childVals[a][q][c] - nodev)
        reg[base + a] = nr > 0 ? nr : 0
      }
    }
    return value
  }

  for (let it = 1; it <= opts.iters; it++) {
    iterWeight = linear ? it : 1
    const reach: Float64Array[] = Array.from({ length: NP }, () => Float64Array.from(PRIOR))
    traverse(tree.root, reach)
  }

  // 平均戦略を確定。
  const avgStrategy: (Float64Array | null)[] = nodes.map((n, id) => {
    if (n.kind !== 'decision') return null
    const nA = n.actions.length
    const ss = stratSum[id]!
    const avg = new Float64Array(NCAT * nA)
    for (let c = 0; c < NCAT; c++) {
      let sum = 0
      const base = c * nA
      for (let a = 0; a < nA; a++) sum += ss[base + a]
      if (sum > 0) for (let a = 0; a < nA; a++) avg[base + a] = ss[base + a] / sum
      else for (let a = 0; a < nA; a++) avg[base + a] = 1 / nA
    }
    return avg
  })

  // RFI ノード(全員 fold で回ってきた最初の決定)を fold 線で辿る。
  const rfiNodeBySeat = new Array<number>(NP).fill(-1)
  const openPctBySeat = new Array<number>(NP).fill(NaN)
  let cur = tree.root
  for (;;) {
    const node = nodes[cur]
    if (node.kind !== 'decision' || node.raiseLevel !== 0) break
    const seat = node.player
    rfiNodeBySeat[seat] = cur
    const nA = node.actions.length
    const raiseIdx = node.actions.indexOf(RAISE)
    const avg = avgStrategy[cur]!
    let open = 0
    for (let c = 0; c < NCAT; c++) open += PRIOR[c] * avg[c * nA + raiseIdx]
    openPctBySeat[seat] = +(open * 100).toFixed(1)
    // fold 子へ(次席の RFI)。
    const foldIdx = node.actions.indexOf(FOLD)
    cur = node.children[foldIdx]
  }

  return { tree, avgStrategy, openPctBySeat, rfiNodeBySeat, iters: opts.iters }
}

export { CATEGORIES, COMBO_COUNT, AVAIL, NCAT, PRIOR, classMult }
