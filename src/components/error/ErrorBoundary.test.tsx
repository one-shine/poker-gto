import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): never {
  throw new Error('boom')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders the Japanese fallback and a reload button when a child throws', () => {
    // 境界が捕捉する意図的なエラーで React が出す console.error を抑制
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReload = vi.fn()

    render(
      <ErrorBoundary onReload={onReload}>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByText(/問題が発生しました/)).toBeInTheDocument()
    const reload = screen.getByRole('button', { name: '再読み込み' })
    expect(reload).toBeInTheDocument()

    fireEvent.click(reload)
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('pairs the warning glyph with text (not color alone)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary onReload={() => {}}>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('⚠')).toBeInTheDocument()
  })

  it('renders children unchanged when there is no error', () => {
    render(
      <ErrorBoundary>
        <span>normal child</span>
      </ErrorBoundary>,
    )
    expect(screen.getByText('normal child')).toBeInTheDocument()
    expect(screen.queryByText(/問題が発生しました/)).not.toBeInTheDocument()
  })
})
