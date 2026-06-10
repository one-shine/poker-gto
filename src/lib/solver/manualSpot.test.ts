import { describe, it, expect } from 'vitest'
import type { Card } from '../../types/game'
import { parseCard } from '../../engine/cards/Card'
import {
  buildManualSpotKey,
  validPreflopHeroPositions,
  validPreflopVillainPositions,
  validPostflopPairs,
  type ManualSpotInput,
} from './manualSpot'

const cards = (s: string): Card[] => s.trim().split(/\s+/).map(parseCard)
const hero = (s: string): [Card, Card] => {
  const c = cards(s)
  return [c[0], c[1]]
}

function build(partial: Partial<ManualSpotInput> & Pick<ManualSpotInput, 'street' | 'heroPos' | 'villainPos'>) {
  // デフォルト手札はどのテスト盤面とも衝突しない札にする(衝突チェックが先に効くため)。
  return buildManualSpotKey({ heroCards: hero('Qs Jh'), ...partial })
}

describe('buildManualSpotKey — preflop', () => {
  it('RFI は {pos}-open に解決', () => {
    const r = build({ street: 'preflop', heroPos: 'BTN', villainPos: 'BB', preflopContext: 'rfi' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.spot.baseSpotId).toBe('btn-open')
  })

  it('vs open: BB は bb-vs-{opener}', () => {
    const r = build({ street: 'preflop', heroPos: 'BB', villainPos: 'BTN', preflopContext: 'vs_open' })
    expect(r.ok && r.spot.baseSpotId).toBe('bb-vs-btn')
  })

  it('vs open: 非BB は {hero}-vs-{opener}', () => {
    const r = build({ street: 'preflop', heroPos: 'SB', villainPos: 'BTN', preflopContext: 'vs_open' })
    expect(r.ok && r.spot.baseSpotId).toBe('sb-vs-btn')
  })

  it('vs 3bet: opener が 3better に直面', () => {
    const r = build({ street: 'preflop', heroPos: 'BTN', villainPos: 'SB', preflopContext: 'vs_3bet' })
    expect(r.ok && r.spot.baseSpotId).toBe('btn-vs-sb-3bet')
  })

  it('未収録の位置対は no_scenario (UTG が vs_open)', () => {
    const r = build({ street: 'preflop', heroPos: 'UTG', villainPos: 'MP', preflopContext: 'vs_open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_scenario')
  })

  it('手札の重複は invalid_cards', () => {
    const r = buildManualSpotKey({ street: 'preflop', heroPos: 'BTN', villainPos: 'BB', preflopContext: 'rfi', heroCards: hero('As As') })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_cards')
  })
})

describe('buildManualSpotKey — postflop SRP', () => {
  const board = cards('Ah Kd 7s')

  it('hero=BB vs opener は bb-vs-{opener}・OOP', () => {
    const r = build({ street: 'flop', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'check' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.spot.baseSpotId).toBe('bb-vs-btn')
      expect(r.spot.heroIsOOP).toBe(true)
    }
  })

  it('hero=opener vs BB は {hero}-open・IP', () => {
    const r = build({ street: 'flop', heroPos: 'BTN', villainPos: 'BB', potType: 'srp', board, facing: 'check' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.spot.baseSpotId).toBe('btn-open')
      expect(r.spot.heroIsOOP).toBe(false)
    }
  })

  it('SB を含む SRP は sb_srp で弾く (baseHeroIsOOP では通ってしまう穴を塞ぐ)', () => {
    const a = build({ street: 'flop', heroPos: 'BB', villainPos: 'SB', potType: 'srp', board, facing: 'check' })
    expect(a.ok).toBe(false)
    if (!a.ok) expect(a.reason).toBe('sb_srp')
    const b = build({ street: 'flop', heroPos: 'SB', villainPos: 'BB', potType: 'srp', board, facing: 'check' })
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.reason).toBe('sb_srp')
  })

  it('どちらも BB でない SRP は no_scenario', () => {
    const r = build({ street: 'flop', heroPos: 'CO', villainPos: 'BTN', potType: 'srp', board, facing: 'check' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_scenario')
  })

  it('盤面の枚数不足は need_board (turn に flop を渡す)', () => {
    const r = build({ street: 'turn', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'check' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('need_board')
  })

  it('手札が盤面と衝突は invalid_cards', () => {
    const r = buildManualSpotKey({ street: 'flop', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'check', heroCards: hero('Ah Qd') })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_cards')
  })
})

describe('buildManualSpotKey — facing / bet size', () => {
  const board = cards('Ah Kd 7s 2c 9h')

  it('被ベットは riverBetBB を設定', () => {
    const r = build({ street: 'river', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'bet', villainBetBB: 4, potBB: 6 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.spot.riverBetBB).toBe(4)
  })

  it('チェックは riverBetBB 未設定 (lead ノード)', () => {
    const r = build({ street: 'river', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'check', potBB: 6 })
    expect(r.ok && r.spot.riverBetBB).toBeUndefined()
  })

  it('被ベットでベット額0以下は invalid_bet', () => {
    const r = build({ street: 'river', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'bet', villainBetBB: 0, potBB: 6 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_bet')
  })

  it('代表サイズ(約2/3)近辺は nonstandardBet=false', () => {
    const r = build({ street: 'river', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'bet', villainBetBB: 4, potBB: 6 })
    expect(r.ok && r.nonstandardBet).toBe(false)
  })

  it('代表サイズから外れると nonstandardBet=true', () => {
    const r = build({ street: 'river', heroPos: 'BB', villainPos: 'BTN', potType: 'srp', board, facing: 'bet', villainBetBB: 6, potBB: 6 })
    expect(r.ok && r.nonstandardBet).toBe(true)
  })
})

describe('buildManualSpotKey — 3bet pot', () => {
  const board = cards('Ah Kd 7s')

  it('収録ペアは 3bp-{hero}-vs-{villain} に解決', () => {
    const r = build({ street: 'flop', heroPos: 'BTN', villainPos: 'CO', potType: '3bet', board, facing: 'check' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.spot.baseSpotId).toBe('3bp-btn-vs-co')
  })

  it('未収録ペアは three_bet_pair_unsupported', () => {
    const r = build({ street: 'flop', heroPos: 'UTG', villainPos: 'SB', potType: '3bet', board, facing: 'check' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('three_bet_pair_unsupported')
  })
})

describe('有効ペア列挙', () => {
  it('RFI の hero は BB を含まない', () => {
    const heroes = validPreflopHeroPositions('rfi')
    expect(heroes).not.toContain('BB')
    expect(heroes).toEqual(expect.arrayContaining(['UTG', 'MP', 'CO', 'BTN', 'SB']))
    expect(validPreflopVillainPositions('rfi', 'BTN')).toEqual([])
  })

  it('postflop SRP の全ペアは一方が BB', () => {
    const pairs = validPostflopPairs('srp')
    expect(pairs.length).toBe(8)
    expect(pairs.every(p => p.hero === 'BB' || p.villain === 'BB')).toBe(true)
    expect(pairs.every(p => p.hero !== 'SB' && p.villain !== 'SB')).toBe(true)
  })

  it('postflop 3bet ペアはすべて buildManualSpotKey が解決できる', () => {
    const pairs = validPostflopPairs('3bet')
    expect(pairs.length).toBe(10)
    for (const p of pairs) {
      const r = buildManualSpotKey({ street: 'flop', heroPos: p.hero, villainPos: p.villain, potType: '3bet', board: cards('Ah Kd 7s'), facing: 'check', heroCards: hero('Qs Qh') })
      expect(r.ok).toBe(true)
    }
  })
})
