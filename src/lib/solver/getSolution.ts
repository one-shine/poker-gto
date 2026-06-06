import type { ActionSolution, NodeSolution, SpotKey } from '../../types/solver'
import type { Card } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { fromRangeScenario } from './fromRangeScenario'
import { deriveRiverRanges, comboKey } from './riverRanges'
import { solveRiverAsync } from './solverClient'
import { getCachedSolution, putCachedSolution } from './solveCache'
import type { Combo } from './riverSolver'
import { capRange, narrowByRiverStrength } from './rangeNarrowing'

// 取込済みの実ソルバー解 (solver_precomputed)。src/data/solutions/preflop/{spotId}.json
// (scripts/solve-pushfold.ts / import-ranges.ts が出力) を優先採用 (無ければ近似)。
// ⚠ eager だと push/fold 等の全 JSON が gameStore チャンクに同梱され肥大化する。
// ファイル名 = spotId なので、要求された spotId に一致するファイルのみ遅延 import する。
const precomputedLoaders = import.meta.glob<{ default: NodeSolution }>(
  '../../data/solutions/preflop/*.json',
)
async function loadPrecomputed(spotId: string): Promise<NodeSolution | null> {
  const load = precomputedLoaders[`../../data/solutions/preflop/${spotId}.json`]
  if (!load) return null
  const mod = await load()
  return mod.default ?? null
}

// R4-B: opener spot のヒューリスティック EV 付き解。
// scripts/precompute-preflop-ev.ts で生成 (source='approximate_with_ev')。
// precomputed が無く、これがあれば approximate より優先 (戦略は手作りと同じ、EV だけ追加)。
const heuristicEvLoaders = import.meta.glob<{ default: NodeSolution }>(
  '../../data/solutions/preflop-ev/*.json',
)
async function loadHeuristicEV(spotId: string): Promise<NodeSolution | null> {
  const load = heuristicEvLoaders[`../../data/solutions/preflop-ev/${spotId}.json`]
  if (!load) return null
  const mod = await load()
  return mod.default ?? null
}

// 手作り近似 (approximate)。precomputed が見つかればそちらを優先する。
const approximatePreflop = new Map<string, NodeSolution>(
  PREFLOP_SCENARIOS.map(s => [s.id, fromRangeScenario(s)]),
)

export interface GetSolutionOptions {
  // study mode のみ true。未カバースポットを自前ソルバーで都度求解してよい。
  allowLiveSolve?: boolean
}

function boardKey(board: Card[]): string {
  return board.map(c => `${c.rank}${c.suit[0]}`).join('')
}

// 解の統一供給窓口。Coach / gto_ai / 可視化はこれだけを呼ぶ。
export async function getSolution(
  spot: SpotKey,
  opts: GetSolutionOptions = {},
): Promise<NodeSolution | null> {
  if (spot.street === 'preflop') {
    // 優先順位: 実解 (solver_precomputed) > ヒューリスティック EV 付き (approximate_with_ev) > 手作り近似 (approximate)。
    const base = (await loadPrecomputed(spot.baseSpotId))
      ?? (await loadHeuristicEV(spot.baseSpotId))
      ?? approximatePreflop.get(spot.baseSpotId)
      ?? null
    if (!base) return null
    // 設計ルール4: マルチウェイは同じ HU レンジを「参考値」として返す (共有インスタンスは mutate せずコピー)。
    return spot.multiway ? { ...base, multiwayReference: true } : base
  }
  // ポストフロップ: flop/turn/river を自前 CFR で都度求解 (turn/flop は showdown をエクイティ近似)。
  if (
    (spot.street === 'flop' || spot.street === 'turn' || spot.street === 'river') &&
    spot.board && spot.board.length >= 3 && spot.heroCards && spot.potBB != null
  ) {
    return solveRiverSpot(spot, opts)
  }
  return null
}

async function solveRiverSpot(spot: SpotKey, opts: GetSolutionOptions): Promise<NodeSolution | null> {
  const board = spot.board!
  const heroCards = spot.heroCards!
  const ranges = deriveRiverRanges(spot.baseSpotId, board, heroCards)
  if (!ranges) return null

  const potBB = spot.potBB!
  const effStackBB = spot.effStackBB ?? 100
  // 被ベット節は別ノード → ベット比を含めてキャッシュキーを分ける。
  // facingRaise のとき riverBetBB は hero 自身のリードベット額 = betFrac の基準。
  const betFrac = spot.riverBetBB && spot.riverBetBB > 0 ? +(spot.riverBetBB / potBB).toFixed(2) : 0.66
  const facingRaise = !!spot.facingRaise
  const facing = !facingRaise && !!spot.riverBetBB && spot.riverBetBB > 0
  const phase = facingRaise ? `r${betFrac}` : facing ? `f${betFrac}` : 'lead'
  // R14②: turn は完全チャンスノード CFR (river ベッティングを織り込む) で求解。flop/river は従来通り。
  const chanceCFR = spot.street === 'turn'
  const cacheId = `${spot.baseSpotId}|${boardKey(board)}|${comboKey(heroCards)}|${potBB}|${effStackBB}|${phase}${chanceCFR ? '|cc' : ''}`
  const cached = await getCachedSolution(cacheId)
  if (cached) return cached

  // live solve はやや重い → study (allowLiveSolve) のみ。それ以外はスキップ。
  if (!opts.allowLiveSolve) return null

  const heroK = comboKey(heroCards)
  const heroIsOOP = ranges.heroIsOOP
  // R15-B: river のみ、board 強度に基づき下位 20% を narrow (peel しない手の近似)。
  const narrow = (combos: Combo[], must?: string) =>
    spot.street === 'river' ? narrowByRiverStrength(combos, board, must) : combos
  // chance-CFR は O(combos²×runout) で重い (全48 runout)。コンボ上限を 50 に圧縮し budget 内に。
  // (flop/river は既定 200)。runout は完全列挙を優先し、コンボ/反復で時間を調整する方針。
  const cap = chanceCFR ? 50 : undefined
  const heroSide = heroIsOOP ? capRange(narrow(ranges.oop, heroK), heroK, cap) : capRange(narrow(ranges.ip, heroK), heroK, cap)
  const oop = heroIsOOP ? heroSide : capRange(narrow(ranges.oop), undefined, cap)
  const ip = heroIsOOP ? capRange(narrow(ranges.ip), undefined, cap) : heroSide
  // R16: 単一レイズを許可 → 被ベットノードに raise(OOP=チェックレイズ / IP=レイズ)が加わる。
  // raiseSizes はコール後ポット比の追加額 (0.5 ≈ 元ベットの ~2.7x へのレイズ)。
  const { nodes, exploitability } = await solveRiverAsync({
    board, oop, ip, potBB, stackBB: effStackBB,
    betSizes: [betFrac], raiseSizes: [0.5],
    // turn chance-CFR は全48 runout を列挙(サンプリングのランク/スート偏りを回避)。runout が 4x に
    // なる分、反復を 40・コンボ 50 に抑えて budget(5-15s)内に。exploitability は十分収束(<10%)。
    iterations: chanceCFR ? 40 : 250,
    useChanceCFR: chanceCFR,
  })
  // hero 判断ノードを OOP/IP × lead/被ベット/被レイズ で特定 (root actions = [check, bet])。
  //  OOP lead      = root []              (player 0)
  //  OOP 被ベット   = check→IP bet [0,1]    (player 0 が facing)
  //  OOP 被レイズ   = bet→IP raise [1,2]    (player 0 が自ベットをレイズされた)
  //  IP  チェック後  = OOP check [0]         (player 1)
  //  IP  被ベット    = OOP bet  [1]          (player 1 が facing)
  //  IP  被レイズ    = check→IP bet→OOP XR [0,1,2] (player 1 がチェックレイズに直面)
  const targetPath = facingRaise
    ? (heroIsOOP ? [1, 2] : [0, 1, 2])
    : heroIsOOP ? (facing ? [0, 1] : []) : (facing ? [1] : [0])
  const expectedPlayer = heroIsOOP ? 0 : 1
  const target = nodes.find(n =>
    n.path.length === targetPath.length && n.path.every((v, i) => v === targetPath[i]) && n.player === expectedPlayer,
  )
  if (!target) return null

  const heroIdx = heroSide.findIndex(c => comboKey(c.cards) === heroK)
  if (heroIdx < 0) return null

  // PlayerAction は 'bet' を持たない (エンジンはベットも 'raise')。'bet'→'raise' に正規化。
  const heroActions: ActionSolution[] = target.actions.map((a, ai) => ({
    action: a.action === 'bet' ? 'raise' : a.action,
    sizeBB: a.sizeBB,
    frequency: target.strategy[heroIdx]?.[ai] ?? 0,
    ev: target.ev[heroIdx]?.[ai] ?? 0,
  }))

  const node: NodeSolution = {
    street: spot.street,
    spotId: `${spot.baseSpotId}-${spot.street}-${boardKey(board)}${facingRaise ? '-vsraise' : facing ? '-vsbet' : ''}`,
    board,
    strategy: { [heroK]: heroActions },
    potBB,
    source: 'solver_live',
    exploitability,
    bettingAware: chanceCFR,
    runoutN: chanceCFR ? 48 : undefined,
    meta: {
      sourceName: chanceCFR ? 'self CFR (turn, chance-node 全48 runout)' : `self CFR (${spot.street})`,
      license: 'self-generated', version: '1', solvedAt: Date.now(),
    },
  }
  await putCachedSolution(cacheId, node)
  return node
}
