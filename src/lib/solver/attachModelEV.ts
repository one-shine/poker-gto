import type { ActionSolution, NodeSolution } from '../../types/solver'
import type { RangeScenario } from '../../types/ranges'
import { CATEGORIES } from './pushFold'
import { RANKS } from '../../engine/cards/Card'
import type { Rank } from '../../types/game'
import {
  computeHeuristicEV, computeDefenderHeuristicEV, computeOpenerFacing3betEV,
  type HeuristicEVOptions, type DefenderEVOptions, type OpenerFacing3betOptions,
} from './attachHeuristicEV'

// ── Phase B: (equity−0.5)×F ヒューリスティックを解いたフロップサブゲーム EV で置換 ──
//
// V 行列の値規約 (flop-ev-matrix@1, evExtraction.ts の契約フレーム):
//   V[heroCat][villainCat] = フロップ配布直後 (ポット形成済み) を基準とした hero の
//   純チップ期待収支 (BB)。「以後のベット往復の純増減 + 最終的なポット取り分」であり、
//   開始時ポットへの過去の自分の拠出は含まない (沈没費用)。
//   ベットゼロで即ショーダウンなら V = eq × potBB。恒等式 vOop[i][j] + vIp[j][i] = potBB。
//
// 規約の橋渡し (本モジュールの核心):
//   heuristic の (eq−0.5)×F は「villain がコールしてフロップに進んだ枝の hero 純EV」を、
//   その枝に至るプリフロップ追加投入まで織り込んだ1つの値として近似していた
//   (heuristicPreflopEV.ts「postflop net + 既投入合算」)。モデル側 V はフロップ開始基準で
//   プリフロップ投入を含まないため、置換式は
//     (eq[ci][cj] − 0.5) × F  →  E_w[V[ci]] − cPre
//     E_w[V[ci]] = Σ_cj AVAIL[ci][cj]·w_villain[cj]·V[ci][cj] / Σ_cj AVAIL·w
//   cPre = その枝に至るための hero のプリフロップ追加投入。各関数の fold/dead-money 項と
//   同一の基準フレームになるよう選ぶ (action 間の相対 EV = evLoss の意味が置換前後で不変):
//     opener called 枝          cPre = raiseSize − heroBlindPosted  (fold=0 の決定時点フレーム)
//     defender call 枝          cPre = openBB                       (fold=−blind フレーム: blind込み総投入)
//     defender 3bet→call 枝     cPre = threeBetBB                   (同上)
//     opener facing-3bet call 枝 cPre = threeBetBB − openerBlind    (fold=−(open−blind) フレーム)
//   ベットゼロのモデル (V=eq×pot) を与えると E[V]−cPre = eq·P_flop − cPre となり、真の
//   ポットオッズ式 (例: BB defend 損益分岐 eq=(openBB−blind)/P_flop≈27%) に一致する。
//   旧式は eq=50% を損益分岐とみなす粗い近似だったので、定数差ではなく式の置換になる。
//
// 4bet ポットは v1 ではモデル外 → 4bet 被弾/4bet 実行の枝は既存ヒューリスティック係数
// (F4 / cont / FT4 / COST3) をそのまま温存する。モデル未被覆 (model 未指定、または hero の
// scenario id が oopId/ipId のどちらにも一致しない) は attachHeuristicEV へ全面フォール
// バックし、meta.sourceName で「heuristic fallback」と区別する (source 種別は両者とも
// 'approximate_with_ev'。手作り戦略 + 数値 EV という供給形態は同じため)。

const NCAT = CATEGORIES.length
const RANK_TO_I = new Map(RANKS.map((r, i) => [r, i]))

function expandCombos(cat: string): [number, number][] {
  const r1 = RANK_TO_I.get(cat[0] as Rank)!
  const r2 = RANK_TO_I.get(cat[1] as Rank)!
  const out: [number, number][] = []
  if (cat.length === 2) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([r1 * 4 + a, r1 * 4 + b])
  } else if (cat[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([r1 * 4 + s, r2 * 4 + s])
  } else {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) out.push([r1 * 4 + a, r2 * 4 + b])
  }
  return out
}

const COMBOS_BY_CAT: [number, number][][] = CATEGORIES.map(expandCombos)
const CAT_INDEX = new Map(CATEGORIES.map((c, i) => [c, i]))

// pushFold.ts と同一の blocker 期待値 (1コンボあたり相手カテゴリに残るコンボ平均数)。
const AVAIL: Float64Array[] = (() => {
  const mat = CATEGORIES.map(() => new Float64Array(NCAT))
  for (let ci = 0; ci < NCAT; ci++) {
    const aCombos = COMBOS_BY_CAT[ci]
    for (let cj = 0; cj < NCAT; cj++) {
      const bCombos = COMBOS_BY_CAT[cj]
      let total = 0
      for (const a of aCombos) for (const b of bCombos) {
        if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) total++
      }
      mat[ci][cj] = total / aCombos.length
    }
  }
  return mat
})()

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// ── モデル入力型 (flop-ev-matrix@1 JSON スキーマ) ────────────────────────────────

export type PotType = 'srp' | '3bet' | '4bet' | 'limped'

export interface FlopSampleEntry {
  board: string      // 例 "AhKd7s"
  weight: number     // 層化サンプル重み (合計1。v は加重平均で合成済み)
  exploitPct: number // 各盤の到達 exploitability (pot 比 %)
}

// 1 ファイル = 1 ポット構成 (例 SRP BTN vs BB) のカテゴリ別フロップサブゲーム EV。
// vOop/vIp とも [heroCat][villainCat] (CATEGORIES 順・契約フレーム BB)。
// JSON は NaN を持てないため、データ無し (衝突のみ等) のセルは null。
export interface PostflopEvModel {
  schema: 'flop-ev-matrix@1'
  potKey: string                 // 例 'srp-btn-bb' ({potType}-{ipPos}-{oopPos} 規約を推奨)
  potType: PotType
  potBB: number                  // フロップ入口ポット (V=eq×pot / vOop+vIp^T=potBB の基準)
  effStackBB: number
  oopId: string                  // OOP レンジ元 RangeScenario id (例 'bb-vs-btn')
  ipId: string                   // IP レンジ元 RangeScenario id (例 'btn-open')
  vOop: (number | null)[][]
  vIp: (number | null)[][]
  flopSample: FlopSampleEntry[]
  // カテゴリ別 villain 到達カテゴリ比率 0..1 (≈ 相手レンジ幅)。hero 信頼性ではない。
  coverage: { oop: number[]; ip: number[] }
  // support[ci] = そのカテゴリが非 null 行を持ったボードの重み比率 0..1 (hero 信頼性)。
  // cap で多くのボードから落ちる尾手は support が小さく値が 1〜2 ボードのノイズになる。
  // support < MIN_SUPPORT のカテゴリは modelCallTerm が null を返し heuristic に落とす。
  // 旧スキーマ(未付与)では undefined → ゲートせず従来動作 (後方互換)。
  support?: { oop: number[]; ip: number[] }
  meta: { sourceName: string; license: string; version: string; solvedAt?: number }
}

// 値が 1〜2 ボードのノイズになる尾手を除外する support 閾値。core 手は ~1.0、
// cap で落ちる尾手は ≤0.13 と明確に分離するため 0.5 で切る。
const MIN_SUPPORT = 0.5

const POT_TYPES: readonly string[] = ['srp', '3bet', '4bet', 'limped']

function assertMatrix(m: unknown, name: string): void {
  if (!Array.isArray(m) || m.length !== NCAT) throw new Error(`flop-ev-matrix: ${name} は ${NCAT}x${NCAT} 必須`)
  for (const row of m) {
    if (!Array.isArray(row) || row.length !== NCAT) throw new Error(`flop-ev-matrix: ${name} の行長が ${NCAT} でない`)
  }
}

// JSON (unknown) を検証して PostflopEvModel として返す。CATEGORIES 順は規約 (次元のみ検査可能)。
export function parsePostflopEvModel(json: unknown): PostflopEvModel {
  const m = json as Record<string, unknown> | null
  if (!m || typeof m !== 'object') throw new Error('flop-ev-matrix: オブジェクトでない')
  if (m.schema !== 'flop-ev-matrix@1') throw new Error(`flop-ev-matrix: 未知の schema ${String(m.schema)}`)
  if (typeof m.potKey !== 'string' || !m.potKey) throw new Error('flop-ev-matrix: potKey 必須')
  if (!POT_TYPES.includes(m.potType as string)) throw new Error(`flop-ev-matrix: 不正な potType ${String(m.potType)}`)
  if (typeof m.potBB !== 'number' || !(m.potBB > 0)) throw new Error('flop-ev-matrix: potBB は正の数')
  if (typeof m.oopId !== 'string' || typeof m.ipId !== 'string') throw new Error('flop-ev-matrix: oopId/ipId 必須')
  assertMatrix(m.vOop, 'vOop')
  assertMatrix(m.vIp, 'vIp')
  return m as unknown as PostflopEvModel
}

// hero の scenario id がモデルのどちら側かを解決して [heroCat][villainCat] 行列を返す。
// ポジション名で IP/OOP を推定しない (SB open や CO-vs-BTN-3bet で逆転するため id で照合)。
export function heroValueMatrix(model: PostflopEvModel, heroScenarioId: string): (number | null)[][] | null {
  if (model.oopId === heroScenarioId) return model.vOop
  if (model.ipId === heroScenarioId) return model.vIp
  return null
}

// heroValueMatrix と同じ側の support ベクトルを返す。support 未付与なら null (=ゲートなし)。
export function heroSupportVector(model: PostflopEvModel, heroScenarioId: string): number[] | null {
  if (!model.support) return null
  if (model.oopId === heroScenarioId) return model.support.oop
  if (model.ipId === heroScenarioId) return model.support.ip
  return null
}

// E_w[V[ci]] − cPre。w = AVAIL × villainWeight。null セルは分子分母とも除外
// (aggregateToCategories の非衝突ペア規約と同じ)。質量ゼロは null → 呼び元が旧式に落とす。
// support[ci] < MIN_SUPPORT (尾手 = 値が 1〜2 ボードのノイズ) も null を返し heuristic に落とす。
function modelCallTerm(
  v: (number | null)[][],
  ci: number,
  villainWeight: Float64Array,
  cPre: number,
  support: number[] | null = null,
): number | null {
  if (support && support[ci] < MIN_SUPPORT) return null
  const av = AVAIL[ci]
  const row = v[ci]
  let num = 0, den = 0
  for (let cj = 0; cj < NCAT; cj++) {
    const w = av[cj] * villainWeight[cj]
    if (w <= 0) continue
    const val = row[cj]
    if (val == null || Number.isNaN(val)) continue
    num += w * val
    den += w
  }
  return den > 0 ? num / den - cPre : null
}

// テスト② (フォールバック一致) のため戦略/EV は heuristic 経路そのまま、meta だけ区別する。
function withFallbackMeta(node: NodeSolution, heroId: string): NodeSolution {
  return {
    ...node,
    meta: {
      ...node.meta,
      sourceName: `${node.meta.sourceName} [postflop EV model 未被覆 (${heroId}) → heuristic fallback]`,
    },
  }
}

// ── opener spot (X-open) ─────────────────────────────────────────────────────────

export interface OpenerModelEVOptions extends HeuristicEVOptions {
  heroBlindPosted?: number // SB open のみ 0.5 (cPre = raiseSize − heroBlindPosted)。既定 0
}

// computeHeuristicEV の並行実装。call された枝の (eq−0.5)×F だけを E_w[V]−cPre に置換し、
// BB fold 枝 (+sb+bb)・fold=0 基準・戦略頻度 (手作り) は同一に保つ。
export function computeModelEV(
  hero: RangeScenario,
  eq: number[][],
  callerCallFreq: Float64Array,
  model: PostflopEvModel | undefined,
  opts: OpenerModelEVOptions = {},
): NodeSolution {
  const vHero = model ? heroValueMatrix(model, hero.id) : null
  const sHero = model ? heroSupportVector(model, hero.id) : null
  if (!model || !vHero) return withFallbackMeta(computeHeuristicEV(hero, eq, callerCallFreq, opts), hero.id)

  const sb = opts.sbBlind ?? 0.5
  const bb = opts.bbBlind ?? 1.0
  const F = opts.postflopFactor ?? 30
  const cPre = hero.raiseSize - (opts.heroBlindPosted ?? 0)

  const evRaiseAll = new Float64Array(NCAT)
  for (let ci = 0; ci < NCAT; ci++) {
    const av = AVAIL[ci]
    const mCall = modelCallTerm(vHero, ci, callerCallFreq, cPre, sHero)
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj]
      if (a <= 0) continue
      const q = callerCallFreq[cj]
      const evFold = sb + bb
      // heuristic: not GTO-exact (モデル質量ゼロのカテゴリのみ旧式 (eq−0.5)×F で代替)
      const evCall = mCall ?? (eq[ci][cj] - 0.5) * F
      num += a * ((1 - q) * evFold + q * evCall)
      den += a
    }
    evRaiseAll[ci] = den > 0 ? num / den : sb + bb
  }

  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(hero.cells)) {
    const ci = CAT_INDEX.get(hand)
    if (ci == null) continue
    const acts: ActionSolution[] = []
    if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: hero.raiseSize, frequency: cell.raise, ev: +evRaiseAll[ci].toFixed(3) })
    if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: 0 })
    if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: 0 })
    strategy[hand] = acts
  }
  return {
    street: 'preflop',
    spotId: hero.id,
    strategy,
    potBB: 1.5,
    source: 'approximate_with_ev',
    meta: {
      sourceName: `hand-built strategy + solved-flop model EV (flop-ev-matrix@1 potKey=${model.potKey}, cPre=${cPre})`,
      license: 'original',
      version: '2',
    },
  }
}

// ── defender spot (Y-vs-X: hero=3better が open に直面) ──────────────────────────

export interface DefenderModels {
  srp?: PostflopEvModel      // call 枝 (SRP フロップサブゲーム)
  threeBet?: PostflopEvModel // 3bet→opener call 枝 (3bet ポットサブゲーム)
}

// computeDefenderHeuristicEV の並行実装。call 枝の (eq−0.5)×F → E_w[V_srp]−openBB、
// 3bet→opener call 枝の (eq−0.5)×F3 → E_w[V_3bet]−threeBetBB に置換。
// 4bet 被弾枝 (g4) と fold-equity 項 (DEAD) は同一 (4bet は v1 モデル外)。
export function computeDefenderModelEV(
  defender: RangeScenario,
  openerRaiseFreq: Float64Array,
  eq: number[][],
  models: DefenderModels = {},
  opts: DefenderEVOptions = {},
): NodeSolution {
  const vSrp = models.srp ? heroValueMatrix(models.srp, defender.id) : null
  const sSrp = models.srp ? heroSupportVector(models.srp, defender.id) : null
  const vTb = models.threeBet ? heroValueMatrix(models.threeBet, defender.id) : null
  const sTb = models.threeBet ? heroSupportVector(models.threeBet, defender.id) : null
  if (!vSrp && !vTb) return withFallbackMeta(computeDefenderHeuristicEV(defender, openerRaiseFreq, eq, opts), defender.id)

  const bb = opts.bbBlind ?? 1.0
  const F = opts.postflopFactor ?? 30
  const o = opts.openBB ?? 2.5 // defender call の cPre (blind 込み総投入 = openBB に一致)

  const evCallAll = new Float64Array(NCAT)
  for (let ci = 0; ci < NCAT; ci++) {
    const mCall = vSrp ? modelCallTerm(vSrp, ci, openerRaiseFreq, o, sSrp) : null
    if (mCall != null) { evCallAll[ci] = mCall; continue }
    // heuristic: not GTO-exact (srp モデル未被覆カテゴリは旧式。式順も旧実装と同一に保つ)
    const av = AVAIL[ci]
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj], w = openerRaiseFreq[cj]
      if (a <= 0 || w <= 0) continue
      num += a * w * (eq[ci][cj] - 0.5) * F
      den += a * w
    }
    evCallAll[ci] = den > 0 ? num / den : 0
  }

  const ev3All = new Float64Array(NCAT)
  const hasThreeBet = !!(opts.openerResponse && opts.openerOpenFreq)
  let tbModelUsed = false
  if (opts.openerResponse && opts.openerOpenFreq) {
    const { oFold, oCall, o4bet } = opts.openerResponse
    const w = opts.openerOpenFreq
    const oBB = opts.openBB ?? 2.5
    const t = opts.threeBetBB ?? 11
    const heroBlind = opts.heroBlindPosted ?? 0
    const F3 = opts.threeBetFactor ?? 45
    const F4 = opts.fourBetFactor ?? 60
    const DEAD = oBB + (1.5 - heroBlind)
    const COST3 = t - heroBlind
    // 3bet→call 枝の villain 測度 = オープン頻度 × 3bet へのコール頻度
    const wCall = new Float64Array(NCAT)
    for (let cj = 0; cj < NCAT; cj++) wCall[cj] = w[cj] * oCall[cj]
    for (let ci = 0; ci < NCAT; ci++) {
      const av = AVAIL[ci]
      let n4 = 0, d4 = 0
      for (let cj = 0; cj < NCAT; cj++) {
        const a = av[cj], wo = o4bet[cj]
        if (a <= 0 || wo <= 0) continue
        n4 += a * wo * eq[ci][cj]; d4 += a * wo
      }
      // heuristic: not GTO-exact (4bet 被弾の続行度 cont は v1 モデル外で旧式のまま)
      const cont = d4 > 0 ? clamp((n4 / d4 - 0.36) / 0.16, 0, 1) : 0
      const mTb = vTb ? modelCallTerm(vTb, ci, wCall, t, sTb) : null
      if (mTb != null) tbModelUsed = true
      let num = 0, den = 0
      for (let cj = 0; cj < NCAT; cj++) {
        const ww = av[cj] * w[cj]
        if (ww <= 0) continue
        const edge = eq[ci][cj] - 0.5
        const g4 = cont * edge * F4 - (1 - cont) * COST3
        // 未被覆カテゴリの旧式枝は浮動小数の演算順まで旧実装と揃える (フォールバック同値性)
        num += mTb != null
          ? ww * (oFold[cj] * DEAD + oCall[cj] * mTb + o4bet[cj] * g4)
          : ww * (oFold[cj] * DEAD + oCall[cj] * edge * F3 + o4bet[cj] * g4)
        den += ww
      }
      ev3All[ci] = den > 0 ? num / den : 0
    }
  }

  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(defender.cells)) {
    const ci = CAT_INDEX.get(hand)
    if (ci == null) continue
    const acts: ActionSolution[] = []
    if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: defender.raiseSize, frequency: cell.raise, ev: hasThreeBet ? +ev3All[ci].toFixed(3) : 0 })
    if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: +evCallAll[ci].toFixed(3) })
    if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: -bb })
    strategy[hand] = acts
  }
  const branches = [
    vSrp ? `call=model(${models.srp!.potKey})` : 'call=heuristic',
    ...(hasThreeBet ? [vTb && tbModelUsed ? `3bet-call=model(${models.threeBet!.potKey})` : '3bet-call=heuristic'] : []),
    '4bet枝=heuristic(v1モデル外)',
  ]
  return {
    street: 'preflop',
    spotId: defender.id,
    strategy,
    potBB: 1.5,
    source: 'approximate_with_ev',
    meta: {
      sourceName: `hand-built defender strategy + solved-flop model EV [${branches.join(', ')}]`,
      license: 'original',
      version: '2',
    },
  }
}

// ── facing-3bet spot (hero=opener が 3bet に直面) ────────────────────────────────

export interface Facing3betModels {
  threeBet?: PostflopEvModel // call 枝 (3bet ポットサブゲーム)
}

// computeOpenerFacing3betEV の並行実装。call 枝の avgEdge×F3 → E_w[V_3bet]−(t−openerBlind)
// に置換。4bet 実行枝 (FT4·DEAD4 + 継続時 F4) は同一 (4bet は v1 モデル外)。
export function computeOpenerFacing3betModelEV(
  facing: RangeScenario,
  villain3betFreq: Float64Array,
  eq: number[][],
  models: Facing3betModels = {},
  opts: OpenerFacing3betOptions = {},
): NodeSolution {
  const vTb = models.threeBet ? heroValueMatrix(models.threeBet, facing.id) : null
  const sTb = models.threeBet ? heroSupportVector(models.threeBet, facing.id) : null
  if (!vTb) return withFallbackMeta(computeOpenerFacing3betEV(facing, villain3betFreq, eq, opts), facing.id)

  const o = opts.openBB ?? 2.5
  const t = opts.threeBetBB ?? 11
  const f = opts.fourBetBB ?? 24
  const openerBlind = opts.openerBlind ?? 0
  const tbBlind = opts.threeBetterBlind ?? 0
  const F3 = opts.threeBetFactor ?? 45
  const F4 = opts.fourBetFactor ?? 60
  const FT4 = opts.foldToFourBet ?? 0.55
  const DEAD4 = t + (1.5 - tbBlind)
  const foldEV = -(o - openerBlind)
  const cPre = t - openerBlind

  const evCallAll = new Float64Array(NCAT)
  const ev4betAll = new Float64Array(NCAT)
  for (let ci = 0; ci < NCAT; ci++) {
    const av = AVAIL[ci]
    let num = 0, den = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const a = av[cj], w = villain3betFreq[cj]
      if (a <= 0 || w <= 0) continue
      num += a * w * (eq[ci][cj] - 0.5); den += a * w
    }
    const avgEdge = den > 0 ? num / den : 0
    const mCall = modelCallTerm(vTb, ci, villain3betFreq, cPre, sTb)
    // heuristic: not GTO-exact (call はモデル未被覆カテゴリのみ・4bet 枝は v1 モデル外で常に旧式)
    evCallAll[ci] = mCall ?? avgEdge * F3
    ev4betAll[ci] = FT4 * DEAD4 + (1 - FT4) * avgEdge * F4
  }

  const strategy: Record<string, ActionSolution[]> = {}
  for (const [hand, cell] of Object.entries(facing.cells)) {
    const ci = CAT_INDEX.get(hand)
    if (ci == null) continue
    const acts: ActionSolution[] = []
    if (cell.raise > 0) acts.push({ action: 'raise', sizeBB: f, frequency: cell.raise, ev: +ev4betAll[ci].toFixed(3) })
    if (cell.call > 0) acts.push({ action: 'call', frequency: cell.call, ev: +evCallAll[ci].toFixed(3) })
    if (cell.fold > 0) acts.push({ action: 'fold', frequency: cell.fold, ev: +foldEV.toFixed(3) })
    strategy[hand] = acts
  }
  return {
    street: 'preflop',
    spotId: facing.id,
    strategy,
    potBB: +(o + t + (1.5 - tbBlind)).toFixed(2),
    source: 'approximate_with_ev',
    meta: {
      sourceName: `hand-built opener strategy + solved-flop model call EV (potKey=${models.threeBet!.potKey}, cPre=${cPre}) + heuristic 4bet (F4=${F4}, FT4=${FT4})`,
      license: 'original',
      version: '2',
    },
  }
}
