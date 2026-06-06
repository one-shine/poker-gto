import type { ActionSolution } from '../../types/solver'
import type { SolvedNodeSummary } from './riverSolver'

// hero が判断するノードの種別。lead=先頭(check/bet) / facing=被ベット(fold/call/raise) /
// facingRaise=自分の(チェック)ベットがレイズされた深いノード(fold/call)。
export type HeroPhase = 'lead' | 'facing' | 'facingRaise'

export function heroPhase(facing: boolean, facingRaise: boolean): HeroPhase {
  return facingRaise ? 'facingRaise' : facing ? 'facing' : 'lead'
}

// hero 判断ノードの探索パスと acting player を OOP/IP × phase で特定する。
// root actions = [check, bet]。リバー/ターン共通(ツリー形が同じ)。
//   OOP lead      = root []              (player 0)
//   OOP 被ベット   = check→IP bet [0,1]    (player 0 が facing)
//   OOP 被レイズ   = bet→IP raise [1,2]    (player 0 が自ベットをレイズされた)
//   IP  チェック後  = OOP check [0]         (player 1)
//   IP  被ベット    = OOP bet  [1]          (player 1 が facing)
//   IP  被レイズ    = check→IP bet→OOP XR [0,1,2] (player 1 がチェックレイズに直面)
export function heroNodeTarget(heroIsOOP: boolean, phase: HeroPhase): { path: number[]; player: 0 | 1 } {
  const path = phase === 'facingRaise'
    ? (heroIsOOP ? [1, 2] : [0, 1, 2])
    : heroIsOOP ? (phase === 'facing' ? [0, 1] : []) : (phase === 'facing' ? [1] : [0])
  return { path, player: heroIsOOP ? 0 : 1 }
}

// 求解済みノード群から hero の判断ノードを取り出す。無ければ null。
export function findHeroNode(
  nodes: SolvedNodeSummary[], heroIsOOP: boolean, phase: HeroPhase,
): SolvedNodeSummary | null {
  const { path, player } = heroNodeTarget(heroIsOOP, phase)
  return nodes.find(n =>
    n.path.length === path.length && n.path.every((v, i) => v === path[i]) && n.player === player,
  ) ?? null
}

// ノードの 1 コンボ行 → ActionSolution[]。エンジンは 'bet' を持たないので 'raise' に正規化。
export function comboActionsAt(node: SolvedNodeSummary, comboIdx: number): ActionSolution[] {
  return node.actions.map((a, ai) => ({
    action: a.action === 'bet' ? 'raise' : a.action,
    sizeBB: a.sizeBB,
    frequency: node.strategy[comboIdx]?.[ai] ?? 0,
    ev: node.ev[comboIdx]?.[ai] ?? 0,
  }))
}
