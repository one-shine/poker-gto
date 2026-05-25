import { describe, it, expect } from 'vitest'
import { computeEquity } from './monteCarlo'
import type { Card } from '../../types/game'

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit })

describe('computeEquity (Monte Carlo)', () => {
  it('AA dominates KK preflop (~80-85%)', () => {
    const r = computeEquity({
      holeCards: [c('A', 'spades'), c('A', 'diamonds')],
      board: [],
      opponentRanges: [['KK']],
      iterations: 4000,
    })
    expect(r.samples).toBeGreaterThan(3000)
    expect(r.equity).toBeGreaterThan(0.78)
    expect(r.equity).toBeLessThan(0.88)
  })

  it('AA vs AA is roughly a coin flip (split pots)', () => {
    const r = computeEquity({
      holeCards: [c('A', 'spades'), c('A', 'diamonds')],
      board: [],
      opponentRanges: [['AA']],
      iterations: 3000,
    })
    expect(r.equity).toBeGreaterThan(0.42)
    expect(r.equity).toBeLessThan(0.58)
  })

  it('made nuts on the river wins ~100%', () => {
    // hero has the nut flush; opponent range cannot beat it
    const r = computeEquity({
      holeCards: [c('A', 'hearts'), c('K', 'hearts')],
      board: [c('Q', 'hearts'), c('J', 'hearts'), c('2', 'hearts'), c('7', 'spades'), c('3', 'clubs')],
      opponentRanges: [['QQ', 'JJ', '77']], // sets, no flush
      iterations: 1500,
    })
    expect(r.equity).toBeGreaterThan(0.99)
  })

  it('returns 0 samples when a range is empty', () => {
    const r = computeEquity({
      holeCards: [c('A', 'spades'), c('K', 'spades')],
      board: [],
      opponentRanges: [[]],
      iterations: 100,
    })
    expect(r.samples).toBe(0)
    expect(r.equity).toBe(0)
  })
})
