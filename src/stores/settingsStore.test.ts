import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settingsStore'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({
    appMode: 'study', opponentMode: 'exploit', stackBB: 100,
    autoAdvanceSeconds: 5, onboardingComplete: false,
  })
})

describe('settingsStore', () => {
  it('has the expected defaults', () => {
    const s = useSettingsStore.getState()
    expect(s.appMode).toBe('study')
    expect(s.opponentMode).toBe('exploit')
    expect(s.stackBB).toBe(100)
    expect(s.autoAdvanceSeconds).toBe(5)
    expect(s.onboardingComplete).toBe(false)
  })

  it('setters update values', () => {
    const s = useSettingsStore.getState()
    s.setAppMode('play')
    s.setOpponentMode('trainer')
    s.setStackBB(200)
    s.completeOnboarding()
    const next = useSettingsStore.getState()
    expect(next.appMode).toBe('play')
    expect(next.opponentMode).toBe('trainer')
    expect(next.stackBB).toBe(200)
    expect(next.onboardingComplete).toBe(true)
  })

  it('persists to localStorage', () => {
    useSettingsStore.getState().setStackBB(50)
    expect(localStorage.getItem('poker-gto-settings')).toContain('"stackBB":50')
  })
})
