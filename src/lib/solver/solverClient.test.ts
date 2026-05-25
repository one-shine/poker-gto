import { describe, it, expect } from 'vitest'
import { solveRiverAsync } from './solverClient'
import type { Combo } from './riverSolver'
import type { Card, Rank, Suit } from '../../types/game'

const c = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })
const combo = (a: Card, b: Card): Combo => ({ cards: [a, b], weight: 1 })
const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]

describe('solverClient.solveRiverAsync (inline fallback in tests)', () => {
  it('returns serializable node summaries including the root', async () => {
    const { nodes, exploitability } = await solveRiverAsync({
      board,
      oop: [combo(c('A', 'hearts'), c('A', 'clubs')), combo(c('Q', 'hearts'), c('J', 'hearts'))],
      ip: [combo(c('9', 'diamonds'), c('9', 'clubs'))],
      potBB: 10, stackBB: 100, betSizes: [0.75], iterations: 300,
    })
    expect(Array.isArray(nodes)).toBe(true)
    expect(typeof exploitability).toBe('number')
    const root = nodes.find(n => n.path.length === 0)
    expect(root).toBeDefined()
    expect(root!.player).toBe(0) // OOP 先行
    // 各ノードは strategy/ev 行列を持ち、JSON シリアライズ可能
    expect(() => JSON.stringify(nodes)).not.toThrow()
    expect(root!.strategy.length).toBe(2) // OOP の combo 数
    expect(root!.strategy[0].length).toBe(root!.actions.length)
  })
})
