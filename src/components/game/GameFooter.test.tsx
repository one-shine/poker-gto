import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GameFooter } from './GameFooter'
import { useSettingsStore } from '../../stores/settingsStore'

describe('GameFooter', () => {
  it('always shows the 100BB / no-rake / no-ICM assumptions', () => {
    useSettingsStore.setState({ stackBB: 100 })
    render(<GameFooter />)
    expect(screen.getByText(/100BB/)).toBeInTheDocument()
    expect(screen.getByText(/ノーレーク/)).toBeInTheDocument()
    expect(screen.getByText(/ICM非考慮/)).toBeInTheDocument()
  })

  it('reflects the configured stack depth', () => {
    useSettingsStore.setState({ stackBB: 50 })
    render(<GameFooter />)
    expect(screen.getByText(/50BB/)).toBeInTheDocument()
  })

  it('shows the current spot source with a non-color indicator', () => {
    render(<GameFooter source="solver_precomputed" />)
    expect(screen.getByText('GTOソルバー解')).toBeInTheDocument()
    // ✓ アイコンを色と併用 (カラーブラインド対応)
    expect(screen.getAllByText(/✓/).length).toBeGreaterThan(0)
  })

  it('labels approximate spots distinctly', () => {
    render(<GameFooter source="approximate" />)
    expect(screen.getByText('GTO近似レンジ (一般理論ベースの手作り)')).toBeInTheDocument()
  })

  it('opens and closes the assumptions modal', () => {
    render(<GameFooter source="approximate" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByLabelText('前提条件の詳細を開く'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('前提条件')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
