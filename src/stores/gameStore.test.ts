import { describe, it, expect, vi, afterEach } from 'vitest'
import { useGameStore } from './gameStore'

afterEach(() => vi.useRealTimers())

describe('gameStore', () => {
  it('drives a full hand: fish act on timers, hero turn is surfaced, hand completes', () => {
    vi.useFakeTimers()
    const store = useGameStore

    store.getState().initGame()
    store.getState().startNewHand()

    // ハンドが進むまでタイマーを進め、ヒーローのターンが来たらフォールドする
    let heroActed = false
    for (let i = 0; i < 300 && store.getState().handCount === 0; i++) {
      if (store.getState().pendingHeroAction) {
        expect(store.getState().pendingHeroAction!.playerId).toBe('hero')
        store.getState().submitHeroAction('fold')
        heroActed = true
      }
      vi.advanceTimersByTime(500)
    }

    expect(heroActed).toBe(true)
    expect(store.getState().handCount).toBe(1)
    expect(store.getState().lastResults).not.toBeNull()
    expect(store.getState().pendingHeroAction).toBeNull()
  })
})
