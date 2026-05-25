import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingFlow } from './OnboardingFlow'
import { useSettingsStore } from '../../stores/settingsStore'

describe('OnboardingFlow', () => {
  it('walks through every slide and completes onboarding at the end', () => {
    useSettingsStore.setState({ onboardingComplete: false })
    const onComplete = vi.fn()
    render(<OnboardingFlow onComplete={onComplete} />)

    expect(screen.getByText('ようこそ')).toBeInTheDocument()
    // 5枚目までは「次へ」、最後は「プレイ開始」
    fireEvent.click(screen.getByText('次へ')) // → ポジション
    fireEvent.click(screen.getByText('次へ')) // → グリッド
    fireEvent.click(screen.getByText('次へ')) // → モード
    fireEvent.click(screen.getByText('次へ')) // → 始めましょう
    fireEvent.click(screen.getByText('プレイ開始'))

    expect(onComplete).toHaveBeenCalledOnce()
    expect(useSettingsStore.getState().onboardingComplete).toBe(true)
  })

  it('explains the grid legend with text tokens, not color alone', () => {
    render(<OnboardingFlow />)
    fireEvent.click(screen.getByText('次へ'))
    fireEvent.click(screen.getByText('次へ'))
    expect(screen.getByText('レンジグリッドの読み方')).toBeInTheDocument()
    // R/C/M トークン併記 (CLAUDE.md ルール5)
    expect(screen.getByText('R')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('can be skipped immediately', () => {
    useSettingsStore.setState({ onboardingComplete: false })
    const onComplete = vi.fn()
    render(<OnboardingFlow onComplete={onComplete} />)
    fireEvent.click(screen.getByText('スキップ'))
    expect(onComplete).toHaveBeenCalledOnce()
    expect(useSettingsStore.getState().onboardingComplete).toBe(true)
  })
})
