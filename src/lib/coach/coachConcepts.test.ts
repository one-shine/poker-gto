import { describe, expect, it } from 'vitest'
import type { Card } from '../../types/game'
import type { MistakeCategory } from '../../types/stats'
import {
  CATEGORY_EXPLAIN,
  boardTexture,
  conceptIdForCategory,
  handTier,
  postflopPrinciple,
  preflopPrinciple,
} from './coachConcepts'

// stats.ts の MistakeCategory 全14。enum 化されていないため列挙して網羅性を検証する。
const ALL_CATEGORIES: MistakeCategory[] = [
  'preflop_too_wide', 'preflop_too_tight', 'preflop_passive', 'preflop_sizing',
  'fold_to_3bet', 'call_3bet_oop', 'blind_defense_wide', 'blind_defense_tight',
  'sb_limp', 'missed_cbet_ip', 'cbet_oop_too_wide', 'check_ip_missed_value',
  'oop_donk_bet', 'bluff_frequency', 'value_bet_missed',
]

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit })

describe('CATEGORY_EXPLAIN', () => {
  it('全 MistakeCategory にエントリがある', () => {
    for (const cat of ALL_CATEGORIES) {
      const entry = CATEGORY_EXPLAIN[cat]
      expect(entry, `missing CATEGORY_EXPLAIN[${cat}]`).toBeDefined()
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.why.length).toBeGreaterThan(0)
    }
  })

  it('テストの列挙と CATEGORY_EXPLAIN のキー数が一致する (漏れ検知)', () => {
    expect(Object.keys(CATEGORY_EXPLAIN).sort()).toEqual([...ALL_CATEGORIES].sort())
  })
})

describe('handTier', () => {
  it('AA → premium', () => {
    expect(handTier('AA').tier).toBe('premium')
  })

  it('72o → junk', () => {
    expect(handTier('72o').tier).toBe('junk')
  })

  it('AKs/AQo → broadway', () => {
    expect(handTier('AKs').tier).toBe('broadway')
    expect(handTier('AQo').tier).toBe('broadway')
  })

  it('A5s〜A2s → suited_ace', () => {
    for (const k of ['A5s', 'A4s', 'A3s', 'A2s']) expect(handTier(k).tier).toBe('suited_ace')
  })

  it('77 → pair', () => {
    expect(handTier('77').tier).toBe('pair')
  })

  it('87s → suited_connector', () => {
    expect(handTier('87s').tier).toBe('suited_connector')
  })

  it('169 のどのキーでも例外を投げず label を返す', () => {
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
    for (let i = 0; i < ranks.length; i++) {
      for (let j = 0; j < ranks.length; j++) {
        const key = i === j ? ranks[i] + ranks[i] : i < j ? ranks[i] + ranks[j] + 's' : ranks[j] + ranks[i] + 'o'
        const t = handTier(key)
        expect(t.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('不正なキーは junk にフォールバック', () => {
    expect(handTier('').tier).toBe('junk')
    expect(handTier('ZZ').tier).toBe('junk')
  })
})

describe('boardTexture', () => {
  it('ペアボードを paired として検出', () => {
    const board = [c('K', 'spades'), c('K', 'hearts'), c('7', 'diamonds')]
    expect(boardTexture(board).label).toContain('ペア')
  })

  it('ドライな A ハイボードを dry として検出', () => {
    const board = [c('A', 'spades'), c('8', 'hearts'), c('3', 'diamonds')]
    const t = boardTexture(board)
    expect(t.label).toContain('ドライ')
    expect(t.label).toContain('Aハイ')
  })

  it('モノトーンを検出', () => {
    const board = [c('A', 'spades'), c('8', 'spades'), c('3', 'spades')]
    expect(boardTexture(board).label).toContain('モノトーン')
  })

  it('turn/river の長さも処理できる', () => {
    const river = [c('A', 'spades'), c('8', 'hearts'), c('3', 'diamonds'), c('2', 'clubs'), c('K', 'hearts')]
    expect(boardTexture(river).label.length).toBeGreaterThan(0)
  })
})

describe('principles', () => {
  it('preflopPrinciple は1行の文字列を返す', () => {
    expect(preflopPrinciple('AA', 'UTG', 'raise')).toContain('プレミアム')
    expect(preflopPrinciple('72o', 'UTG', 'fold')).toContain('フォールド')
  })

  it('postflopPrinciple は HandRank と MadeTier 両方を受ける', () => {
    expect(postflopPrinciple('two_pair', 'raise').length).toBeGreaterThan(0)
    expect(postflopPrinciple('strong', 'raise')).toBe(postflopPrinciple('two_pair', 'raise'))
  })
})

describe('conceptIdForCategory', () => {
  it('既存の conceptsForMistake 先頭を返す', () => {
    expect(conceptIdForCategory('sb_limp')).toBeTruthy()
  })

  it('全カテゴリで非 null (弱点導線が必ずリンク先を持つ)', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(conceptIdForCategory(cat), `null concept for ${cat}`).not.toBeNull()
    }
  })
})
