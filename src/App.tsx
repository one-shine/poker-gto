import { lazy, Suspense } from 'react'
import { AppShell } from './components/layout/AppShell'
import { useSettingsStore } from './stores/settingsStore'
import { useNavStore } from './stores/navStore'

// 各ページを遅延ロードして初期バンドル/モバイルTTIを抑える (Phase 6 最適化)
// framer-motion を積む OnboardingFlow/ReflectionModal も遅延化し初回 index から外す (QR6)
const OnboardingFlow = lazy(() => import('./components/onboarding/OnboardingFlow').then(m => ({ default: m.OnboardingFlow })))
const ReflectionModal = lazy(() => import('./components/reflection/ReflectionModal').then(m => ({ default: m.ReflectionModal })))
const GamePage = lazy(() => import('./pages/GamePage').then(m => ({ default: m.GamePage })))
const LearnPage = lazy(() => import('./pages/LearnPage').then(m => ({ default: m.LearnPage })))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })))
const TheoryPage = lazy(() => import('./pages/TheoryPage').then(m => ({ default: m.TheoryPage })))
const RangesPage = lazy(() => import('./pages/RangesPage').then(m => ({ default: m.RangesPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center" role="status" aria-label="読み込み中">
      <span className="inline-block w-6 h-6 rounded-full border-2 border-brass-400/30 border-t-brass-300 animate-spin" />
    </div>
  )
}

export default function App() {
  const page = useNavStore(s => s.page)
  const goTo = useNavStore(s => s.goTo)
  const onboardingComplete = useSettingsStore(s => s.onboardingComplete)

  // 初回起動はチュートリアルを最前面に表示 (settingsStore.onboardingComplete で判定)
  if (!onboardingComplete) {
    return (
      <Suspense fallback={<PageFallback />}>
        <OnboardingFlow />
      </Suspense>
    )
  }

  return (
    <AppShell active={page} onNavigate={id => goTo(id)}>
      <Suspense fallback={<PageFallback />}>
        {page === 'game' && <GamePage />}
        {page === 'learn' && <LearnPage />}
        {page === 'analysis' && <AnalysisPage />}
        {page === 'theory' && <TheoryPage />}
        {page === 'ranges' && <RangesPage />}
        {page === 'settings' && <SettingsPage />}
      </Suspense>
      <Suspense fallback={null}>
        <ReflectionModal />
      </Suspense>
    </AppShell>
  )
}
