import { CATEGORIES, COMBO_COUNT, AVAIL } from './pushFold'
import { heroValueMatrix, heroSupportVector, type PostflopEvModel } from './attachModelEV'

// ── プリフロップ「モデル内Nash」求解 (Phase C / R4) ──────────────────────────────
// 1 ポジション対 (opener vs defender) を 2 人チェーンゲーム化し fictitious play で解く。
//   opener:   open / fold        → facing-3bet: fold / call / 4bet
//   defender: fold / call / 3bet → facing-4bet: fold / call(allin)
// 終端EV(hero 視点・ハンド開始0基準・BB):
//   fold        = 厳密 (forfeit 既投入)
//   SRP/3betコール = Phase B の V 行列 (契約フレーム vOop/vIp、cPre=総投入)。support<0.5 や
//                  null セルは「被覆セルから当該サブゲームの vHero≈a+b·eq を最小二乗フィット」して
//                  外挿する (ポストフロップ圧力込みのモデル挙動を尾手にも適用)。フィット不能時のみ
//                  ゼロ実現の pot-odds 近似 eq×potBB−cPre に落とす。
//   allin(4betコール) = 厳密オールイン勝率 (showdown=真値・モデル不要)
// 依存方向: engine ← solver。本モジュールは事前計算専用 (flopSolver と同じ位置づけ)。
//
// 注: 6-max を当該2席の HU に縮約するモデル。不参加席のブラインド (dead money D0) は
// 厳密に算入するが、ポストフロップは Phase B の代表ボード EV モデルに依存する近似。
// よって push/fold の厳密 Nash とは格が違い source は 'solver_model' (信頼度 model)。

const NCAT = CATEGORIES.length
const MIN_SUPPORT = 0.5

export interface SpotSizing {
  openBB: number       // opener のオープンサイズ (= 総投入)
  threeBetBB: number   // 3bet サイズ (= 3better 総投入)
  blindO: number       // opener の posted blind (SB=0.5 / それ以外 0)
  blindD: number       // defender の posted blind (BB=1.0 / SB=0.5 / それ以外 0)
  deadMoney: number    // 不参加席が出したブラインド合計 (BTN vs BB = 0.5 等)
  stackBB: number      // 開始有効スタック (allin 計算用・既定 100)
  srpPotBB: number     // SRP フロップ入口ポット (= srpModel.potBB)
  tbPotBB: number      // 3bet フロップ入口ポット (= threeBetModel.potBB)
}

export interface SpotModels {
  vSrpO: (number | null)[][] | null  // opener 視点 SRP V (= srpModel.vIp)
  sSrpO: number[] | null
  vSrpD: (number | null)[][] | null  // defender 視点 SRP V (= srpModel.vOop)
  sSrpD: number[] | null
  vTbO: (number | null)[][] | null   // opener 視点 3bet V (= threeBetModel.vIp)
  sTbO: number[] | null
  vTbD: (number | null)[][] | null   // defender(3better) 視点 3bet V (= threeBetModel.vOop)
  sTbD: number[] | null
}

export interface PreflopNashResult {
  openerStrategy:   { open: Float64Array; facing3betCall: Float64Array; fourBet: Float64Array }
  defenderStrategy: { call: Float64Array; threeBet: Float64Array; facing4betCall: Float64Array }
  openerEV:   Float64Array
  defenderEV: Float64Array
  exploitability: number    // 両者の到達加重 BR 改善幅 (BB/hand)。Nash で ≈ 0
  iters: number
}

// 被覆セル (support≥閾値・非null) から vHero ≈ a + b·eq を最小二乗フィット。
// モデルが捉えたエクイティ→価値の関係 (ポストフロップ圧力込み) を尾手へ外挿する代理。
function fitEqValue(
  v: (number | null)[][] | null,
  support: number[] | null,
  eq: number[][],
): { a: number; b: number } | null {
  if (!v) return null
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let ci = 0; ci < NCAT; ci++) {
    if (support && support[ci] < MIN_SUPPORT) continue
    const row = v[ci]
    for (let cj = 0; cj < NCAT; cj++) {
      const y = row[cj]
      if (y == null || !Number.isFinite(y)) continue
      const x = eq[ci][cj]
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y
    }
  }
  const denom = n * sxx - sx * sx
  if (n < 30 || Math.abs(denom) < 1e-9) return null
  const b = (n * sxy - sx * sy) / denom
  const a = (sy - b * sx) / n
  return { a, b }
}

// 1 セルの hero net EV = V[ci][cj]−cPre。被覆セルは実 V、未被覆は フィット a+b·eq、
// フィット不能時のみ ゼロ実現 pot-odds 近似 eq×potBB に落とす。
function cellValue(
  v: (number | null)[][] | null,
  support: number[] | null,
  fit: { a: number; b: number } | null,
  ci: number, cj: number,
  cPre: number, eq: number[][], potBB: number,
): number {
  if (v && (!support || support[ci] >= MIN_SUPPORT)) {
    const val = v[ci][cj]
    if (val != null && Number.isFinite(val)) return val - cPre
  }
  // heuristic: not GTO-exact (被覆セルからの線形外挿 / 不能なら showdown 近似)
  if (fit) return fit.a + fit.b * eq[ci][cj] - cPre
  return eq[ci][cj] * potBB - cPre
}

// eq[i][j] = カテゴリ i が j に対するオールイン勝率 (tie込・eq[i][j]+eq[j][i]=1)。
export function solvePreflopNash(
  eq: number[][],
  s: SpotSizing,
  m: SpotModels,
  iterations = 4000,
): PreflopNashResult {
  const S = s.stackBB
  const D0 = s.deadMoney

  const evOpenerFold = -s.blindO
  const evDefenderFold = -s.blindD
  const evOpenerWinBlinds = D0 + s.blindD
  const evOpenerFoldTo3bet = -s.openBB
  const cPreSrp = s.openBB
  const cPreTb = s.threeBetBB
  const dead4betFold = s.threeBetBB + D0
  const allinPot = 2 * S + D0

  // 各サブゲーム・各視点の eq→V フィット (未被覆セル外挿用)
  const fSrpO = fitEqValue(m.vSrpO, m.sSrpO, eq)
  const fSrpD = fitEqValue(m.vSrpD, m.sSrpD, eq)
  const fTbO = fitEqValue(m.vTbO, m.sTbO, eq)
  const fTbD = fitEqValue(m.vTbD, m.sTbD, eq)

  const open      = new Float64Array(NCAT).fill(0.5)
  const o3Call    = new Float64Array(NCAT).fill(0.34)
  const o4bet     = new Float64Array(NCAT).fill(0.33)
  const dCall     = new Float64Array(NCAT).fill(0.34)
  const d3bet     = new Float64Array(NCAT).fill(0.33)
  const d4Call    = new Float64Array(NCAT).fill(0.5)

  const evO4betCell = (ci: number, cj: number): number => {
    const q = d4Call[cj]
    const win = eq[ci][cj] * allinPot - S
    return (1 - q) * dead4betFold + q * win
  }
  const evO3 = (ci: number): { fold: number; call: number; fourbet: number } => {
    let wsum = 0, callNum = 0, fbNum = 0
    for (let cj = 0; cj < NCAT; cj++) {
      const w = AVAIL[ci][cj] * d3bet[cj]
      if (w <= 0) continue
      wsum += w
      callNum += w * cellValue(m.vTbO, m.sTbO, fTbO, ci, cj, cPreTb, eq, s.tbPotBB)
      fbNum += w * evO4betCell(ci, cj)
    }
    if (wsum <= 0) return { fold: evOpenerFoldTo3bet, call: evOpenerFoldTo3bet, fourbet: evOpenerFoldTo3bet }
    return { fold: evOpenerFoldTo3bet, call: callNum / wsum, fourbet: fbNum / wsum }
  }
  const evO3mix = (ci: number): number => {
    const e = evO3(ci)
    return (1 - o3Call[ci] - o4bet[ci]) * e.fold + o3Call[ci] * e.call + o4bet[ci] * e.fourbet
  }
  const evOpen = (ci: number): number => {
    let wsum = 0, num = 0
    const face3 = evO3mix(ci)
    for (let cj = 0; cj < NCAT; cj++) {
      const a = AVAIL[ci][cj]
      if (a <= 0) continue
      wsum += a
      const fold = (1 - dCall[cj] - d3bet[cj])
      const vsrp = cellValue(m.vSrpO, m.sSrpO, fSrpO, ci, cj, cPreSrp, eq, s.srpPotBB)
      num += a * (fold * evOpenerWinBlinds + dCall[cj] * vsrp + d3bet[cj] * face3)
    }
    return wsum > 0 ? num / wsum : evOpenerWinBlinds
  }

  const evD4 = (cj: number): { fold: number; call: number } => {
    let wsum = 0, callNum = 0
    for (let ci = 0; ci < NCAT; ci++) {
      const w = AVAIL[cj][ci] * open[ci] * o4bet[ci]
      if (w <= 0) continue
      wsum += w
      callNum += w * ((1 - eq[ci][cj]) * allinPot - S)
    }
    const fold = -s.threeBetBB
    return { fold, call: wsum > 0 ? callNum / wsum : fold }
  }
  const evD3bet = (cj: number): number => {
    let wsum = 0, num = 0
    const d4 = evD4(cj)
    const d4mix = d4Call[cj] * d4.call + (1 - d4Call[cj]) * d4.fold
    for (let ci = 0; ci < NCAT; ci++) {
      const w = AVAIL[cj][ci] * open[ci]
      if (w <= 0) continue
      wsum += w
      const oFold = 1 - o3Call[ci] - o4bet[ci]
      const winVsFold = s.openBB + D0
      const vtb = cellValue(m.vTbD, m.sTbD, fTbD, cj, ci, cPreTb, eq, s.tbPotBB)
      num += w * (oFold * winVsFold + o3Call[ci] * vtb + o4bet[ci] * d4mix)
    }
    return wsum > 0 ? num / wsum : -s.blindD
  }
  const evDCall = (cj: number): number => {
    let wsum = 0, num = 0
    for (let ci = 0; ci < NCAT; ci++) {
      const w = AVAIL[cj][ci] * open[ci]
      if (w <= 0) continue
      wsum += w
      num += w * cellValue(m.vSrpD, m.sSrpD, fSrpD, cj, ci, cPreSrp, eq, s.srpPotBB)
    }
    return wsum > 0 ? num / wsum : evDefenderFold
  }

  // ── fictitious play (段2→段1→段0 逆順 BR・同時平均更新) ──
  const brOpen = new Float64Array(NCAT)
  const brO3Call = new Float64Array(NCAT)
  const brO4bet = new Float64Array(NCAT)
  const brDCall = new Float64Array(NCAT)
  const brD3bet = new Float64Array(NCAT)
  const brD4Call = new Float64Array(NCAT)

  for (let t = 1; t <= iterations; t++) {
    for (let c = 0; c < NCAT; c++) {
      const e3 = evO3(c)
      if (e3.call >= e3.fold && e3.call >= e3.fourbet) { brO3Call[c] = 1; brO4bet[c] = 0 }
      else if (e3.fourbet >= e3.fold) { brO3Call[c] = 0; brO4bet[c] = 1 }
      else { brO3Call[c] = 0; brO4bet[c] = 0 }
      const e4 = evD4(c)
      brD4Call[c] = e4.call > e4.fold ? 1 : 0
    }
    for (let c = 0; c < NCAT; c++) {
      const eCall = evDCall(c)
      const e3b = evD3bet(c)
      if (eCall >= evDefenderFold && eCall >= e3b) { brDCall[c] = 1; brD3bet[c] = 0 }
      else if (e3b >= evDefenderFold) { brDCall[c] = 0; brD3bet[c] = 1 }
      else { brDCall[c] = 0; brD3bet[c] = 0 }
    }
    for (let c = 0; c < NCAT; c++) brOpen[c] = evOpen(c) > evOpenerFold ? 1 : 0
    const w = 1 / (t + 1)
    for (let c = 0; c < NCAT; c++) {
      open[c]   += (brOpen[c]   - open[c])   * w
      o3Call[c] += (brO3Call[c] - o3Call[c]) * w
      o4bet[c]  += (brO4bet[c]  - o4bet[c])  * w
      dCall[c]  += (brDCall[c]  - dCall[c])  * w
      d3bet[c]  += (brD3bet[c]  - d3bet[c])  * w
      d4Call[c] += (brD4Call[c] - d4Call[c]) * w
    }
  }

  // ── exploitability (到達加重 BR 改善幅・BB/hand) ──
  let impO = 0, impD = 0, wSum = 0
  const openMass = avgReach(open)
  const d3betMass = avgReach(d3bet)
  const o4betMass = avgReach(o4bet)
  for (let c = 0; c < NCAT; c++) {
    const n = COMBO_COUNT[c]
    wSum += n
    const eOpen = evOpen(c)
    impO += n * (Math.max(eOpen, evOpenerFold) - (open[c] * eOpen + (1 - open[c]) * evOpenerFold))
    const e3 = evO3(c)
    const mix3 = (1 - o3Call[c] - o4bet[c]) * e3.fold + o3Call[c] * e3.call + o4bet[c] * e3.fourbet
    impO += n * (Math.max(e3.fold, e3.call, e3.fourbet) - mix3) * d3betMass
    const eCall = evDCall(c), e3b = evD3bet(c)
    const mixD = dCall[c] * eCall + d3bet[c] * e3b + (1 - dCall[c] - d3bet[c]) * evDefenderFold
    impD += n * (Math.max(eCall, e3b, evDefenderFold) - mixD) * openMass
    const e4 = evD4(c)
    const mix4 = d4Call[c] * e4.call + (1 - d4Call[c]) * e4.fold
    impD += n * (Math.max(e4.call, e4.fold) - mix4) * openMass * o4betMass
  }
  const exploitability = +(((impO + impD) / 2 / wSum)).toFixed(5)

  return {
    openerStrategy:   { open, facing3betCall: o3Call, fourBet: o4bet },
    defenderStrategy: { call: dCall, threeBet: d3bet, facing4betCall: d4Call },
    openerEV:   Float64Array.from({ length: NCAT }, (_, c) => +evOpen(c).toFixed(3)),
    defenderEV: Float64Array.from({ length: NCAT }, (_, c) => +Math.max(evDCall(c), evD3bet(c), evDefenderFold).toFixed(3)),
    exploitability,
    iters: iterations,
  }
}

function avgReach(freq: Float64Array): number {
  let num = 0, den = 0
  for (let c = 0; c < NCAT; c++) { num += COMBO_COUNT[c] * freq[c]; den += COMBO_COUNT[c] }
  return den > 0 ? num / den : 0
}

// カテゴリ別頻度のコンボ加重 widthPct (レンジ幅%) — アンカー検証用。
export function rangeWidthPct(freq: Float64Array): number {
  let num = 0, den = 0
  for (let c = 0; c < NCAT; c++) { num += COMBO_COUNT[c] * freq[c]; den += COMBO_COUNT[c] }
  return den > 0 ? +(100 * num / den).toFixed(1) : 0
}

export { CATEGORIES, COMBO_COUNT, type PostflopEvModel, heroValueMatrix, heroSupportVector }
