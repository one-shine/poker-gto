import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { CoachToast } from './CoachToast'
import type { CoachFeedback } from '../../types/coach'

const critical: CoachFeedback = {
  handKey: 'ATs', spotId: 'co-open', street: 'preflop', source: 'approximate', kind: 'mistake',
  chosen: 'fold', severity: 'critical', category: 'preflop_too_tight',
  evLoss: 0, showEv: false, strategy: [{ action: 'raise', sizeBB: 2.5, frequency: 1, ev: 0 }],
  message: 'ATs の フォールド より、推奨は レイズ 2.5BB 100% です。',
}

describe('CoachToast', () => {
  it('renders the blunder label and message', () => {
    render(<CoachToast feedback={critical} onDismiss={() => {}} />)
    expect(screen.getByText('ブランダー')).toBeInTheDocument()
    expect(screen.getByText(/推奨は レイズ/)).toBeInTheDocument()
  })

  it('shows EV only when showEv is true', () => {
    render(<CoachToast feedback={{ ...critical, showEv: true, evLoss: 3.2 }} onDismiss={() => {}} />)
    expect(screen.getByText(/-3.2BB/)).toBeInTheDocument()
  })

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<CoachToast feedback={critical} onDismiss={onDismiss} durationMs={1000} />)
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
