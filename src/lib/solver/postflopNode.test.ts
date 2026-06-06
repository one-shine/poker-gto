import { describe, it, expect } from 'vitest'
import { heroPhase, heroNodeTarget, findHeroNode, comboActionsAt } from './postflopNode'
import type { SolvedNodeSummary } from './riverSolver'

describe('heroPhase', () => {
  it('maps facing/facingRaise flags to a phase (facingRaise takes precedence)', () => {
    expect(heroPhase(false, false)).toBe('lead')
    expect(heroPhase(true, false)).toBe('facing')
    expect(heroPhase(false, true)).toBe('facingRaise')
    expect(heroPhase(true, true)).toBe('facingRaise')
  })
})

describe('heroNodeTarget', () => {
  it('targets the OOP hero decision nodes (player 0)', () => {
    expect(heroNodeTarget(true, 'lead')).toEqual({ path: [], player: 0 })
    expect(heroNodeTarget(true, 'facing')).toEqual({ path: [0, 1], player: 0 })
    expect(heroNodeTarget(true, 'facingRaise')).toEqual({ path: [1, 2], player: 0 })
  })
  it('targets the IP hero decision nodes (player 1)', () => {
    expect(heroNodeTarget(false, 'lead')).toEqual({ path: [0], player: 1 })
    expect(heroNodeTarget(false, 'facing')).toEqual({ path: [1], player: 1 })
    expect(heroNodeTarget(false, 'facingRaise')).toEqual({ path: [0, 1, 2], player: 1 })
  })
})

function node(path: number[], player: 0 | 1, actions: SolvedNodeSummary['actions'], strategy: number[][], ev: number[][]): SolvedNodeSummary {
  return { path, player, toCall: 0, actions, strategy, ev }
}

describe('findHeroNode', () => {
  const nodes: SolvedNodeSummary[] = [
    node([], 0, [{ action: 'check' }, { action: 'bet', sizeBB: 3 }], [[0.5, 0.5]], [[1, 2]]),
    node([0], 1, [{ action: 'check' }, { action: 'bet', sizeBB: 3 }], [[0.6, 0.4]], [[1, 2]]),
    node([1], 1, [{ action: 'fold' }, { action: 'call' }], [[0.3, 0.7]], [[0, 1]]),
  ]
  it('finds the matching node by path and player', () => {
    expect(findHeroNode(nodes, true, 'lead')?.path).toEqual([])
    expect(findHeroNode(nodes, false, 'lead')?.path).toEqual([0])
    expect(findHeroNode(nodes, false, 'facing')?.path).toEqual([1])
  })
  it('returns null when no node matches', () => {
    expect(findHeroNode(nodes, true, 'facing')).toBeNull() // [0,1] node absent
  })
})

describe('comboActionsAt', () => {
  it('normalizes bet → raise and pulls the combo row of strategy/ev', () => {
    const n = node([], 0,
      [{ action: 'check' }, { action: 'bet', sizeBB: 3.6 }],
      [[0.2, 0.8], [0.9, 0.1]],
      [[4.0, 5.0], [4.9, 4.1]])
    expect(comboActionsAt(n, 0)).toEqual([
      { action: 'check', sizeBB: undefined, frequency: 0.2, ev: 4.0 },
      { action: 'raise', sizeBB: 3.6, frequency: 0.8, ev: 5.0 },
    ])
    expect(comboActionsAt(n, 1)[0].frequency).toBe(0.9)
  })
})
