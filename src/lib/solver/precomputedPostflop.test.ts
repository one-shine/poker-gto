import { describe, it, expect } from 'vitest'
import { getSolution } from './getSolution'
import {
  REPRESENTATIVE_BOARDS, REPRESENTATIVE_SPOTS, representativeSpotSet, representativeHeroCombos,
} from './representativeBoards'
import { baseHeroIsOOP, comboKey } from './riverRanges'
import type { SpotKey } from '../../types/solver'

// 事前計算「代表ボード」テーブルが getSolution から live solve 無しで厳密解として引けることの統合テスト。
// JSON は scripts/precompute-postflop.ts / scripts/precompute-flop.ts が生成し同梱。
const SRP_POT = 5.5
const SRP_STACK = 100

describe('precomputed representative-board postflop', () => {
  // SRP / 3bet の両 pot 種別 × flop/turn/river で、盤面完全一致時に solver_precomputed が live なしで返る。
  // flop JSON (bb-vs-btn__AhKd7s__*.json) は scripts/precompute-flop.ts 煙テストで生成済み。
  for (const potType of ['srp', '3bet'] as const) {
    const set = representativeSpotSet(potType)
    const spotId = set.spots[0]
    const heroIsOOP = baseHeroIsOOP(spotId)!
    const bet = +(set.potBB * 0.66).toFixed(2)

    for (const street of ['turn', 'river'] as const) {
      const rb = REPRESENTATIVE_BOARDS.find(b => b.street === street)!

      it(`${potType} ${street}: returns solver_precomputed without live solve (lead)`, async () => {
        const combo = representativeHeroCombos(spotId, rb.board, street)[0]
        const spot: SpotKey = {
          baseSpotId: spotId, street, board: rb.board, heroCards: combo.cards,
          potBB: set.potBB, effStackBB: set.effStackBB, riverBetBB: 0, heroIsOOP,
        }
        // allowLiveSolve を渡さない = precomputed のみ。ヒットすれば厳密解が返る。
        const sol = await getSolution(spot)
        expect(sol).not.toBeNull()
        expect(sol!.source).toBe('solver_precomputed')
        expect(sol!.strategy[comboKey(combo.cards)]).toBeTruthy()
      })

      it(`${potType} ${street}: returns solver_precomputed for the facing node (betFrac≈0.66)`, async () => {
        const combo = representativeHeroCombos(spotId, rb.board, street)[0]
        const spot: SpotKey = {
          baseSpotId: spotId, street, board: rb.board, heroCards: combo.cards,
          potBB: set.potBB, effStackBB: set.effStackBB, riverBetBB: bet, heroIsOOP,
        }
        const sol = await getSolution(spot)
        expect(sol).not.toBeNull()
        expect(sol!.source).toBe('solver_precomputed')
      })
    }
  }

  // flop 代表ボード: bb-vs-btn SRP AhKd7s の事前計算解が bettingAware:true で返る。
  it('flop srp bb-vs-btn AhKd7s: returns solver_precomputed with bettingAware=true (lead)', async () => {
    const rb = REPRESENTATIVE_BOARDS.find(b => b.id === 'flop-ahigh-dry')!
    const spotId = 'bb-vs-btn'
    const combos = representativeHeroCombos(spotId, rb.board, 'flop')
    if (combos.length === 0) return // JSON 未生成環境ではスキップ
    const combo = combos[0]
    const heroIsOOP = baseHeroIsOOP(spotId)!
    const spot: SpotKey = {
      baseSpotId: spotId, street: 'flop', board: rb.board, heroCards: combo.cards,
      potBB: SRP_POT, effStackBB: SRP_STACK, riverBetBB: 0, heroIsOOP,
    }
    const sol = await getSolution(spot)
    if (!sol) return // JSON 未生成環境ではスキップ
    expect(sol.source).toBe('solver_precomputed')
    expect(sol.bettingAware).toBe(true)
    expect(sol.strategy[comboKey(combo.cards)]).toBeTruthy()
  })

  it('does not serve precomputed for a non-representative random board (falls through to null without live solve)', async () => {
    const spot: SpotKey = {
      baseSpotId: REPRESENTATIVE_SPOTS[0], street: 'river',
      board: [
        { rank: '2', suit: 'clubs' }, { rank: '5', suit: 'diamonds' }, { rank: '8', suit: 'hearts' },
        { rank: 'J', suit: 'spades' }, { rank: '3', suit: 'clubs' },
      ],
      heroCards: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }],
      potBB: SRP_POT, effStackBB: SRP_STACK, riverBetBB: 0, heroIsOOP: true,
    }
    // precomputed 非対象 + allowLiveSolve 無し → live もしないので null。
    expect(await getSolution(spot)).toBeNull()
  })

  it('ignores precomputed when pot size differs (different context)', async () => {
    const rb = REPRESENTATIVE_BOARDS.find(b => b.street === 'river')!
    const spotId = REPRESENTATIVE_SPOTS[0]
    const combo = representativeHeroCombos(spotId, rb.board, 'river')[0]
    const spot: SpotKey = {
      baseSpotId: spotId, street: 'river', board: rb.board, heroCards: combo.cards,
      potBB: 99, effStackBB: SRP_STACK, riverBetBB: 0, heroIsOOP: baseHeroIsOOP(spotId)!,
    }
    // pot 不一致 + live solve 無し → precomputed を使わず null。
    expect(await getSolution(spot)).toBeNull()
  })
})
