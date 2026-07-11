import { describe, it, expect } from 'vitest'
import type { MistakeCategory, MistakeRecord } from '../../types/stats'
import {
  aggregateRecentWeaknesses,
  aggregateAllTimeWeaknesses,
  WEAKNESS_WINDOW_DAYS,
  WEAKNESS_WINDOW_MAX,
} from './weaknessWindow'

const DAY = 24 * 60 * 60 * 1000

const mk = (category: MistakeCategory, timestamp: number, evLoss = 1): MistakeRecord => ({
  handId: 'h', street: 'preflop', position: 'BTN', action: 'fold',
  category, severity: 'minor', evLoss, timestamp,
})

describe('weaknessWindow', () => {
  it('drops a mastered category that has no recent mistakes', () => {
    const now = 1_000 * DAY
    const mistakes = [
      // 過去に大量に出した (克服済み) カテゴリ
      ...Array.from({ length: 20 }, (_, i) => mk('preflop_too_wide', now - (60 + i) * DAY)),
      // 最近繰り返しているカテゴリ
      mk('fold_to_3bet', now - 1 * DAY),
      mk('fold_to_3bet', now - 2 * DAY),
    ]
    const recent = aggregateRecentWeaknesses(mistakes, { now })
    expect(recent[0]?.category).toBe('fold_to_3bet')
    // 克服済みは直近ウィンドウから消える
    expect(recent.find(r => r.category === 'preflop_too_wide')).toBeUndefined()

    // 全期間では克服済みが依然1位 (補助表示なのでこれで良い)
    const all = aggregateAllTimeWeaknesses(mistakes)
    expect(all[0]?.category).toBe('preflop_too_wide')
  })

  it('caps to the most recent maxRecent mistakes', () => {
    const now = 1_000 * DAY
    const mistakes = [
      // 直近だが古い方: A を maxRecent 件ちょうど
      ...Array.from({ length: WEAKNESS_WINDOW_MAX }, (_, i) => mk('preflop_too_tight', now - (i + 5) * 1000)),
      // より新しい: B を数件 (A を押し出す)
      ...Array.from({ length: 3 }, (_, i) => mk('sb_limp', now - (i + 1) * 1000)),
    ]
    const recent = aggregateRecentWeaknesses(mistakes, { now, maxRecent: 5 })
    const total = recent.reduce((n, r) => n + r.count, 0)
    expect(total).toBe(5)
    // 最新5件は sb_limp(3) + preflop_too_tight の一番新しい2件
    expect(recent.find(r => r.category === 'sb_limp')?.count).toBe(3)
    expect(recent.find(r => r.category === 'preflop_too_tight')?.count).toBe(2)
  })

  it('excludes mistakes older than the day window', () => {
    const now = 1_000 * DAY
    const mistakes = [
      mk('bluff_frequency', now - (WEAKNESS_WINDOW_DAYS + 1) * DAY),
      mk('value_bet_missed', now - 1 * DAY),
    ]
    const recent = aggregateRecentWeaknesses(mistakes, { now })
    expect(recent).toHaveLength(1)
    expect(recent[0]?.category).toBe('value_bet_missed')
  })

  it('sums evLoss per category and sorts by count desc', () => {
    const now = 1_000 * DAY
    const mistakes = [
      mk('preflop_passive', now - 1 * DAY, 2),
      mk('preflop_passive', now - 1 * DAY, 3),
      mk('cbet_oop_too_wide', now - 1 * DAY, 10),
    ]
    const recent = aggregateRecentWeaknesses(mistakes, { now })
    expect(recent[0]).toEqual({ category: 'preflop_passive', count: 2, evLost: 5 })
  })

  it('returns empty when there are no mistakes at all', () => {
    expect(aggregateRecentWeaknesses([], { now: 1_000 * DAY })).toEqual([])
    expect(aggregateAllTimeWeaknesses([])).toEqual([])
  })
})
