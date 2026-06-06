import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGameStore, HERO_ID } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
import { useNavStore } from '../stores/navStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSolution } from '../hooks/useSolution'
import { PokerTable } from '../components/game/PokerTable'
import { BetLine } from '../components/game/BetLine'
import { HandResultOverlay } from '../components/game/HandResultOverlay'
import { ActionPanel } from '../components/game/ActionPanel'
import { GameFooter } from '../components/game/GameFooter'
import { CoachPanel } from '../components/coach/CoachPanel'
import { PostflopReviewPanel } from '../components/coach/PostflopReviewPanel'
import { CoachToast } from '../components/coach/CoachToast'
import { LiveStrategyPanel } from '../components/coach/LiveStrategyPanel'
import { KeyboardHelp } from '../components/game/KeyboardHelp'
import { useProgressStore } from '../stores/progressStore'
import { useSoundEffects } from '../hooks/useSoundEffects'

export function GamePage() {
  useSoundEffects()

  const { gameState, pendingHeroAction, lastResults, lastFeedback, lastHeroDecision, handReview, initialized, initGame, startNewHand, submitHeroAction, dismissFeedback } =
    useGameStore()
  const appMode = useSettingsStore(s => s.appMode)
  const stackBB = useSettingsStore(s => s.stackBB)
  const autoAdvanceSeconds = useSettingsStore(s => s.autoAdvanceSeconds)
  const studyShowStrategy = useSettingsStore(s => s.studyShowStrategy)
  const showPotOdds = useProgressStore(s => s.uiComplexity.showPotOdds)
  const sessionHandCount = useSessionStore(s => s.sessionHandCount)
  const openReflection = useNavStore(s => s.openReflection)

  // 100ハンドごとにセッション振り返りを自動表示 (>0 ガード・節目ごとに一度)
  const lastMilestone = useRef(0)
  useEffect(() => {
    if (sessionHandCount > 0 && sessionHandCount % 100 === 0 && lastMilestone.current !== sessionHandCount) {
      lastMilestone.current = sessionHandCount
      openReflection()
    }
  }, [sessionHandCount, openReflection])

  // 現スポットの解 → 出典を GameFooter に渡す (信頼度の常時表示)
  const { node } = useSolution(pendingHeroAction?.state ?? null, HERO_ID, appMode === 'study')
  const source = node?.source ?? null

  // study: 全フィードバック(correct以外)をパネル表示。play: critical をトーストのみ。
  const showCoachPanel = appMode === 'study' && !!lastFeedback && lastFeedback.kind !== 'correct'
  const showCoachToast = appMode === 'play' && !!lastFeedback &&
    lastFeedback.kind === 'mistake' && lastFeedback.severity === 'critical'

  // 起動時に1度だけ初期化
  useEffect(() => {
    if (!initialized) initGame(stackBB)
  }, [initialized, initGame, stackBB])

  // Space で次のハンドへ (ヒーローの手番でないときのみ)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !pendingHeroAction) {
        e.preventDefault()
        startNewHand()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingHeroAction, startNewHand])

  const handComplete = gameState?.isHandComplete ?? false
  const showStartButton = !gameState || handComplete

  // 卓と操作領域を1グループとして中央寄せするため、卓の高さ = 利用可能高 − 操作領域高 を実測する。
  // (CSS の flex-1 だと卓が全高を占め、操作ボタンが最下部に張り付いて見える R30 の副作用を解消)
  const contentRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const [tableH, setTableH] = useState(() => (typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.6) : 400))
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => {
      const cs = getComputedStyle(content)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const gap = parseFloat(cs.rowGap || '0') || 16
      const avail = content.clientHeight - padY - (actionRef.current?.offsetHeight ?? 0) - gap
      setTableH(Math.max(160, Math.round(avail)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(content)
    if (actionRef.current) ro.observe(actionRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div ref={contentRef} className="flex-1 flex flex-col items-center justify-center gap-3 sm:gap-4 p-3 sm:p-4 min-h-0 overflow-auto">
        {/* テーブル領域: 高さは実測値で固定し、卓を幅×高さの両制約でフィット (R30)。
            操作領域と合わせて中央寄せされる。モバイルは縦長 CSS に任せ高さ自動。 */}
        <div
          className="w-full flex items-center justify-center shrink-0"
          style={!gameState ? undefined : { height: tableH }}
        >
          {gameState ? (
            <PokerTable state={gameState} winnerIds={handComplete ? lastResults?.map(r => r.winnerId) : undefined} />
          ) : (
            <p className="text-zinc-500 tracking-wide">ハンドを開始してください</p>
          )}
        </div>

        {/* D1: 初回の空状態 (まだ1ハンドも回していない) は指針ゼロになりやすいので導線を出す */}
        {sessionHandCount === 0 && showStartButton && (
          <div className="w-full max-w-md shrink-0 rounded-xl border border-brass-500/30 bg-base-800/60 p-4 text-sm leading-relaxed text-zinc-300">
            <p className="font-display font-bold text-brass-200 mb-1.5">はじめ方</p>
            <ol className="list-decimal list-inside space-y-1 text-zinc-300">
              <li><strong className="text-zinc-100">New Hand</strong>(または Space キー)で最初のハンドを開始。</li>
              <li>アクション後、<strong className="text-zinc-100">コーチ</strong>が「なぜ」を解説します(スタディモードはその場、プレイモードはハンド後に復習)。</li>
              <li>分からない用語は <strong className="text-zinc-100">理論</strong> タブの用語集で確認できます。</li>
            </ol>
          </div>
        )}

        {/* 結果 / コーチ / アクション領域: 縮まずに常に表示される (卓が先に縮む) */}
        <div ref={actionRef} className="w-full flex flex-col items-center gap-3 shrink-0">
        {/* B2: ハンド内アクション履歴 (ストリート別ベットライン)。履歴が空なら null=非表示。
            U7: モバイルは卓の各シートが直近アクションを出すため冗長 + 場所を取るので非表示 (sm 以上のみ)。 */}
        {gameState && (
          <div className="hidden sm:block w-full max-w-2xl">
            <BetLine state={gameState} />
          </div>
        )}

        {/* ショーダウン結果 */}
        {handComplete && gameState && lastResults && (
          <HandResultOverlay results={lastResults} players={gameState.players} />
        )}

        {/* play モード: ハンド後に postflop をソルバーで復習 (実ボードを on-demand 求解) */}
        {handComplete && appMode === 'play' && handReview && handReview.length > 0 && (
          <div className="w-full max-w-md">
            <PostflopReviewPanel key={handReview.length + '-' + (gameState?.handId ?? '')} decisions={handReview} />
          </div>
        )}

        {/* コーチフィードバック (study)。ミスは「次へ」まで保持 (一時停止)、mixedは自動再開。 */}
        {showCoachPanel && lastFeedback && (
          <CoachPanel
            feedback={lastFeedback}
            onDismiss={dismissFeedback}
            autoAdvanceSeconds={lastFeedback.kind === 'mistake' ? 0 : autoAdvanceSeconds}
          />
        )}

        {/* アクション領域 */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-3">
          {showStartButton ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startNewHand}
                className="group relative min-h-12 px-8 rounded-xl brass font-display font-extrabold tracking-wide shadow-[0_6px_20px_rgba(212,175,55,0.3),inset_0_1px_0_rgba(255,255,255,0.5)] hover:brightness-110 active:translate-y-px transition-all"
              >
                New Hand <span className="font-data text-ink/60 text-xs font-bold">(Space)</span>
              </button>
              <KeyboardHelp />
            </div>
          ) : pendingHeroAction ? (
            // U8: アクション前は戦略を見せない (事前に答えを見ないで自分で判断させる)。打ってから答え合わせ。
            <ActionPanel pending={pendingHeroAction} onAction={submitHeroAction} />
          ) : (
            <>
              {/* U8: 自分が打った後に GTO 戦略を答え合わせ表示 (study + 表示ON のとき・+A2 ポットオッズ)。
                  事前に見せないので精度サンプルにも入る (markHinted しない)。OFF=純粋にテスト。
                  ミス/学習(CoachPanel 表示中)は答えが出るので reveal は出さない (モバイルの二重パネル回避・U7)。 */}
              {appMode === 'study' && studyShowStrategy && lastHeroDecision && !showCoachPanel && (
                <LiveStrategyPanel
                  pending={lastHeroDecision.payload}
                  allowLiveSolve
                  showPotOdds={showPotOdds}
                  revealActed={lastHeroDecision.action}
                />
              )}
              <p className="text-zinc-500 text-sm">相手の番です…</p>
            </>
          )}
          {/* ハンド進行中はいつでも中断して次のハンドへ移れる導線 (途中で終われない問題の解消) */}
          {!showStartButton && (
            <button
              type="button"
              onClick={startNewHand}
              aria-label="このハンドを中断して新しいハンドを開始"
              className="min-h-8 px-2 text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
            >
              ↻ 新しいハンド(このハンドを中断)
            </button>
          )}
        </div>
        </div>
      </div>

      {/* play モード: critical のみトースト (非ブロッキング) */}
      {showCoachToast && lastFeedback && (
        <CoachToast feedback={lastFeedback} onDismiss={dismissFeedback} />
      )}

      <GameFooter source={source} />
    </div>
  )
}
