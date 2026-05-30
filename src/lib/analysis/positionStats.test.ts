import { describe, it, expect } from 'vitest'
import type { ActionRecord, Position } from '../../types/game'
import type { MistakeRecord } from '../../types/stats'
import { aggregatePositionStats, estimateAccuracy, POSITIONS } from './positionStats'
import { HERO_ID } from '../../stores/gameStore'

const rec = (
  over: Partial<ActionRecord> & { action: ActionRecord['action']; heroPosition: Position },
): ActionRecord => ({
  handId: 'h', street: 'preflop', playerId: HERO_ID, villainPositions: [],
  amountBB: 0, potBB: 1.5, isIP: true, timestamp: 0,
  ...over,
})

const mistake = (over: Partial<MistakeRecord> & { position: Position }): MistakeRecord => ({
  handId: 'h', street: 'preflop', action: 'raise', category: 'preflop_too_tight',
  severity: 'major', evLoss: 1, timestamp: 0, ...over,
})

describe('aggregatePositionStats (R22-A)', () => {
  it('returns one row per position with zero counts on empty input', () => {
    const rows = aggregatePositionStats([], [])
    expect(rows.map(r => r.position)).toEqual(POSITIONS)
    for (const r of rows) {
      expect(r).toMatchObject({ hands: 0, decisions: 0, vpip: 0, pfr: 0, mistakes: 0, evLost: 0 })
    }
  })

  it('counts hands by hero position from the first action record', () => {
    const hand: ActionRecord[] = [
      rec({ action: 'raise', heroPosition: 'BTN', villainPositions: ['BB'] }),
    ]
    const rows = aggregatePositionStats([hand], [])
    const btn = rows.find(r => r.position === 'BTN')!
    expect(btn.hands).toBe(1)
    expect(btn.pfr).toBe(1)
    expect(btn.vpip).toBe(1)
  })

  it('VPIP counts call/raise/allin but not fold; PFR counts raise/allin only', () => {
    const hand: ActionRecord[] = [
      rec({ action: 'call', heroPosition: 'BB', villainPositions: ['BTN'] }),
    ]
    const rows = aggregatePositionStats([hand], [])
    const bb = rows.find(r => r.position === 'BB')!
    expect(bb.vpip).toBe(1)
    expect(bb.pfr).toBe(0)

    const handFold: ActionRecord[] = [
      rec({ action: 'fold', heroPosition: 'CO', villainPositions: ['BTN'] }),
    ]
    const rowsFold = aggregatePositionStats([handFold], [])
    const co = rowsFold.find(r => r.position === 'CO')!
    expect(co.vpip).toBe(0)
    expect(co.pfr).toBe(0)
    expect(co.hands).toBe(1)
  })

  it('excludes multiway decisions from the accuracy sample (HU only)', () => {
    const hand: ActionRecord[] = [
      // HU 1件
      rec({ action: 'raise', heroPosition: 'UTG', villainPositions: ['BB'] }),
      // MW 2件 (相手 2人以上) → decisions に含めない
      rec({ action: 'raise', heroPosition: 'UTG', villainPositions: ['BTN', 'BB'], street: 'flop' }),
      rec({ action: 'check', heroPosition: 'UTG', villainPositions: ['CO', 'BTN', 'BB'], street: 'turn' }),
    ]
    const rows = aggregatePositionStats([hand], [])
    const utg = rows.find(r => r.position === 'UTG')!
    expect(utg.decisions).toBe(1) // HU の 1 件のみ
  })

  it('attaches mistakes by position and sums evLoss', () => {
    const hand: ActionRecord[] = [
      rec({ action: 'raise', heroPosition: 'BTN', villainPositions: ['BB'] }),
    ]
    const mistakes: MistakeRecord[] = [
      mistake({ position: 'BTN', evLoss: 1.5 }),
      mistake({ position: 'BTN', evLoss: 0.5 }),
      mistake({ position: 'BB', evLoss: 3 }), // 別ポジションに集計
    ]
    const rows = aggregatePositionStats([hand], mistakes)
    const btn = rows.find(r => r.position === 'BTN')!
    expect(btn.mistakes).toBe(2)
    expect(btn.evLost).toBeCloseTo(2.0)
    const bb = rows.find(r => r.position === 'BB')!
    expect(bb.mistakes).toBe(1)
    expect(bb.evLost).toBeCloseTo(3)
  })

  it('ignores hands without heroPosition (defensive)', () => {
    // @ts-expect-error: 故意に heroPosition を欠落させた異常データを通す
    const hand: ActionRecord[] = [{ ...rec({ action: 'raise', heroPosition: 'BTN' }), heroPosition: undefined }]
    const rows = aggregatePositionStats([hand], [])
    expect(rows.every(r => r.hands === 0)).toBe(true)
  })
})

describe('estimateAccuracy (R22-A)', () => {
  it('returns null for zero decisions', () => {
    const row = { position: 'BTN' as Position, hands: 0, decisions: 0, vpip: 0, pfr: 0, mistakes: 0, evLost: 0 }
    expect(estimateAccuracy(row)).toBeNull()
  })

  it('computes (decisions - mistakes) / decisions', () => {
    const row = { position: 'BTN' as Position, hands: 10, decisions: 10, vpip: 8, pfr: 7, mistakes: 2, evLost: 1 }
    expect(estimateAccuracy(row)).toBeCloseTo(0.8)
  })

  it('returns 1.0 when no mistakes', () => {
    const row = { position: 'BTN' as Position, hands: 5, decisions: 5, vpip: 5, pfr: 5, mistakes: 0, evLost: 0 }
    expect(estimateAccuracy(row)).toBe(1.0)
  })
})

describe('R20: strict accuracy from evaluated/correct (coach-evaluated only)', () => {
  it('estimateAccuracy uses correct/evaluated when evaluated is defined', () => {
    const row = { position: 'BTN' as Position, hands: 12, decisions: 12, vpip: 9, pfr: 8, mistakes: 2, evLost: 1, evaluated: 8, correct: 6 }
    // 厳密母数: 8 評価中 6 正解 = 0.75 (楽観の decisions ベース 0.83 ではない)
    expect(estimateAccuracy(row)).toBeCloseTo(0.75)
  })

  it('evaluated=0 → null (データ不足) instead of optimistic decisions-based accuracy', () => {
    const row = { position: 'BTN' as Position, hands: 6, decisions: 6, vpip: 4, pfr: 3, mistakes: 0, evLost: 0, evaluated: 0, correct: 0 }
    // 未評価ポジは「100%」と出さず null。
    expect(estimateAccuracy(row)).toBeNull()
  })

  it('aggregatePositionStats fills evaluated/correct from evalByPosition map', () => {
    const hand: ActionRecord[] = [
      { playerId: HERO_ID, heroPosition: 'CO', actorPosition: 'CO', street: 'preflop', action: 'raise', amountBB: 2.5, villainPositions: ['BB'] } as ActionRecord,
    ]
    const rows = aggregatePositionStats([hand], [], { CO: { evaluated: 10, correct: 7 } })
    const co = rows.find(r => r.position === 'CO')!
    expect(co.evaluated).toBe(10)
    expect(co.correct).toBe(7)
    expect(estimateAccuracy(co)).toBeCloseTo(0.7)
    // map に無いポジは evaluated=0 → 精度 null。
    const utg = rows.find(r => r.position === 'UTG')!
    expect(utg.evaluated).toBe(0)
    expect(estimateAccuracy(utg)).toBeNull()
  })
})
