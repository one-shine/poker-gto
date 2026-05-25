import { create } from 'zustand'
import type { PageId } from '../components/layout/navItems'
import type { MistakeCategory } from '../types/stats'

// ページ遷移 + ページ間ディープリンク(弱点→理論 / 弱点→ドリル)。
// URLルーターを持たないため、遷移時に渡したフォーカス対象をここで保持する。
interface NavStore {
  page: PageId
  theoryFocusId: string | null  // TheoryPage で自動的に開くコンセプトID
  drillCategory: MistakeCategory | null // LearnPage ドリルタブの出題フィルタ
  reflectionOpen: boolean        // セッション振り返りモーダル
  goTo: (page: PageId, opts?: { theoryConceptId?: string; drillCategory?: MistakeCategory }) => void
  clearTheoryFocus: () => void
  clearDrillCategory: () => void
  openReflection: () => void
  closeReflection: () => void
}

export const useNavStore = create<NavStore>(set => ({
  page: 'game',
  theoryFocusId: null,
  drillCategory: null,
  reflectionOpen: false,
  goTo: (page, opts) => set({
    page,
    theoryFocusId: opts?.theoryConceptId ?? null,
    drillCategory: opts?.drillCategory ?? null,
  }),
  clearTheoryFocus: () => set({ theoryFocusId: null }),
  clearDrillCategory: () => set({ drillCategory: null }),
  openReflection: () => set({ reflectionOpen: true }),
  closeReflection: () => set({ reflectionOpen: false }),
}))
