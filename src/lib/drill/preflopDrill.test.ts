import { describe, it, expect } from 'vitest'
import { actionFreqs, judge, generateQuestion, allHandCategories, explainPreflop, isPreflopDrillCategory, type PreflopDrillQuestion } from './preflopDrill'

const q = (scenarioId: string, hand: string): PreflopDrillQuestion => ({
  scenarioId, scenarioLabel: '', position: '', hand, options: [],
})

describe('preflop drill', () => {
  it('enumerates all 169 categories', () => {
    expect(allHandCategories()).toHaveLength(169)
  })

  it('AA is a raise (correct) and a fold (mistake) for BTN open', () => {
    expect(judge(q('btn-open', 'AA'), 'raise').correct).toBe(true)
    expect(judge(q('btn-open', 'AA'), 'fold').correct).toBe(false)
  })

  it('72o is a fold (correct) and a raise (mistake) for UTG open', () => {
    expect(judge(q('utg-open', '72o'), 'fold').correct).toBe(true)
    expect(judge(q('utg-open', '72o'), 'raise').correct).toBe(false)
  })

  it('actionFreqs of an out-of-range hand is fold 100%', () => {
    const f = actionFreqs('utg-open', '72o')
    expect(f.find(a => a.action === 'fold')?.freq).toBe(1)
  })

  it('generates questions with deterministic rng', () => {
    const question = generateQuestion(() => 0)
    expect(question.hand).toBeTruthy()
    expect(question.options.length).toBeGreaterThanOrEqual(2)
  })

  describe('category routing', () => {
    it('classifies postflop-only categories as out of scope for preflop drill', () => {
      expect(isPreflopDrillCategory('missed_cbet_ip')).toBe(false)
      expect(isPreflopDrillCategory('cbet_oop_too_wide')).toBe(false)
      expect(isPreflopDrillCategory('oop_donk_bet')).toBe(false)
      expect(isPreflopDrillCategory('bluff_frequency')).toBe(false)
      expect(isPreflopDrillCategory('value_bet_missed')).toBe(false)
      expect(isPreflopDrillCategory('check_ip_missed_value')).toBe(false)
    })

    it('classifies preflop categories (and no category) as in scope', () => {
      expect(isPreflopDrillCategory(undefined)).toBe(true)
      expect(isPreflopDrillCategory('preflop_too_wide')).toBe(true)
      expect(isPreflopDrillCategory('fold_to_3bet')).toBe(true)
      expect(isPreflopDrillCategory('call_3bet_oop')).toBe(true)
      expect(isPreflopDrillCategory('blind_defense_wide')).toBe(true)
      expect(isPreflopDrillCategory('sb_limp')).toBe(true)
    })

    it('routes fold_to_3bet / call_3bet_oop to facing-3bet scenarios (not random opens)', () => {
      expect(generateQuestion(() => 0, 'fold_to_3bet').scenarioId).toMatch(/-3bet$/)
      expect(generateQuestion(() => 0.99, 'fold_to_3bet').scenarioId).toMatch(/-3bet$/)
      expect(generateQuestion(() => 0, 'call_3bet_oop').scenarioId).toMatch(/-3bet$/)
    })

    it('routes preflop open / blind-defense / sb-limp categories to their own spots', () => {
      expect(generateQuestion(() => 0, 'preflop_too_wide').scenarioId).toMatch(/-open$/)
      expect(generateQuestion(() => 0, 'blind_defense_tight').scenarioId).toMatch(/^bb-vs-/)
      expect(generateQuestion(() => 0, 'sb_limp').scenarioId).toBe('sb-open')
    })
  })

  describe('explainPreflop', () => {
    const mk = (scenarioId: string, hand: string, position: string, options: { action: 'raise' | 'call' | 'fold'; label: string }[]): PreflopDrillQuestion =>
      ({ scenarioId, scenarioLabel: '', position, hand, options })

    it('open spot + raise → multi-sentence rationale (hand tier + open-range + position freq)', () => {
      const question = mk('btn-open', 'AA', 'BTN', [{ action: 'raise', label: 'レイズ' }, { action: 'fold', label: 'フォールド' }])
      const j = judge(question, 'raise')
      const text = explainPreflop(question, j)
      expect(text).toContain('オープンレンジ')
      expect(text).toContain('プレミアム') // ハンド階層
      expect(text).toContain('BTN')        // ポジション頻度の文脈
      // 2〜3文に厚みが出ている (区切りが複数)
      expect(text.split('。').filter(Boolean).length).toBeGreaterThanOrEqual(2)
    })

    it('facing-3bet spot + raise → 4bet rationale with value/blocker reason', () => {
      const question = mk('btn-vs-bb-3bet', 'AA', 'BTN', [
        { action: 'raise', label: '4Bet' }, { action: 'call', label: 'コール' }, { action: 'fold', label: 'フォールド' },
      ])
      const j = judge(question, 'raise')
      const text = explainPreflop(question, j)
      expect(text).toContain('4bet')
      expect(text).toContain('ブロッカー')
    })

    it('out-of-range hand → fold rationale mentions position frequency / equity realization', () => {
      const question = mk('utg-open', '72o', 'UTG', [{ action: 'raise', label: 'レイズ' }, { action: 'fold', label: 'フォールド' }])
      const j = judge(question, 'fold')
      const text = explainPreflop(question, j)
      expect(text).toContain('フォールド')
      expect(text).toContain('UTG') // 後ろの席ほど広く開ける根拠 (UTGは絞る)
    })

    it('mistake (chose fold for a raising hand) surfaces a frequency-gap line', () => {
      const question = mk('btn-open', 'AA', 'BTN', [{ action: 'raise', label: 'レイズ' }, { action: 'fold', label: 'フォールド' }])
      const j = judge(question, 'fold') // AA を降りる = ミス
      expect(explainPreflop(question, j)).toContain('推奨頻度との差')
    })
  })
})
