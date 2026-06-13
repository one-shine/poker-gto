import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GameFooter } from './GameFooter'
import { useSettingsStore } from '../../stores/settingsStore'
import { useGameStore } from '../../stores/gameStore'

describe('GameFooter', () => {
  it('always shows the 100BB / no-rake / no-ICM assumptions', () => {
    useSettingsStore.setState({ stackMode: 'reset', buyInBB: 100 })
    render(<GameFooter />)
    expect(screen.getByText(/100BB/)).toBeInTheDocument()
    expect(screen.getByText(/ノーレーク/)).toBeInTheDocument()
    expect(screen.getByText(/ICM非考慮/)).toBeInTheDocument()
  })

  it('reflects the configured stack depth (reset)', () => {
    useSettingsStore.setState({ stackMode: 'reset', buyInBB: 50 })
    render(<GameFooter />)
    // 50BB は開始スタック表記 + 100BB前提からの drift 注記の両方に出るので getAllByText。
    expect(screen.getAllByText(/50BB/).length).toBeGreaterThan(0)
  })

  it('cash モードは持ち越し + 実効スタックの精度注記を出す (honest-display)', () => {
    useSettingsStore.setState({ stackMode: 'cash', buyInBB: 100 })
    useGameStore.setState({ effectiveStackBB: 40 })
    render(<GameFooter />)
    expect(screen.getByText(/持ち越し/)).toBeInTheDocument()
    expect(screen.getAllByText(/40BB/).length).toBeGreaterThan(0)
    expect(screen.getByText(/精度低下/)).toBeInTheDocument()
  })

  it('shows the current spot source with a non-color indicator', () => {
    useSettingsStore.setState({ stackMode: 'reset', buyInBB: 100 })
    render(<GameFooter source="solver_precomputed" />)
    expect(screen.getByText('GTOソルバー解')).toBeInTheDocument()
    // ✓ アイコンを色と併用 (カラーブラインド対応)
    expect(screen.getAllByText(/✓/).length).toBeGreaterThan(0)
  })

  it('labels approximate spots distinctly', () => {
    useSettingsStore.setState({ stackMode: 'reset', buyInBB: 100 })
    render(<GameFooter source="approximate" />)
    expect(screen.getByText('GTO理論準拠の近似レンジ')).toBeInTheDocument()
  })

  it('opens and closes the assumptions modal', () => {
    useSettingsStore.setState({ stackMode: 'reset', buyInBB: 100 })
    render(<GameFooter source="approximate" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByLabelText('前提条件の詳細を開く'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('前提条件')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
