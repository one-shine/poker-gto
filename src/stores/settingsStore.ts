import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// フィードバックの濃さ
export type AppMode = 'play' | 'study'
// 対戦相手 (GTO Wizard 流の中核軸)
export type OpponentMode = 'trainer' | 'exploit'

interface SettingsStore {
  appMode: AppMode
  opponentMode: OpponentMode
  stackBB: number
  autoAdvanceSeconds: number // study mode で CoachPanel 後に自動再開する秒数
  // study 中に GTO 戦略を常時表示するか。false = 戦略を隠して実力測定(精度がサンプルに入る)。
  studyShowStrategy: boolean
  onboardingComplete: boolean
  // 効果音/ハプティクス。既定 OFF (不意に音を鳴らさない)。
  soundEnabled: boolean
  hapticsEnabled: boolean

  setAppMode: (m: AppMode) => void
  setOpponentMode: (m: OpponentMode) => void
  setStackBB: (n: number) => void
  setAutoAdvanceSeconds: (n: number) => void
  setStudyShowStrategy: (b: boolean) => void
  setSoundEnabled: (b: boolean) => void
  setHapticsEnabled: (b: boolean) => void
  completeOnboarding: () => void
  resetOnboarding: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    set => ({
      appMode: 'study',
      // trainer (gto_ai) は Phase 4 で有効化。それまでの既定は exploit (fish_ai)。
      opponentMode: 'exploit',
      stackBB: 100,
      autoAdvanceSeconds: 5,
      studyShowStrategy: true,
      onboardingComplete: false,
      soundEnabled: false,
      hapticsEnabled: false,

      setAppMode: m => set({ appMode: m }),
      setOpponentMode: m => set({ opponentMode: m }),
      setStackBB: n => set({ stackBB: n }),
      setAutoAdvanceSeconds: n => set({ autoAdvanceSeconds: n }),
      setStudyShowStrategy: b => set({ studyShowStrategy: b }),
      setSoundEnabled: b => set({ soundEnabled: b }),
      setHapticsEnabled: b => set({ hapticsEnabled: b }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      resetOnboarding: () => set({ onboardingComplete: false }),
    }),
    { name: 'poker-gto-settings' },
  ),
)
