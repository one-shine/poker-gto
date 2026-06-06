---
tags: [dev-log]
app: poker-gto
date: 2026-05-30
---
# poker-gto 開発ログ

開発中の試行錯誤・未確定の判断はここに書く。
固まった再利用知見は /harvest で brain/30_Tech_Notes/ に蒸留する。

## 設計判断

## TODO

## 試行錯誤ログ

### [auto] 2026-05-31 セッション変更ファイル
- `CLAUDE.md`
- ※自動収集。要点・設計判断は手動で追記し、固まったら `/harvest poker-gto` で蒸留する。

### 2026-06-06 GitHub Pages 公開 (PWA一本化)
- **配布先の選定**: Cloudflare Pages はリポジトリを private のまま使え商用フレンドリーだが、最終的に GitHub Pages を採用。public ソース公開を許容する判断（ユーザー選択）。
- **private では不可**: Free プランでは private リポジトリで Pages を有効化できず 422 を確認 → リポジトリを public 化して対応。
- **Pages 有効化**: `build_type=workflow` で有効化。
- **サブパス対応**: プロジェクトサイトのため `base='/poker-gto/'`。manifest / service worker / inject の相対パス化で固め、`index.html` に `%BASE_URL%` を導入。検索除けに `noindex` meta を追加。SW 登録は `import.meta.env.BASE_URL` 経由に。
- **自動デプロイ**: `.github/workflows/deploy-pages.yml` を追加。main への push で build → Pages 公開。
- **PWA一本化**: Tauri はデプロイ計画から降格（src-tauri/ はコードとして保持・ビルド/配布はしない）。
- **結果**: https://one-shine.github.io/poker-gto/ で稼働（HTTP 200 確認）。338 テスト green。
- **収益化の注意**: 本格収益化するなら Cloudflare Pages へ移行（base を `'/'` に戻す1行のみ）。
- **フォローアップ**: deploy-pages.yml / ci.yml の actions が Node20 で deprecation 警告 → @v4→@v5 へ更新する。
  - ✅ **対応済(2026-06-06)**: 実体の最新メジャーを裏取りし、`checkout`/`setup-node` は @v6、Pages 系ペア(`upload-pages-artifact`/`deploy-pages`)は @v5 へ更新(checkout/setup-node は既に v6 が最新で、当初メモの @v5 想定より進んでいた)。これで Node24 ランタイムへ移行し、2026-06-16 の Node20 強制廃止に先んじて解消。設定は最小構成(`node-version:'22'`/`cache:npm`/`path:dist`)のため破壊的変更の影響なし。残: 実 CI で緑を確認。
  - ⚠ **CI 赤の別要因を発見**: actions 更新後の CI で `checkout/setup-node/lint/build/test` は全 success だが **Audit ステップが failure**。原因は actions 無関係で、`vitest`/`@vitest/ui`(3.2.4)の critical 2件(GHSA-5xrq-8626-4rwp)を `npm audit --audit-level=high` が検知。dev 依存で本番非同梱。修正は `vitest@4.1.8` への破壊的更新が必要 → BACKLOG E「CI: npm audit 失敗(vitest 脆弱性)」に記録、別タスクで対応。

### 2026-06-06 ゲーム UX 是正(U7/U8/U9 ・スマホ中心)
- **U7 アクション履歴がスマホで邪魔**: `BetLine` を `GamePage` で `hidden sm:block`(モバイル非表示)。卓の各シートが直近アクションを出すので冗長。
- **U8 GTO戦略の事前表示で答えが先に見える**: study の戦略パネルを「アクション**前**の常時表示」→「アクション**後**の答え合わせ」へ。
  - `gameStore` に `lastHeroDecision`(打った payload+action を保持)を追加。`submitHeroAction` で記録、`HAND_START`/`resetGame` でクリア。
  - `LiveStrategyPanel` に `revealActed?` を追加(ヘッダ「答え合わせ — あなた: ◯◯」)。reveal 時は `markHinted` しない=**事前に見せないので精度サンプルに入る**(測定が正直に)。
  - `GamePage`: `pendingHeroAction` 中は `ActionPanel` のみ(戦略非表示)、打った後の「相手の番」中に reveal。
  - 既知の穴: 自分の決定がそのままハンド終了(HU リバーのコール等)する局面は reveal が出ず結果/復習に委ねる。
- **U9 相手アクションが速すぎる**: 「間」を読める速さへ(fish 550–1100 / gto 650–1300ms・従来比約2倍)。
  - 遅延算出を engine から **UI 層(`gameStore`)へ移設**(engine の設定非依存を維持)。`settingsStore.aiSpeed`(slow1.7 / normal1 / fast0.5)を emit 時に読むので再初期化なしで即反映。
  - engine の `fishDelayScheduler`/`gtoDelayScheduler` は残置(未使用)。
- **設定 UI**: 「相手アクションの速さ」3択を追加。study 戦略トグルの文言を「常時表示」→「アクション後の答え合わせ」に是正。
- **検証**: 型 0・**全 338+1=新規テスト含め緑**(`LiveStrategyPanel` に reveal モードのテスト追加)。`npm run build` 緑。

### 2026-06-06 ゲーム卓のモバイル収まり是正(U10・Playwright 実測)
- **症状(スマホ)**: 「自分のカードとアクションボタンが重なる」「スクロールしないと全体が見えない」。
- **原因**: デスクトップだけ `useContainSize` で幅×高さ両フィットさせ、モバイルは CSS `aspect-[5/6]`(幅基準)で**高さ無制約** → 卓が縦に溢れ、`top:90%` のヒーロー席(固定サイズ)が卓ボックス下にはみ出してアクション領域に重なっていた。
- **対応**:
  - モバイルも `useContainSize(isMobile?5/6:16/9)` で利用可能高さにフィット。`GamePage` の測定高さ `tableH` を**モバイル卓コンテナにも付与**(従来 `isMobile||!gameState?undefined` を `!gameState?undefined` に)。`GamePage` の `isMobile` は不要になり削除。
  - `SEAT_POS_MOBILE`: ヒーロー 90→86、上席 8→13、左右席を上げて分離。`PlayerSeat` のヒーローカードを compact 時 md→sm に縮小(席が小さくなり重なり減)。
- **検証**: Playwright を local dev(390/360/430 幅 × 640–844 高 + デスクトップ1280)で駆動し bounding box 実測。全モバイルサイズで **no-scroll**・**札↔ボタン gap 5–21px**・**上端見切れ解消**・ヒーロー↔側席の重なり解消(360幅のみ側席バッジが軽微近接)。デスクトップ回帰なし。型0/lint0/test339緑/build緑。

### 2026-06-06 残バックログ一括(U4/U5/U6/U11/U12)— 計画ワークフロー + 順次実装
- **進め方**: 4並列の計画ワークフロー(各機能の現状コード精査→構造化計画)を回し、ファイル競合を避けて U11→U6+U12→U4→U5 の順に実装・検証・コミット。最後に Playwright で全UI目視。
- **U11 データ移送**: `src/lib/storage/dataTransfer.ts`(exportAll/importAll・3 persist 先を束ね・完全ローカル・version 検証/部分インポート)+ SettingsPage に書き出し/読み込み。
- **U12 レンジ選択**: 27ピル羅列→種別×シナリオ2段選択。`preflop.ts` に `scenarioKind/scenarioOpponent/scenariosOfKind`(id規則・単一の真実源)。RangeVsRange は optgroup 化。
- **U6 ヒートマップ**: `RangeGrid` に `heatmap`(off/raise/call)。暗→色の濃淡+角に頻度%+グラデ凡例。**EV は出さない**(approximate 規約・RangeCell に EV 無)→頻度のみ。
- **U4 ドリル成績**: 新規 `drillStore`(IndexedDB)。byKind/byBucket/recent。3パネルで `recordDrill`。`evLossFrom`(postflop/pushfold のみ)。Dashboard/DrillTab に表示。
- **U5 ハンド履歴**: `HandSummary` 型 + `sessionStore.handSummaries`。gameStore で純損益算出(netBB=グロス受取−拠出、拠出=開始−終了stack)。History に勝敗/純損益/ミス印、HandReplay にミス→理論/ドリル導線。handId 突合・旧履歴は degrade。
- **検証**: 型0・lint0・**全359テスト緑**(+20: dataTransfer6/preflop.helpers4/drillStore5/evLoss3/sessionStore+2)。Playwright で 5機能すべて実機表示確認(ヒートマップ・2段選択・ドリル成績カード・履歴の勝敗バッジ+⚠+理論/ドリル導線・設定ボタン)。
- **設計判断**: ドリルは集計軸が MistakeCategory に乗らない(postflop=street/potType, pushfold=role/stack)ため progressStore 拡張でなく専用 `drillStore`。純損益は「配当を stack に戻さない」実装前提(将来 payout を stack 反映する変更が入ると二重計上 → gameStore に理由コメント)。
