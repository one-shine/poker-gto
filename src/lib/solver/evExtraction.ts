import type { Card } from '../../types/game'
import { handCategory } from '../../engine/cards/handCategory'
import { CATEGORIES } from './pushFold'
import type { Combo } from './riverSolver'
import {
  PRECISION, conflicts, comboHasCard, strictEquity5, cardKey,
  type Node, type DecisionNode, type TerminalNode, type ChanceSolution,
} from './chanceCfr'

// ── flop/turn サブゲーム解からのカテゴリ別 EV 抽出(Phase B)──────────────────────
// プリフロップ概算EVのヒューリスティック (equity−0.5)×30BB を「実際に解いたフロップ
// サブゲームの平均戦略下 EV」で置換するための抽出層。再求解はせず、解の木を歩くだけ。
//
// 【chanceCfr の値規約の読み解き(Phase B 全体の精度の根)】
// chanceCfr.terminalValueFlat の終端式:
//   fold:     net = (folder===up) ? −(half + myCommit) : +(half + oppCommit)
//   showdown: net = e·K − L,  K = 2·half + myCommit + oppCommit,  L = half + myCommit
// half はその街入口ポットの半分(buildBettingLayer の foldHalf = 直前街までのポット/2)、
// committed は「その街内」の投入額のみ(チャンス入口で [0,0] にリセットされ、
// makeTurnChance / makeRiverChance が committed[0]===committed[1] を assert)。
// よって街 s の終端では half_s = potBB/2 + (サブゲーム内で前街までに自分が入れた額) となり、
// 自分のサブゲーム内総投入 I・最終ポット総額 P_final に対して内部値は
//   V_solver = e·P_final − (potBB/2 + I)
// すなわち「ルート街入口ポット potBB の半分を自分の持ち分とみなす pot/2 基準・街内 committed 込み」。
// 本ワークフローの共通契約(サブゲーム開始基準・開始時ポットは死に金・過去拠出は沈没費用)
//   V_contract = e·P_final − I    (ベットゼロなら V = eq×pot)
// へは、fold/showdown どちらの終端でも一様に
//   V_contract = V_solver + potBB/2
// で正規化できる(テスト①②で実証)。終端ごとのゼロサム K − L_oop − L_ip = 0 から
//   vOop[i][j] + vIp[j][i] = potBB
// がベット額に依らない恒等式になる(追加投入は勝者の取り分と敗者の損失で相殺。テスト②)。
//
// 【チャンス重みの規約差】chanceCfr 本体は「常に物理 runout 総数 N で割る」(衝突 runout の
// 寄与 0)規約で、深い終端ほど ~(N−4)/N 倍に縮む測度になっている(EV 報告時は massAvg 除算で
// 近似補正)。本モジュールは per-pair で各チャンスノードを「両者の手と整合する物理 runout 数
// count(i,j) = Nphys − a_i − b_j」で正規化し、固定戦略プロファイルの真の条件付き期待値を返す。

type Side = 'oop' | 'ip'

function rootPot(root: Node): number {
  // どの経路でも最初の非 decision ノードで確定する: ルート街の fold 終端なら half×2 = potBB、
  // chance なら potAfter − committed 合計 = potBB。
  let n: Node = root
  while (n.kind === 'decision') n = n.actions[0].child
  return n.kind === 'chance' ? n.potAfter - n.committedAtChance[0] - n.committedAtChance[1] : n.half * 2
}

export function rootPotBB(solution: ChanceSolution): number {
  return rootPot(solution.root)
}

// chanceCfr.avgMatrix と同一規約(stratSum 正規化・全ゼロ combo は uniform)の flat 版。
function avgStrategyFlat(node: DecisionNode, n: number): Float64Array {
  const A = node.actions.length
  const s = node.stratSum
  if (s.length !== n * A) {
    throw new Error(`evExtraction: コンボ配列と解のレンジ次元が不一致 (stratSum=${s.length}, expected=${n * A})`)
  }
  const out = new Float64Array(n * A)
  for (let c = 0; c < n; c++) {
    const base = c * A
    let tot = 0
    for (let a = 0; a < A; a++) tot += s[base + a]
    if (tot > PRECISION) {
      for (let a = 0; a < A; a++) out[base + a] = s[base + a] / tot
    } else {
      out.fill(1 / A, base, base + A)
    }
  }
  return out
}

export interface RootValueMatrices {
  vOop: number[][] // [oopIdx][ipIdx] 契約フレーム(BB)。衝突ペアは NaN
  vIp: number[][]  // [ipIdx][oopIdx] 同上
}

// 平均戦略プロファイル下の per-(hero combo × villain combo) 値行列。
// oopCombos / ipCombos は solve 入力と同一の配列・順序であること(次元不一致は throw)。
export function rootValueMatrix(
  solution: ChanceSolution, oopCombos: Combo[], ipCombos: Combo[],
): RootValueMatrices {
  const nO = oopCombos.length
  const nI = ipCombos.length
  const size = nO * nI
  const pools: Float64Array[] = []
  const pool = (d: number): Float64Array => pools[d] ?? (pools[d] = new Float64Array(size))

  function fillTerminal(node: TerminalNode, up: 0 | 1, eq: number[][] | null, out: Float64Array): void {
    const myCommit = node.committed[up]
    const oppCommit = node.committed[(1 - up) as 0 | 1]
    if (node.kind === 'fold') {
      out.fill(node.folder === up ? -(node.half + myCommit) : node.half + oppCommit)
      return
    }
    if (!eq) throw new Error('evExtraction: showdown 終端に eq が無い(ツリー不整合)')
    const K = 2 * node.half + myCommit + oppCommit
    const L = node.half + myCommit
    if (up === 0) {
      for (let i = 0; i < nO; i++) {
        const row = eq[i]
        const off = i * nI
        for (let j = 0; j < nI; j++) out[off + j] = K * row[j] - L
      }
    } else {
      // IP 視点: e' = 1−e → e'·K − L = (K−L) − K·e
      const KL = K - L
      for (let i = 0; i < nO; i++) {
        const row = eq[i]
        const off = i * nI
        for (let j = 0; j < nI; j++) out[off + j] = KL - K * row[j]
      }
    }
  }

  // 行列は up に依らず常に [oopIdx*nI + ipIdx] 配置(終端の net だけが視点で変わる)。
  function pairValues(node: Node, up: 0 | 1, eq: number[][] | null, depth: number, out: Float64Array): void {
    if (node.kind === 'chance') {
      const first = node.runouts[0]
      if (first.removedOOP.length !== nO || first.removedIP.length !== nI) {
        throw new Error('evExtraction: コンボ配列と解の除去マスク次元が不一致')
      }
      // 片側衝突数 a_i / b_j(1 runout は1枚なので両側同時衝突は無い)→ count(i,j) = Nphys − a_i − b_j
      const aO = new Float64Array(nO)
      const bI = new Float64Array(nI)
      let nPhys = 0
      for (const ro of node.runouts) {
        const ms = ro.members ?? [ro]
        for (const m of ms) {
          nPhys++
          const mo = m.removedOOP
          const mi = m.removedIP
          for (let i = 0; i < nO; i++) { if (mo[i]) aO[i]++ }
          for (let j = 0; j < nI; j++) { if (mi[j]) bI[j]++ }
        }
      }
      out.fill(0)
      const child = pool(depth)
      for (const ro of node.runouts) {
        pairValues(ro.subtree, up, ro.eq, depth + 1, child)
        if (!ro.members) {
          const mo = ro.removedOOP
          const mi = ro.removedIP
          for (let i = 0; i < nO; i++) {
            if (mo[i]) continue
            const off = i * nI
            for (let j = 0; j < nI; j++) { if (!mi[j]) out[off + j] += child[off + j] }
          }
        } else {
          // suitIso member: per-pair の置換像 V_member[i][j] = V_repr[permOOP[i]][permIP[j]]
          for (const m of ro.members) {
            const mo = m.removedOOP
            const mi = m.removedIP
            const pO = m.permOOP
            const pI = m.permIP
            for (let i = 0; i < nO; i++) {
              if (mo[i]) continue
              const off = i * nI
              const src = pO[i] * nI
              for (let j = 0; j < nI; j++) { if (!mi[j]) out[off + j] += child[src + pI[j]] }
            }
          }
        }
      }
      // 真の条件付き期待値へ正規化(chanceCfr の /N 規約とは異なる。冒頭コメント参照)
      for (let i = 0; i < nO; i++) {
        const off = i * nI
        const ai = aO[i]
        for (let j = 0; j < nI; j++) {
          const cnt = nPhys - ai - bI[j]
          out[off + j] = cnt > 0 ? out[off + j] / cnt : 0
        }
      }
      return
    }
    if (node.kind !== 'decision') {
      fillTerminal(node, up, eq, out)
      return
    }
    const acting = node.player
    const n = acting === 0 ? nO : nI
    const avg = avgStrategyFlat(node, n)
    const A = node.actions.length
    out.fill(0)
    const child = pool(depth)
    for (let a = 0; a < A; a++) {
      pairValues(node.actions[a].child, up, eq, depth + 1, child)
      if (acting === 0) {
        for (let i = 0; i < nO; i++) {
          const w = avg[i * A + a]
          if (w === 0) continue
          const off = i * nI
          for (let j = 0; j < nI; j++) out[off + j] += w * child[off + j]
        }
      } else {
        for (let i = 0; i < nO; i++) {
          const off = i * nI
          for (let j = 0; j < nI; j++) {
            const w = avg[j * A + a]
            if (w !== 0) out[off + j] += w * child[off + j]
          }
        }
      }
    }
  }

  const half0 = rootPot(solution.root) / 2
  const m0 = new Float64Array(size)
  const m1 = new Float64Array(size)
  pairValues(solution.root, 0, null, 0, m0)
  pairValues(solution.root, 1, null, 0, m1)

  const vOop: number[][] = Array.from({ length: nO }, () => new Array<number>(nI))
  const vIp: number[][] = Array.from({ length: nI }, () => new Array<number>(nO))
  for (let i = 0; i < nO; i++) {
    for (let j = 0; j < nI; j++) {
      const dead = conflicts(oopCombos[i], ipCombos[j])
      vOop[i][j] = dead ? NaN : m0[i * nI + j] + half0
      vIp[j][i] = dead ? NaN : m1[i * nI + j] + half0
    }
  }
  return { vOop, vIp }
}

// per-combo 行列を 169×169 カテゴリ行列へ集約する。
// perComboMatrix は rootValueMatrix の vOop(side='oop')/ vIp(side='ip')と同じ
// [heroIdx][villainIdx] 向き。重みは w_hero × w_villain、NaN(衝突ペア)は母数からも除外
// (= AVAIL と同じ「非衝突コンボペアのみを数える」規約)。データの無いセルは NaN。
export function aggregateToCategories(
  combos: { oop: Combo[]; ip: Combo[] },
  perComboMatrix: number[][],
  side: Side,
): number[][] {
  const hero = side === 'oop' ? combos.oop : combos.ip
  const villain = side === 'oop' ? combos.ip : combos.oop
  const NC = CATEGORIES.length
  const catIndex = new Map(CATEGORIES.map((c, i) => [c, i] as const))
  const catOf = (c: Combo): number => {
    const k = catIndex.get(handCategory([c.cards[0], c.cards[1]]))
    if (k == null) throw new Error('evExtraction: 不明なハンドカテゴリ')
    return k
  }
  if (perComboMatrix.length !== hero.length) {
    throw new Error('evExtraction: perComboMatrix の行数が hero コンボ数と不一致')
  }
  const heroCat = hero.map(catOf)
  const villCat = villain.map(catOf)
  const num = new Float64Array(NC * NC)
  const den = new Float64Array(NC * NC)
  for (let i = 0; i < hero.length; i++) {
    const wi = hero[i].weight
    if (wi <= 0) continue
    const row = perComboMatrix[i]
    if (row.length !== villain.length) {
      throw new Error('evExtraction: perComboMatrix の列数が villain コンボ数と不一致')
    }
    const base = heroCat[i] * NC
    for (let j = 0; j < villain.length; j++) {
      const v = row[j]
      if (!Number.isFinite(v)) continue
      const w = wi * villain[j].weight
      if (w <= 0) continue
      const k = base + villCat[j]
      num[k] += w * v
      den[k] += w
    }
  }
  const out: number[][] = Array.from({ length: NC }, () => new Array<number>(NC).fill(NaN))
  for (let ci = 0; ci < NC; ci++) {
    for (let cj = 0; cj < NC; cj++) {
      const k = ci * NC + cj
      if (den[k] > 0) out[ci][cj] = num[k] / den[k]
    }
  }
  return out
}

function hasIsoMembers(node: Node): boolean {
  if (node.kind === 'chance') {
    return node.runouts.some(ro => (ro.members != null && ro.members.length > 0) || hasIsoMembers(ro.subtree))
  }
  if (node.kind === 'decision') return node.actions.some(a => hasIsoMembers(a.child))
  return false
}

export interface ProbeOpts {
  board: Card[]          // 解いたサブゲームのルート街ボード(flop=3枚 / turn=4枚)
  villainCombos: Combo[] // 解の相手側レンジ(solve 入力と同一の配列・順序)
}

// 解いた相手平均戦略を固定し、レンジ外コンボの対戦値を1パス評価する。
// レンジ外ハンドは解の中に自分の方策を持たないため、固定された相手方策に対する
// ベストレスポンス値(楽観値・均衡値の上界)を返す: プリフロップ側 fictitious play が
// off-equilibrium ハンドを探索するとき、FP の BR 計算と整合する正しい量が BR 値だから。
// チャンスを per-pair 条件付き正規化しているため mass(x) は行動・深さに依らず一定で、
// 相手 reach 加重和の max がそのまま条件付き EV の max になる(深さバイアス無し)。
// 戻り値は共通契約フレーム(BB)。盤面と衝突する extra は NaN。
export function probeEVs(
  solution: ChanceSolution, side: Side, extraCombos: Combo[], opts: ProbeOpts,
): number[] {
  const up: 0 | 1 = side === 'oop' ? 0 : 1
  const X = extraCombos
  const V = opts.villainCombos
  const nX = X.length
  const nV = V.length
  if (hasIsoMembers(solution.root)) {
    // member の置換写像はレンジ内 combo index 限定で、任意の extra カードへ適用する
    // スート置換そのものは解に保存されていない(復元不能)ため対応しない。
    throw new Error('probeEVs: suitIso 縮約解は未対応。suitIso:false で解いた解を渡すこと')
  }
  const size = nX * nV
  const wPools: Float64Array[] = []
  const gPools: Float64Array[] = []
  const wPool = (d: number): Float64Array => wPools[d] ?? (wPools[d] = new Float64Array(size))
  const gPool = (d: number): Float64Array => gPools[d] ?? (gPools[d] = new Float64Array(nX))

  // showdown 用 eq(extra×villain)を5枚ボードごとに dedup(flopSolver の eq dedup と同型)
  const boardStack: Card[] = [...opts.board]
  const eqCache = new Map<string, number[][]>()
  const eqXFor = (): number[][] => {
    if (boardStack.length !== 5) {
      throw new Error('probeEVs: board とツリーのチャンス層数が不整合(flop=3枚 / turn=4枚 を渡す)')
    }
    const key = boardStack.map(cardKey).join('')
    let m = eqCache.get(key)
    if (!m) {
      m = strictEquity5(X, V, boardStack)
      eqCache.set(key, m)
    }
    return m
  }

  function walk(node: Node, W: Float64Array, eqX: number[][] | null, depth: number, out: Float64Array): void {
    if (node.kind === 'chance') {
      const N = node.physN ?? node.runouts.length
      const aX = new Float64Array(nX)
      const bV = new Float64Array(nV)
      for (const ro of node.runouts) {
        for (let x = 0; x < nX; x++) { if (comboHasCard(X[x], ro.card)) aX[x]++ }
        const mv = up === 0 ? ro.removedIP : ro.removedOOP
        for (let j = 0; j < nV; j++) { if (mv[j]) bV[j]++ }
      }
      out.fill(0)
      const childW = wPool(depth)
      const childG = gPool(depth)
      for (const ro of node.runouts) {
        const mv = up === 0 ? ro.removedIP : ro.removedOOP
        for (let x = 0; x < nX; x++) {
          const off = x * nV
          if (comboHasCard(X[x], ro.card)) {
            childW.fill(0, off, off + nV)
            continue
          }
          const ax = aX[x]
          for (let j = 0; j < nV; j++) {
            if (mv[j]) { childW[off + j] = 0; continue }
            const cnt = N - ax - bV[j]
            childW[off + j] = cnt > 0 ? W[off + j] / cnt : 0
          }
        }
        boardStack.push(ro.card)
        const eqChild = ro.eq ? eqXFor() : null
        walk(ro.subtree, childW, eqChild, depth + 1, childG)
        boardStack.pop()
        for (let x = 0; x < nX; x++) out[x] += childG[x]
      }
      return
    }
    if (node.kind !== 'decision') {
      const myCommit = node.committed[up]
      const oppCommit = node.committed[(1 - up) as 0 | 1]
      if (node.kind === 'fold') {
        const net = node.folder === up ? -(node.half + myCommit) : node.half + oppCommit
        for (let x = 0; x < nX; x++) {
          const off = x * nV
          let mass = 0
          for (let j = 0; j < nV; j++) mass += W[off + j]
          out[x] = net * mass
        }
        return
      }
      if (!eqX) throw new Error('probeEVs: showdown 終端に eq が無い(ツリー不整合)')
      const K = 2 * node.half + myCommit + oppCommit
      const L = node.half + myCommit
      for (let x = 0; x < nX; x++) {
        const off = x * nV
        const row = eqX[x]
        let dot = 0
        let mass = 0
        for (let j = 0; j < nV; j++) {
          const w = W[off + j]
          if (w === 0) continue
          dot += w * row[j]
          mass += w
        }
        out[x] = K * dot - L * mass
      }
      return
    }
    const A = node.actions.length
    if (node.player === up) {
      const childG = gPool(depth)
      for (let a = 0; a < A; a++) {
        walk(node.actions[a].child, W, eqX, depth + 1, childG)
        if (a === 0) out.set(childG)
        else for (let x = 0; x < nX; x++) { if (childG[x] > out[x]) out[x] = childG[x] }
      }
      return
    }
    const avg = avgStrategyFlat(node, nV)
    out.fill(0)
    const childW = wPool(depth)
    const childG = gPool(depth)
    for (let a = 0; a < A; a++) {
      for (let x = 0; x < nX; x++) {
        const off = x * nV
        for (let j = 0; j < nV; j++) childW[off + j] = W[off + j] * avg[j * A + a]
      }
      walk(node.actions[a].child, childW, eqX, depth + 1, childG)
      for (let x = 0; x < nX; x++) out[x] += childG[x]
    }
  }

  const W0 = new Float64Array(size)
  for (let x = 0; x < nX; x++) {
    if (opts.board.some(b => comboHasCard(X[x], b))) continue
    const off = x * nV
    for (let j = 0; j < nV; j++) {
      if (!conflicts(X[x], V[j])) W0[off + j] = V[j].weight
    }
  }
  const g = new Float64Array(nX)
  walk(solution.root, W0, null, 0, g)

  const half0 = rootPot(solution.root) / 2
  const out = new Array<number>(nX)
  for (let x = 0; x < nX; x++) {
    const off = x * nV
    let mass = 0
    for (let j = 0; j < nV; j++) mass += W0[off + j]
    out[x] = mass > PRECISION ? g[x] / mass + half0 : NaN
  }
  return out
}
