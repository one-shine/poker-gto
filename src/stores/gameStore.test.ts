import { describe, it, expect, vi, afterEach } from 'vitest'
import { useGameStore } from './gameStore'
import { useSettingsStore } from './settingsStore'

afterEach(() => { vi.useRealTimers(); useSettingsStore.getState().setAppMode('study') })

describe('gameStore', () => {
  it('drives a full hand: fish act on timers, hero turn is surfaced, hand completes', () => {
    vi.useFakeTimers()
    const store = useGameStore
    // play モードは答え合わせの一時停止が無く、エンジンのハンド進行をそのまま検証できる。
    useSettingsStore.getState().setAppMode('play')

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

  it('study + 答え合わせ: hero の行動後に一時停止し、次へ で再開する (U16)', () => {
    vi.useFakeTimers()
    useSettingsStore.getState().setAppMode('study')
    useSettingsStore.getState().setStudyShowStrategy(true)
    const store = useGameStore
    store.getState().resetGame()
    store.getState().initGame()
    store.getState().startNewHand()

    let acted = false
    for (let i = 0; i < 300 && !acted; i++) {
      if (store.getState().pendingHeroAction) { store.getState().submitHeroAction('fold'); acted = true }
      else vi.advanceTimersByTime(500)
    }
    expect(acted).toBe(true)
    // 答え合わせを読めるよう一時停止している (AI 送出は保留)。
    expect(store.getState().isPaused).toBe(true)
    // 打った決定が保持され、SpotPanel(review)の答え合わせに使える (U8)。
    const decision = store.getState().lastHeroDecision
    expect(decision).not.toBeNull()
    expect(decision!.action).toBe('fold')
    // 「次へ」で再開。
    store.getState().dismissFeedback()
    expect(store.getState().isPaused).toBe(false)
  })

  it('U17: フォールド後は残りを遅延0で即決着する', () => {
    vi.useFakeTimers()
    useSettingsStore.getState().setAppMode('play') // play は答え合わせの一時停止が無い
    const store = useGameStore
    store.getState().resetGame()
    store.getState().initGame()
    store.getState().startNewHand()

    let folded = false
    for (let i = 0; i < 300 && !folded; i++) {
      if (store.getState().pendingHeroAction) { store.getState().submitHeroAction('fold'); folded = true }
      else vi.advanceTimersByTime(500)
    }
    expect(folded).toBe(true)
    // フォールド後の残り AI は遅延0。合計わずかなタイマー進行で完了する(通常遅延550ms+なら完了しない)。
    for (let i = 0; i < 30 && store.getState().handCount === 0; i++) vi.advanceTimersByTime(1)
    expect(store.getState().handCount).toBe(1)
  })
})
