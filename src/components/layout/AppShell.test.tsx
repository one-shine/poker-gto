import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppShell } from './AppShell'
import { NAV_ITEMS } from './navItems'

describe('AppShell', () => {
  it('renders all six navigation tabs and the active content', () => {
    render(
      <AppShell active="game" onNavigate={() => {}}>
        <div>content</div>
      </AppShell>,
    )
    expect(NAV_ITEMS).toHaveLength(6)
    // desktop + mobile で各ラベルが2つ描画される
    expect(screen.getAllByLabelText('ゲーム').length).toBe(2)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('marks the active tab with aria-current (not color alone)', () => {
    render(
      <AppShell active="ranges" onNavigate={() => {}}>
        <div />
      </AppShell>,
    )
    const current = screen.getAllByLabelText('レンジ')
    current.forEach(btn => expect(btn).toHaveAttribute('aria-current', 'page'))
    screen.getAllByLabelText('ゲーム').forEach(btn =>
      expect(btn).not.toHaveAttribute('aria-current'),
    )
  })

  it('calls onNavigate with the tab id when clicked', () => {
    const onNavigate = vi.fn()
    render(
      <AppShell active="game" onNavigate={onNavigate}>
        <div />
      </AppShell>,
    )
    fireEvent.click(screen.getAllByLabelText('分析')[0])
    expect(onNavigate).toHaveBeenCalledWith('analysis')
  })
})
