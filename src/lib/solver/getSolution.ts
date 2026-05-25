import type { ActionSolution, NodeSolution, SpotKey } from '../../types/solver'
import type { Card } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { fromRangeScenario } from './fromRangeScenario'
import { deriveRiverRanges, comboKey } from './riverRanges'
import { solveRiverAsync } from './solverClient'
import { getCachedSolution, putCachedSolution } from './solveCache'
import type { Combo } from './riverSolver'

// ライブ求解を高速に保つためレンジを上限コンボ数に絞る (solver_live = 簡易アブストラクション)。
// 重み降順で上位を残す。must は必ず保持 (hero の手札)。
const MAX_COMBOS = 100
function capRange(combos: Combo[], mustKey?: string): Combo[] {
  if (combos.length <= MAX_COMBOS) return combos
  const sorted = [...combos].sort((a, b) => b.weight - a.weight)
  const kept = sorted.slice(0, MAX_COMBOS)
  if (mustKey && !kept.some(c => comboKey(c.cards) === mustKey)) {
    const must = combos.find(c => comboKey(c.cards) === mustKey)
    if (must) kept[kept.length - 1] = must
  }
  return kept
}

// 取込済みの実ソルバー解 (solver_precomputed)。scripts/import-ranges.ts が
// src/data/solutions/preflop/*.json に出力したものを優先採用 (無ければ近似)。
// 現状データ未取込 (要ライセンス) → glob は空 → 全て approximate にフォールバック。
const precomputedModules = import.meta.glob<{ default: NodeSolution }>(
  '../../data/solutions/preflop/*.json',
  { eager: true },
)
const precomputedPreflop = new Map<string, NodeSolution>()
for (const mod of Object.values(precomputedModules)) {
  if (mod.default?.spotId) precomputedPreflop.set(mod.default.spotId, mod.default)
}

// プリフロップ解の窓口。precomputed があれば優先、無ければ手作り近似 (approximate)。
const preflopSolutions = new Map<string, NodeSolution>(
  PREFLOP_SCENARIOS.map(s => [s.id, precomputedPreflop.get(s.id) ?? fromRangeScenario(s)]),
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
    // シナリオ由来 (precomputed優先 / 無ければ近似) → さらに scenario 外の precomputed (push/fold等)。
    return preflopSolutions.get(spot.baseSpotId) ?? precomputedPreflop.get(spot.baseSpotId) ?? null
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
  // 被ベット節は別ノード → ベット比を含めてキャッシュキーを分ける
  const betFrac = spot.riverBetBB && spot.riverBetBB > 0 ? +(spot.riverBetBB / potBB).toFixed(2) : 0.66
  const facing = !!spot.riverBetBB && spot.riverBetBB > 0
  const cacheId = `${spot.baseSpotId}|${boardKey(board)}|${comboKey(heroCards)}|${potBB}|${effStackBB}|${facing ? `f${betFrac}` : 'lead'}`
  const cached = await getCachedSolution(cacheId)
  if (cached) return cached

  // live solve はやや重い → study (allowLiveSolve) のみ。それ以外はスキップ。
  if (!opts.allowLiveSolve) return null

  const heroK = comboKey(heroCards)
  const heroIsOOP = ranges.heroIsOOP
  const heroSide = heroIsOOP ? capRange(ranges.oop, heroK) : capRange(ranges.ip, heroK)
  const oop = heroIsOOP ? heroSide : capRange(ranges.oop)
  const ip = heroIsOOP ? capRange(ranges.ip) : heroSide
  const { nodes, exploitability } = await solveRiverAsync({
    board, oop, ip, potBB, stackBB: effStackBB,
    betSizes: [betFrac], iterations: 250,
  })
  // hero 判断ノードを OOP/IP × lead/被ベット で特定 (root actions = [check, bet])。
  //  OOP lead     = root []           (player 0)
  //  OOP 被ベット  = check→IP bet [0,1] (player 0 が facing)
  //  IP  チェック後 = OOP check [0]     (player 1)
  //  IP  被ベット   = OOP bet  [1]      (player 1 が facing)
  const targetPath = heroIsOOP ? (facing ? [0, 1] : []) : (facing ? [1] : [0])
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
    spotId: `${spot.baseSpotId}-${spot.street}-${boardKey(board)}${facing ? '-vsbet' : ''}`,
    board,
    strategy: { [heroK]: heroActions },
    potBB,
    source: 'solver_live',
    exploitability,
    meta: { sourceName: `self CFR (${spot.street})`, license: 'self-generated', version: '1', solvedAt: Date.now() },
  }
  await putCachedSolution(cacheId, node)
  return node
}
