import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsPage } from './SettingsPage'
import { useSettingsStore } from '../stores/settingsStore'

describe('SettingsPage', () => {
  beforeEach(() => {
    useSettingsStore.setState({ appMode: 'study', opponentMode: 'trainer', stackBB: 100, autoAdvanceSeconds: 5 })
  })

  it('switches app mode when clicking プレイ', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByText('プレイ'))
    expect(useSettingsStore.getState().appMode).toBe('play')
  })

  it('switches opponent mode to exploit', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByText('Fish (exploit)'))
    expect(useSettingsStore.getState().opponentMode).toBe('exploit')
  })

  it('changes stack depth', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByText('200BB'))
    expect(useSettingsStore.getState().stackBB).toBe(200)
  })
})
