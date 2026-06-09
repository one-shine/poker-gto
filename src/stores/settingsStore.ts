import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// フィードバックの濃さ
export type AppMode = 'play' | 'study'
// 対戦相手 (GTO Wizard 流の中核軸)
export type OpponentMode = 'trainer' | 'exploit'
// 相手 AI の「間」(アクション送出の遅延)。読みやすさは端末・好み次第なので可変にする。
export type AiSpeed = 'slow' | 'normal' | 'fast'
// スタックの扱い。reset = 毎ハンド buyInBB に戻す(GTO評価がクリーン・既定)。
// cash = 前ハンドの終了スタックを持ち越し、バストで自動リバイ(実戦的・100BBから外れると精度低下)。
export type StackMode = 'reset' | 'cash'

interface SettingsStore {
  appMode: AppMode
  opponentMode: OpponentMode
  stackMode: StackMode
  buyInBB: number // 1ハンドの開始スタック(reset)/ 着席バイイン(cash)。解は100BB前提。
  stackBB: number // @deprecated buyInBB に統合予定。後方互換のため当面残す。
  autoAdvanceSeconds: number // study mode で CoachPanel 後に自動再開する秒数
  // study 中、自分のアクション後に GTO 戦略を「答え合わせ」表示するか。false = 表示しない(純粋にテスト)。
  studyShowStrategy: boolean
  // study 中、自分のアクション前に「この局面の考え方」(答え中立の観点)を表示するか。
  showReasoningGuide: boolean
  aiSpeed: AiSpeed // 相手アクションの速さ (slow/normal/fast)
  onboardingComplete: boolean
  // 効果音/ハプティクス。既定 OFF (不意に音を鳴らさない)。
  soundEnabled: boolean
  hapticsEnabled: boolean

  setAppMode: (m: AppMode) => void
  setOpponentMode: (m: OpponentMode) => void
  setStackMode: (m: StackMode) => void
  setBuyInBB: (n: number) => void
  setStackBB: (n: number) => void
  setAutoAdvanceSeconds: (n: number) => void
  setStudyShowStrategy: (b: boolean) => void
  setShowReasoningGuide: (b: boolean) => void
  setAiSpeed: (s: AiSpeed) => void
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
      stackMode: 'reset',
      buyInBB: 100,
      stackBB: 100,
      autoAdvanceSeconds: 5,
      studyShowStrategy: true,
      showReasoningGuide: true,
      aiSpeed: 'normal',
      onboardingComplete: false,
      soundEnabled: false,
      hapticsEnabled: false,

      setAppMode: m => set({ appMode: m }),
      setOpponentMode: m => set({ opponentMode: m }),
      setStackMode: m => set({ stackMode: m }),
      setBuyInBB: n => set({ buyInBB: n, stackBB: n }),
      setStackBB: n => set({ stackBB: n, buyInBB: n }),
      setAutoAdvanceSeconds: n => set({ autoAdvanceSeconds: n }),
      setStudyShowStrategy: b => set({ studyShowStrategy: b }),
      setShowReasoningGuide: b => set({ showReasoningGuide: b }),
      setAiSpeed: sp => set({ aiSpeed: sp }),
      setSoundEnabled: b => set({ soundEnabled: b }),
      setHapticsEnabled: b => set({ hapticsEnabled: b }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      resetOnboarding: () => set({ onboardingComplete: false }),
    }),
    {
      name: 'poker-gto-settings',
      version: 1,
      // v0 (stackMode/buyInBB 以前) の永続データに新フィールドを補完。旧 stackBB を buyInBB の初期値に流用。
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsStore> & { stackBB?: number }
        if (version < 1) {
          return {
            ...p,
            stackMode: p.stackMode ?? 'reset',
            buyInBB: p.buyInBB ?? p.stackBB ?? 100,
            stackBB: p.stackBB ?? p.buyInBB ?? 100,
          } as SettingsStore
        }
        return p as SettingsStore
      },
    },
  ),
)
