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

### 2026-06-06 スマホ scroll(iOS 100vh)/レンジ data/対象外整理 + 残注記
- **U13 scroll(a+d)**: スマホで「レンジ等が下まで見れない/ゲームで操作までスクロールが要る」原因は AppShell の `h-screen`。iOS の 100vh は URL バー込みで可視領域より高く、下端のナビ/ボタンが画面外に。→ `h-dvh`(+ `#root` 100dvh フォールバック / ErrorBoundary `min-h-dvh`)。全ページ + ゲームを一括解消。Chromium では dvh==vh のため Playwright では再現不可だが、定石の修正。
- **U14 レンジ data(b)**: `utgOpen`/`mpOpen` の suited ace 中抜け(A8s/A7s/A6s 飛ばし)を補完。ドリフトガードの widthPct 更新(utg .134 / mp .176)。R4 一括置換方針は不変=アーティファクト是正のみ。
- **U15 対象外(c)→B 実装**: 設計ルール4どおり、マルチウェイで HU レンジを「参考値」表示するよう実装。
  - 設計: **表示経路と精度経路を分離**。`resolveSpotKey(state, hero, { multiwayReference })` を追加し、表示(`useSolution`→`LiveStrategyPanel`)だけが cold-call ありの defense を `multiway:true` で解決。`CoachAgent`/`GTOPlayerAgent` はオプション無し=従来どおり null で除外(ルール4の精度除外 4a を不変に保つ)。
  - `getSolution` は `spot.multiway` のとき共有インスタンスを mutate せずコピーに `multiwayReference:true` を付与。`LiveStrategyPanel` は「マルチウェイ=参考値」バッジ+注記、EV 非表示。
  - multiway 判定は activeCount でなく「defense で cold-call が居るか」。RFI の背後ブラインドを誤って multiway 扱いしない(初版のバグを修正)。
  - 残: 未収録ディフェンス(MP vs UTG 等)・盲対盲・squeeze は依然レンジ自体が無く対象外(R4で拡充)。テスト+3。
- **残注記の片付け**: U8(自分の手でハンド終了する局面でも答え合わせを New Hand 上に表示=共通化した `strategyReveal` を hand-complete branch にも描画)/ U7(モバイル非表示で解消・トグル不要と判断)/ U10(360幅の側席近接は最小幅制約上の許容)。
- **検証**: 型0・lint0・全テスト緑・build緑。

### 2026-06-06 U17 フォールド後スキップ / U18 オッズ目安の常時併記
- **U17**: フォールド後は残りの AI を遅延0で即決着。`gameStore` にモジュールフラグ `heroFoldedThisHand`(`submitHeroAction(fold)` で立て・`HAND_START`/`resetGame` でリセット)、`delayScheduler` が遅延0へ分岐。結果表示→手動 New Hand。U16 ポーズ→「次へ」→瞬時決着の順。store の `gameState` は AI ハンドラ登録順で1手 stale になるためフラグ方式で同期。
- **U18**: `LiveStrategyPanel` に共通 `OddsGuide` を導入し GTO に常時併記(バー下=副 / 対象外=主)。コール直面=ポットオッズ/必要勝率/勝率→コール有利・フォールド寄り、チェック局面=エクイティ強弱。注意書きを1行に簡潔化(要望)。`useEquity` 常時化・`showPotOdds` prop 廃止(GamePage 受け渡しも除去)。ミス時は CoachPanel が答えを出すため reveal は出さない設計は維持。
- **検証**: 型0・lint0・全365テスト緑(U17/U18 のテスト更新+追加)・build緑。Playwright で対象外スポットの reveal に OddsGuide(エクイティ強弱・短い注意書き)が主表示されることを実測。U17 は unit test(フォールド→遅延0で即決着・handCount===1)で確証。

### 2026-06-06 オッズ学習の組み込み(オッズドリル + 答え合わせ→理論リンク)U19
- **オッズドリル**: 新規 `lib/drill/oddsDrill.ts`(純計算・ソルバー不要)。3種=必要勝率 B/(P+2B)/コール判断(勝率vs必要勝率)/アウツ→勝率(×2/×4)。`generateOddsQuestion`/`judgeOdds`、検証用の `meta` 付き。`OddsDrillPanel`(PushFold をテンプレ)は種別 seg・正誤+計算解説・`TermChips`+`ConceptLink('pot-odds')`、`drillStore.recordDrill(kind:'odds')`。
- **既存資産の再利用**: 理論 `pot-odds`・用語集(ポットオッズ/エクイティ/アウツ/EV)・`TermChips`/`ConceptLink`・`drillStore`(U4)。`DrillKind` に `'odds'` 追加、`LearnPage` の DrillTab に4つ目タブ+`DRILL_KIND_JP`/`DRILL_KINDS`(ダッシュボード/通算が自動対応)。
- **ゲーム側の導線**: `LiveStrategyPanel` の `OddsGuide`(U18)に `ConceptLink('pot-odds', 'オッズの理論 ▶')`+用語チップ。答え合わせのオッズ目安から理論/用語へ。
- **検証**: 型0・lint0・全372テスト緑(oddsDrill 6 + LiveStrategyPanel リンク+2)。build緑。Playwright で「学習→ドリル→オッズ」タブ→必要勝率の問題に正解→計算解説+用語チップ+関連理論→pot-odds 理論ページ遷移・通算成績記録を実測。

### 2026-06-06 CI(vitest 4.x で audit 緑化)+ 事前計算 postflop ライブラリ(代表ボードドリル)
- **CI**: `vitest`/`@vitest/ui` を `^3.2.4 → ^4.1.8`(semver-major)に更新し GHSA-5xrq-8626-4rwp(critical 2件)を解消。`npm audit --audit-level=high` 0件・CI Audit 緑。vitest4 が node 型を transitive 供給しなくなり、scripts/.cache を読む2 test(attachHeuristicEV/heuristicPreflopEV)が `node:fs` 等を解決できず型エラー → ファイル局所に `/// <reference types="node" />` を付与(app 全体の types へ node を足すと本番 src へ process/Buffer が漏れバグを隠すため、影響を test に閉じ込め)。commit `0ea891c`。
- **事前計算 postflop の設計判断**: ゲームもドリルも盤面はランダム(`shuffledDeck(rng)`)→ 完全一致の事前計算解はランダム盤面にほぼヒットしない。ランダム盤面をカバーするにはテクスチャ近似(カードアブストラクション)が要るが、それは**ルール1の正直表示に抵触**(近似を厳密と称せない)。→ 正直に価値が出る「こちらが盤面を選ぶ場面」=**代表ボードドリル**に限定(ユーザー承認済)。
- **正直なストリート**: river=後続なし=厳密 / turn=完全チャンスCFR(river 全48 runout 織り込み)のみ `solver_precomputed` と名乗れる。flop は ~13% 下限(アブストラクション構造)で対象外=従来通りライブ/近似。
- **実装**: ① `postflopNode.ts` に hero ノード特定(`heroNodeTarget`/`findHeroNode`)+ combo 行正規化(`comboActionsAt`・bet→raise)を抽出し、ライブ経路 `solveRiverSpot` をリファクタ(挙動不変・既存137テスト緑)→ スクリプトと共有しドリフト防止。② `representativeBoards.ts`(代表テクスチャ turn4/river4 + `representativeHeroCombos`= 事前計算と同一の narrow/cap でドリルの hero 抽選を必ずヒットさせる)。③ `getSolution` postflop に precomputed テーブル参照(盤面/pot/stack/betFrac 完全一致時のみ・**any mode で動く**=モバイル/オフライン可)。④ `scripts/precompute-postflop.ts`(オフライン生成・turn は iters160/cap64 で exploit 1〜2%台=ライブturn8%超を大幅改善 / river <1%)。⑤ ポストフロップドリルに「代表ボード」トグル+テクスチャ表示+厳密解バッジ。
- **オフライン高品質**: ライブの時間予算(turn=40iters/cap50→8.4%)に縛られず、turn を 160iters/cap64 に上げて 1〜2%台へ。cap は O(combos²) なので 110/400 だと 0.6% だが 74s/spot と過大 → 64/160(≈12s/spot・1.8%)を採用。全64ファイル ≈7分のワンタイム生成。
