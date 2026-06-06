import { describe, it, expect } from 'vitest'
import { generateRepresentativePostflopQuestion } from './postflopDrill'
import { comboKey } from '../solver/riverRanges'
import { REPRESENTATIVE_SPOTS, representativeHeroCombos } from '../solver/representativeBoards'
import { mulberry32 } from '../solver/preflopEquity'

describe('generateRepresentativePostflopQuestion', () => {
  it('produces precomputable representative questions (turn/river · SRP · lead/facing · hero in table)', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 60; i++) {
      const q = generateRepresentativePostflopQuestion(rng)
      expect(q).not.toBeNull()
      if (!q) continue
      // 事前計算の対象に厳密に収まること
      expect(q.representative).toBeTruthy()
      expect(q.street === 'turn' || q.street === 'river').toBe(true)
      expect(REPRESENTATIVE_SPOTS).toContain(q.baseSpotId)
      expect(q.facingRaise).toBe(false)
      expect(q.potType).toBe('srp')
      expect(q.potBB).toBe(5.5)
      expect(q.street).not.toBe('flop') // 代表ボードは turn/river のみ
      // hero ハンドは事前計算と同一のコンボ集合に必ず含まれる (= JSON テーブルにヒットする)
      const heroK = comboKey(q.heroCards)
      const tableKeys = new Set(
        representativeHeroCombos(q.baseSpotId, q.board, q.street as 'turn' | 'river').map(c => comboKey(c.cards)),
      )
      expect(tableKeys.has(heroK)).toBe(true)
    }
  })

  it('facing questions carry a 0.66-pot faced bet', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 40; i++) {
      const q = generateRepresentativePostflopQuestion(rng)!
      if (q.facing) {
        expect(q.facedBetBB).toBeCloseTo(+(q.potBB * 0.66).toFixed(1), 5)
      }
    }
  })
})
