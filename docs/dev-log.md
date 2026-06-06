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
