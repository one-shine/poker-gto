import type { GameState, Position } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

const OPEN_SCENARIO: Partial<Record<Position, string>> = {
  UTG: 'utg-open', MP: 'mp-open', CO: 'co-open', BTN: 'btn-open', SB: 'sb-open',
}

function categories(scenarioId: string, pick: (raise: number, call: number) => boolean): string[] {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  if (!sc) return []
  return Object.entries(sc.cells).filter(([, c]) => pick(c.raise, c.call)).map(([h]) => h)
}

// 相手1人の想定レンジ(ハンドカテゴリ)を、ポジションと hero の位置から推定。
//  - 相手がオープナー(非BB) → そのポジションの open レンジ
//  - 相手が BB(ディフェンダー) → bb-vs-{hero} の continue (call+raise) レンジ
//  - 該当シナリオなし → null(エクイティ非表示)
function villainCategories(villainPos: Position, heroPos: Position): string[] | null {
  if (villainPos !== 'BB') {
    const id = OPEN_SCENARIO[villainPos]
    if (!id) return null
    const cats = categories(id, r => r > 0)
    return cats.length > 0 ? cats : null
  }
  const id = `bb-vs-${heroPos.toLowerCase()}`
  const cats = categories(id, (r, c) => r > 0 || c > 0)
  return cats.length > 0 ? cats : null
}

// エクイティ計算用に、アクティブな相手(降りていない非hero)の想定レンジ配列を返す。
// HU(相手1人)のみ対応。マルチウェイ/レンジ不明は null(表示しない)。
export function resolveOpponentRanges(state: GameState, heroId: string): string[][] | null {
  const hero = state.players.find(p => p.id === heroId)
  if (!hero) return null
  const villains = state.players.filter(p => p.id !== heroId && !p.isFolded)
  if (villains.length !== 1) return null
  const cats = villainCategories(villains[0].position, hero.position)
  return cats ? [cats] : null
}
