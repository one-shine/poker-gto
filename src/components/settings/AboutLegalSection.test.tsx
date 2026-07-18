import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AboutLegalSection } from './AboutLegalSection'
import { NON_AFFILIATION, LEGAL_PLACEHOLDER } from '../../data/legal/privacyPolicy'

describe('AboutLegalSection', () => {
  it('実マネー無し・非提携を常設表示する (オーバーレイを開かなくても見える)', () => {
    render(<AboutLegalSection />)
    // 監査指摘「アプリ内導線0件」の解消: 常設文言はダイアログを開かず見える
    expect(screen.getByText(/実際の金銭の賭け・換金・賞金は一切ありません/)).toBeInTheDocument()
    expect(screen.getByText(NON_AFFILIATION)).toBeInTheDocument()
    // 開く前はダイアログ本文は存在しない
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('プライバシーポリシーを開閉できる (ボタン → dialog → ✕ で閉じる)', () => {
    render(<AboutLegalSection />)
    fireEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }))
    const dialog = screen.getByRole('dialog', { name: 'プライバシーポリシー' })
    expect(dialog).toBeInTheDocument()
    // ドラフト忠実性の代表確認: 端末内保存の基本方針が本文にある
    expect(within(dialog).getByText(/データは端末内に留まります/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape でオーバーレイを閉じる', () => {
    render(<AboutLegalSection />)
    fireEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('事業者名・連絡先・施行日はプレースホルダで捏造しない', () => {
    render(<AboutLegalSection />)
    fireEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }))
    // 3項目とも未確定プレースホルダ (PII を勝手に埋めていないこと)
    expect(screen.getAllByText(LEGAL_PLACEHOLDER).length).toBeGreaterThanOrEqual(3)
  })
})
