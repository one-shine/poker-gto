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
