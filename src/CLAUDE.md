# フロントエンド規約 (src/)

## GTOレンジ JSON フォーマット

```json
{
  "position": "BTN",
  "scenario": "open",
  "stackDepth": 100,
  "raiseSize": 2.5,
  "metadata": { "source": "original", "license": "original", "version": "1.0" },
  "cells": {
    "AA":  { "hand": "AA",  "raise": 1.00, "call": 0.00, "fold": 0.00 },
    "AKs": { "hand": "AKs", "raise": 1.00, "call": 0.00, "fold": 0.00 },
    "72o": { "hand": "72o", "raise": 0.00, "call": 0.00, "fold": 1.00 }
  }
}
```

各JSONに `metadata.source` / `metadata.license` / `metadata.version` を必ず含める。
**`license` は商用公開の根幹** (`docs/DATA_LICENSE.md` L1)。自社所有は `self-generated` (自前ソルバー生成) / `original` (手作りオリジナル)。他社ソルバー出力 (GTO Wizard 等) は同梱禁止。

### ソルバー解の供給 (Phase 3.5〜)

GTO評価の基準は `src/lib/solver/getSolution()` が返す `NodeSolution` (`src/types/solver.ts`)。
手作りレンジ (`data/ranges/preflop.ts`) は移行用の暫定で、取込済みスポットは
`data/solutions/**` の実ソルバー解 (`source: 'solver_precomputed'`) に置換する。
**`source` を UI に常時明示** (solver_precomputed / solver_live / approximate)。
`approximate` のときは EV数値を出さず「参考(GTO非準拠)」バッジのみ。

## 実装済みモジュール早見表 (stores / lib) — 毎フェーズ更新

### stores/
- `gameStore.ts` ✅ — `useGameStore`, `HERO_ID`。state: `gameState / pendingHeroAction / lastResults / handCount / initialized`。
  actions: `initGame(stackBB?)`, `startNewHand()`, `submitHeroAction(action, amount?)`。
  bus/dealer はモジュールスコープ保持(再レンダーで再生成しない)。`pendingHeroAction != null` で ActionPanel 表示。
- `settingsStore.ts` ✅ — `useSettingsStore` (persist key `poker-gto-settings`)。
  `appMode`('play'|'study'), `opponentMode`('trainer'|'exploit', 既定exploit), `stackBB`, `autoAdvanceSeconds`(既定5), `studyShowStrategy`(アクション後の答え合わせ表示・U8), `aiSpeed`('slow'|'normal'|'fast', 既定normal・相手の間・U9), `onboardingComplete` + 各セッター。型 `AppMode`/`OpponentMode`/`AiSpeed` をexport。
- `sessionStore.ts` ✅ — `useSessionStore` (persist IndexedDB `poker-gto` / key `poker-gto-session`)。セッション統計・ミス記録・`handSummaries`(勝敗/純損益・U5)・`gtoAccuracy()`(ヒント済みハンドは精度から除外)・`recordEvaluation()`。
- `progressStore.ts` ✅ — `useProgressStore`。レベル/XP・ミス履歴。スキル昇格(beginner→pro)を駆動。
- `drillStore.ts` ✅ — `useDrillStore` (persist `poker-gto-drill`)。ドリル試行/正誤を種別(preflop/postflop/pushfold/odds)・bucket 別に永続化(U4/U19)。

### components/game/
- `CardDisplay.tsx` ✅ — `<CardDisplay card faceDown size>` (size: sm/md/lg)。♠♥♦♣+赤/黒、裏面、T→"10"、`role="img"`+aria-label。
- `PlayerSeat.tsx` ✅ — `<PlayerSeat player isActing revealCards lastAction>`。type `SeatLastAction` export。hero表/相手裏(reveal対応)、手番リング、オールイン、フォールド減光。
- `PokerTable.tsx` ✅ — `<PokerTable state>`。楕円テーブル + seatIndex絶対配置(SEAT_POS) + 中央ポット/ボード + ディーラーボタン + ショーダウンでカード公開。
- `ActionPanel.tsx` ✅ — `<ActionPanel pending onAction>`。Fold/Check·Call/Bet·Raise動的切替、プリセット(preflop=BB / postflop=%·Pot·Overbet·All-in)、スライダー、キーボード f/c/r/Enter。ベット計算は engine `getTotalPot` 使用。
- `coach/SpotPanel.tsx` ✅ (U25・LiveStrategyPanel/ReasoningGuide を統合) — 局面説明を1パネルに集約。`phase='decision'`(手番前・既定折りたたみ・開くとオーバーレイで卓を潰さない)= 考え方観点 + `OddsGuide`(1回)+「GTOの答えを見る」(押すと頻度+EV表示し `markHinted`=精度除外) / `phase='review'`(打った後・自動展開)= 答え合わせ(`StrategyBars` 頻度+EV)+`OddsGuide`(1回)+「あなた:◯◯」。`buildDecisionGuidance`(答え中立の観点)を decision で利用。純テスト(`studyShowStrategy=false`)では答え欄を出さない。
- `coach/OddsGuide.tsx` ✅ — ポットオッズ/必要勝率/勝率(+ null 時の理由)の共有部品。SpotPanel 内で1回だけ描画(前後の重複を解消)。
- `coach/CoachPanel.tsx` / `coach/CoachToast.tsx` / `coach/StrategyBars.tsx` ✅ — 評価フィードバック(study=パネル/play=criticalトースト)+ 頻度バー(色+ラベル併記)。
- `GameFooter.tsx` ✅ — `<GameFooter source?>`。「6-max キャッシュ · {stackBB}BB · ノーレーク · ICM非考慮」常時バー + source信頼度(✓本物/△近似、色非依存)。クリックで前提条件モーダル(Escで閉)。

### components/layout/ · onboarding/ · pages/
- `AppShell.tsx` ✅ — `<AppShell active onNavigate>{children}`。`PageId`型 / `NAV_ITEMS` export。desktopサイドバー+mobileボトムタブ、6タブ、aria-current+アイコン+ラベル(色非依存)。
- `OnboardingFlow.tsx` ✅ — `<OnboardingFlow onComplete?>`。5画面(ようこそ/ポジション/グリッド凡例R·C·M/モード/開始)、戻る·次へ·スキップ、完了で `completeOnboarding()`。
- `pages/GamePage.tsx` ✅ — PokerTable + ActionPanel(study はアクション前に SpotPanel `decision`=考え方、後に SpotPanel `review`=答え合わせ・U8) + GameFooter統合。起動時initGame、source解決→Footer、ショーダウン結果、Space=New Hand。CoachPanel(study)/CoachToast(play critical)。アクション履歴(BetLine)は卓の各シートが直近アクションを出すため冗長 + 場所を取るので廃止(U7)。
- `App.tsx` ✅ — PageId状態でページ切替。onboardingComplete=false時 OnboardingFlow最前面。未実装ページはComingSoonプレースホルダー。

### ビルド/テスト設定 (Step 13で整備)
- `npm run build` = `tsc -b && vite build`。`tsc -b` が本当の型チェック (厳格: erasableSyntaxOnly/verbatimModuleSyntax)。旧 `tsc --noEmit` はルート設定で実質ノーチェックだったので使わない。
- `npm run type-check` = `tsc -b` / `npm run test` = `vitest run` を追加済み。
- `vite.config.ts` は plugins のみ。test設定は `vitest.config.ts` に分離 (rolldown-vite と vitest 同梱 vite の Plugin 型衝突回避)。

### lib/solver/ (Phase 3.5)
- `getSolution(spot, { allowLiveSolve? }) → Promise<NodeSolution|null>` ✅ — 統一供給窓口。preflop(precomputed優先→近似)/ postflop(代表盤の precomputed 最優先 → turn/river live solve。**flop も代表10盤×10スポットは precomputed=賭け考慮済**・2026-06-13)。push/fold等 scenario外 precomputed も配給。
- flop 事前計算基盤 ✅ (2026-06-13・`docs/SOLVER.md`) — `chanceCfr.ts` カーネル最適化(intカード/Float64Array/eq dedup・9.8倍)+`fastEval7.ts`(eq構築46倍)+`suitIsomorphism.ts`(スート同型縮約・on/off で解は厳密一致)+DCFR opt-in。`scripts/precompute-flop.ts`(worker_threads並列・再開可能・exploit>5%は書き出さないハードゲート)で 200テーブル量産済(exploit 中央値0.02%・最大0.06%)。
- `resolveSpotKey(state, heroId) → SpotKey|null` ✅ — リンプ/単独レイザー/マルチウェイ判定でスポット解決。
- `fromRangeScenario(scenario) → NodeSolution` ✅ — 手作り近似→解(`source:'approximate'`)橋渡し。
- `pushFold.ts` ✅ (R4) — `solvePushFold(eq, params)`。HU プッシュ/フォールド Nash をカテゴリ別 fictitious play で求解。`CATEGORIES`(169)・`AVAIL`(blocker期待値)。**厳密GTO**(ショーダウン=オールイン勝率=真値)。
- `preflopEquity.ts` ✅ (R4) — `buildEquityMatrix`/`pairEquity`。169カテゴリ間オールイン勝率を seeded MC で構築(再現可能)。
- `scripts/solve-pushfold.ts` ✅ (R4) — 上2者で `hu-pf-*.json`(`solver_precomputed`)生成。勝率行列は `scripts/.cache`(gitignore)。
- `solverClient.ts` + `workers/solver.worker.ts` ✅ (自前CFR Worker)。`scripts/import-ranges.ts` ✅ (取込器・L1ガード付)

## UIの主要挙動

### モード (2軸)

```typescript
type AppMode = 'play' | 'study'        // フィードバックの濃さ
// play:  最小 (critical のみ sonner トースト)。ハンドが止まらない。
// study: major以上で一時停止 → CoachPanel。live solve 可。
//        「次へ →」or settingsStore.autoAdvanceSeconds (既定5秒) で再開

type OpponentMode = 'trainer' | 'exploit'  // 対戦相手 (GTO Wizard 流の中核)
// trainer: 相手=gto_ai (NodeSolution頻度サンプリング)。GTO評価が方法論的に整合。既定。
// exploit: 相手=fish_ai (リーク持ち)。実戦的だが固定解突合は「GTO近似に照らすと」表記。
```

### プログレッシブUI開示

```typescript
interface UIComplexity {
  showPotOdds: boolean         // intermediate 以上で ON
  showBoardAnalysis: boolean   // intermediate 以上で ON
  showRangeAdvantage: boolean  // advanced 以上で ON
  showMixedStrategies: boolean // pro のみ ON
}
// PlayerProgress.level に応じて settingsStore が自動で切り替える
```

### キーボードショートカット

| キー | アクション |
|------|-----------|
| `f` | フォールド |
| `c` | チェック/コール |
| `r` | レイズ |
| `Enter` | アクション確定 |
| `Escape` | パネルを閉じる |
| `Space` | 次のハンドへ |
| `?` | GTOパネル表示切替 |

### AIアクションタイミング・フィードバック

```
相手の「間」(normal基準・aiSpeedで倍率 slow1.7 / normal1 / fast0.5):
GTO AI:  650–1300ms (ランダム)
Fish AI: 550–1100ms (やや速め)
※ 遅延は gameStore (UI層) で算出し emit 時に aiSpeed を読む (engine は設定非依存)。U9。

フィードバック上限: study=最大3件/ハンド、play=最大1件/ハンド
優先度: MistakeCard (EV損失大) > MomentLesson > TermOfSession
```

## モバイル対応指針 (PWA/Capacitor拡張に備える)

### サイズ指定

px固定を避け `rem` / `%` / `vw` / `vh` / Tailwindレスポンシブクラスを使う。

```tsx
// Bad
<div style={{ width: '800px', height: '500px' }}>
// Good
<div className="w-full max-w-4xl aspect-[16/10]">
```

### 13x13 レンジグリッド

```tsx
<div className="overflow-auto touch-action-auto">
  <div className="grid grid-cols-13 min-w-[280px]">
    {/* 最小セルサイズ min-w-[1.8rem] min-h-[1.8rem] */}
  </div>
</div>
```

### タッチ操作

- タップターゲット最小 `44×44px` (Apple HIG / Material Design 基準)
- アクションボタン (Fold/Call/Raise) は特に大きめに確保
- hover依存のUI (tooltip等) にはタップでも同等の情報が得られる代替手段を設ける

```tsx
// TermTooltip: hover + tap 両対応
onClick={() => setOpen(true)}
onMouseEnter={() => setOpen(true)}
```

### ナビゲーション

```tsx
<Sidebar className="hidden md:flex" />       {/* デスクトップのみ */}
<BottomTabBar className="flex md:hidden" />  {/* モバイルのみ */}
```

### セッション保存

```typescript
// モバイルは beforeunload が発火しないため visibilitychange も併用
window.addEventListener('beforeunload', saveCheckpoint)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveCheckpoint()
})
```
