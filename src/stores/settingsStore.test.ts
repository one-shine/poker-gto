import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settingsStore'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({
    appMode: 'study', opponentMode: 'exploit', stackMode: 'reset', buyInBB: 100, stackBB: 100,
    autoAdvanceSeconds: 5, onboardingComplete: false,
  })
})

describe('settingsStore', () => {
  it('has the expected defaults', () => {
    const s = useSettingsStore.getState()
    expect(s.appMode).toBe('study')
    expect(s.opponentMode).toBe('exploit')
    expect(s.stackMode).toBe('reset')
    expect(s.buyInBB).toBe(100)
    expect(s.stackBB).toBe(100)
    expect(s.autoAdvanceSeconds).toBe(5)
    expect(s.onboardingComplete).toBe(false)
  })

  it('setters update values', () => {
    const s = useSettingsStore.getState()
    s.setAppMode('play')
    s.setOpponentMode('trainer')
    s.setStackMode('cash')
    s.completeOnboarding()
    const next = useSettingsStore.getState()
    expect(next.appMode).toBe('play')
    expect(next.opponentMode).toBe('trainer')
    expect(next.stackMode).toBe('cash')
    expect(next.onboardingComplete).toBe(true)
  })

  it('setBuyInBB / setStackBB keep buyInBB and stackBB in sync (移行期の後方互換)', () => {
    useSettingsStore.getState().setBuyInBB(200)
    expect(useSettingsStore.getState().buyInBB).toBe(200)
    expect(useSettingsStore.getState().stackBB).toBe(200)
    useSettingsStore.getState().setStackBB(50)
    expect(useSettingsStore.getState().buyInBB).toBe(50)
    expect(useSettingsStore.getState().stackBB).toBe(50)
  })

  it('persists to localStorage', () => {
    useSettingsStore.getState().setBuyInBB(50)
    expect(localStorage.getItem('poker-gto-settings')).toContain('"buyInBB":50')
  })

  it('migrates legacy v0 (stackBB のみ) → buyInBB + stackMode=reset', async () => {
    localStorage.setItem('poker-gto-settings', JSON.stringify({
      state: { appMode: 'study', opponentMode: 'exploit', stackBB: 200, autoAdvanceSeconds: 5, onboardingComplete: false },
      version: 0,
    }))
    await useSettingsStore.persist.rehydrate()
    const s = useSettingsStore.getState()
    expect(s.buyInBB).toBe(200)
    expect(s.stackBB).toBe(200)
    expect(s.stackMode).toBe('reset')
  })
})
