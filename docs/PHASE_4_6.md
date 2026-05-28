# Phase 4.6: 公開準備ハードニング(品質・UX)

> 親計画: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) / レビュー: [RELEASE_READINESS.md](RELEASE_READINESS.md)
> Phase 4 完了後の自己レビューで判明した、すぐ直せる品質/UX 問題をまとめて潰すミニフェーズ。
> 本丸のコンテンツ拡充(ポストフロップ・実ソルバー)は Phase 3.5/5/6 で対応。

## 目標
低リスクな修正で「公開水準のコード品質と一貫した UX」を確保する。

## ステップ

### R9 — Lint をクリーンにする (最優先・即時)
現状 `npm run lint` が7件失敗:
- `react-hooks/set-state-in-effect` ×3: `GamePage`(setSource)、`ActionPanel`(setAmount リセット)、`LiveStrategyPanel`(setNode/setLoading)
  → 派生stateは effect 内 setState ではなく、レンダー中の算出 or イベントハンドラへ。非同期取得(LiveStrategyPanel)は AbortController + 適切な依存に整理。
- `@typescript-eslint/no-explicit-any` ×2 + 未使用 `_opts` ×1: `getSolution.ts`(`_opts` を実際に使う/`GetSolutionOptions` を活かす)、`HandReplay.test` の `any`。
- `react-refresh/only-export-components` ×1: `AppShell.tsx` が `NAV_ITEMS`/型と component を同居 → 定数を別ファイル(例 `navItems.ts`)へ分離。
- 完了条件: `npm run lint` がエラー0。

### R5 — セッション統計の永続化
`sessionStore` を `persist`(localStorage)化、またはハンド完了ごとに最小スナップショットを保存。
- リロードで GTO精度・ハンド履歴・ミスが消えない。
- `hintedHandIds` は Set のため persist 時にシリアライズ対応(配列⇄Set)。
- 恒久的な IndexedDB 移行は Phase 5。本フェーズは localStorage で耐性確保。

### R6 — study モードの精度測定 UX
常時戦略表示=全ハンド hinted 除外で、study では GTO精度が常に N=0 になる問題。
- 案A: study に「テストモード」トグル(戦略を隠し測定する)を追加。
- 案B: ダッシュボードに「精度は play モードで測定」を明示しつつ、study では別指標(学習ハンド数等)を表示。
- いずれかを採用し、ユーザーが「なぜ —/N=0 か」で戸惑わないようにする。

### R7 — study モードの実「一時停止」
現状はミス時に CoachPanel を表示するだけでエンジンは進行する。
- `gameStore` に一時停止フラグを設け、study でミス(major+)時は **次の `ACTION_REQUIRED`/AI送出をブロック**、「次へ」で再開。
- 実装案: CoachAgent が FEEDBACK_READY(mistake) を出した時に gameStore が `paused=true` にし、AI スケジューラ/Dealer 進行を保留。`dismissFeedback` で解除して保留アクションを流す。
- 注意: エンジンは同期設計。保留は UI 層(スケジューラ注入)で実現し、engine 純粋性は維持する。

## 検証
1. `npm run lint` — エラー0
2. `npm run test` / `npm run build` — 全通過・成功
3. Playwright: ハンドをプレイ→リロード→精度/履歴が残る(R5)。study でミス→ハンドが止まり「次へ」で再開(R7)。精度表示の文脈が明確(R6)。

## 進捗
- [x] R9 Lint クリーン — `useSolution` フック抽出(GamePage/LiveStrategyPanel の async setState 集約)、ActionPanel スライダーをsetState-during-render化、`navItems.tsx` 分離(AppShell から NAV_ITEMS/ICONS/型)、eslint で `_`引数許容、テストの any 除去。`npm run lint` エラー0。
- [x] R5 セッション永続化 — sessionStore を persist(localStorage, key=poker-gto-session)。hintedHandIds(Set)は partialize/merge で配列⇄Set。履歴は上限50。リロードで精度/履歴/ミス残存を実機確認。
- [x] R6 精度測定 UX — settingsStore に studyShowStrategy(既定ON)。OFFでstudyでも戦略を隠し精度測定。SettingsPageにトグル(学習/精度測定)、ダッシュボードの精度説明を明確化。実機確認(OFFで戦略非表示+evaluatedCount計上)。
- [x] R7 実一時停止 — gameStore に pause ゲート(emitQueue)。AIスケジューラを gated 化し、study で major+ ミス時 setPaused(true)で AI送出を保留、dismissFeedback(「次へ」)で flush再開。startNewHand/resetGame で解除。engine純粋性維持。実機確認(ポット停止→次へで進行)。
