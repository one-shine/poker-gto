# Phase 6: ポリッシュ・最適化

> 親計画: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

## 進捗 (2026-05-24) 🔄 第1弾完了

- [x] **ページ遅延ロード**: `App.tsx` を `lazy`/`Suspense` 化。main チャンク 471→334KB、各ページ別チャンク(GamePage 30KB / TheoryPage 16KB 等)。
- [x] **PWA**: `public/manifest.json` + `public/sw.js`(runtime cache: navigate=network-first / 資産=stale-while-revalidate・同一オリジン限定)+ `main.tsx` で本番のみ SW 登録 + `index.html` に theme-color/apple-mobile/manifest/viewport-fit。
- [x] **R10 B1 トータルポット**: `PokerTable` 中央表示を現ベット込み総額に。ライブベット時は「(確定 X ＋ ベット Y)」内訳。テスト契約「ポット {n}BB」維持。
- [x] **R10 B3 勝者ハイライト**: `PokerTable` に `winnerIds`、`PlayerSeat` に `isWinner`(金枠発光 + WINNER バッジ・色覚配慮、hero重複時は「あなた」リボン抑制)。実機確認(SB勝者・総ポット内訳)。
- 検証: lint0 / build成功(chunk分割確認)/ 124テスト。
- **重要な整理(R29)**: WASM/COOP-COEP は**当アプリ不要**(自前TSソルバーで SharedArrayBuffer 非依存)。下記「ソルバー基盤の本番対応」のWASM項目は対象外。
- [x] **R28 D2 モバイルレイアウト(ゲーム表)**: `useIsMobile` フック + `SEAT_POS_MOBILE`(縦長オーバル `aspect-[5/6]`・席を内側へ)。390px で端の見切れ解消・desktop 不変・ポット内訳はモバイル非表示。実機幅スクショ確認。
- **残(Phase 6 第2弾 / 専用)**: **R30 プレイ画面テーブルの流動レスポンシブ化**(固定 `max-w-4xl` の余白をズーム/リサイズ連動に。幅+高さ両制約で実装・過去の失敗履歴は RELEASE_READINESS R30 参照)/ PNGアイコン整備(R27)/ B4 チップ→ポットアニメ・XPBar アニメ / 他ページ実機QA / R2 残りプリフロップ(facing-3bet 等)/ R23 ポストフロップドリル / R14② 完全チャンスCFR / R25 IndexedDB 移行。

## 目標

PWA化。Framer Motionアニメーション。残りシナリオ追加。事前計算ライブラリ拡充。全体UX向上。

## ソルバー基盤の本番対応 (Phase 3.5 の仕上げ)

- **COOP/COEP ヘッダ**: WASMスレッド(SharedArrayBuffer)用に本番ホスティングで
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` を配信。
  Vite dev は `server.headers` で設定。非対応環境はシングルスレッド+遅延警告にフォールバック
- **WASM/ソルバー遅延ロード**: `solver.worker.ts` と WASM バイナリは study mode で初めて必要になるまで
  ロードしない (初期バンドル/モバイルTTI を守る)
- **Service Worker キャッシュ**: WASM バイナリ + `src/data/solutions/**` の JSON をオフライン用にキャッシュ
- **事前計算ライブラリ拡充**: 代表ボードと turn/river 解を追加し live solve 依存を減らす
  (trainer/mobile のカバー率を上げる)

## 実装ファイル一覧

### 新規作成 (3ファイル)
※ トースト通知は Phase 4 で導入した `sonner` を使用 (専用 Toast.tsx は不要)。

| ファイル | 役割 |
|---------|------|
| `public/manifest.json` | PWA マニフェスト |
| `public/sw.js` | Service Worker (オフライン対応) |
| `src/components/ui/XPBar.tsx` | アニメーション付きXPバー |

### 変更

| 対象 | 変更内容 |
|------|---------|
| `src/components/game/CardDisplay.tsx` | カード配布アニメーション (Framer Motion) |
| `src/components/game/ActionPanel.tsx` | ボタンフォーカス・押下アニメーション |
| `src/components/coach/CoachPanel.tsx` | スライドイン (Framer Motion AnimatePresence) |
| `src/components/reflection/ReflectionModal.tsx` | モーダルフェードイン |
| `src/data/ranges/preflop.ts` | 優先度中シナリオ5件追加 |
| `src/engine/agents/CoachAgent.ts` | matchScenario() を拡張 |

## Phase 6 追加シナリオ

`preflop.ts` に追加:
- SB vs CO raise
- BTN vs UTG/MP raise
- CO vs UTG raise
- BTN facing 3bet (vs BB/SB)
- CO facing 3bet

## shadcn/ui 追加 (Phase 4で導入済み、ここでは追加のみ)

```bash
npx shadcn@latest add progress   # XPバー
npx shadcn@latest add tooltip    # 用語集ツールチップ
```

## PWA 設定

```json
{
  "name": "Poker GTO",
  "short_name": "PokerGTO",
  "display": "standalone",
  "background_color": "#18181b",
  "theme_color": "#18181b"
}
```

## パフォーマンス最適化

```typescript
// 各ページを lazy import
const GamePage     = lazy(() => import('./pages/GamePage'))
const LearnPage    = lazy(() => import('./pages/LearnPage'))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'))
const TheoryPage   = lazy(() => import('./pages/TheoryPage'))
const RangesPage   = lazy(() => import('./pages/RangesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
```

## アクセシビリティ最終確認

- 全アクションボタンに `aria-label`
- カード色分け: 記号(♠♥♦♣)で色盲対応済み確認
- **RangeGrid: 各セルに R/C/M 文字トークンを表示** (色のみ依存を解消、CLAUDE.md ルール5)。Phase 2 実装分を要改修
- 重大度表示: 🔴🟠🟡 は色相が近く色盲で判別困難なため、必ずテキストラベル併記を確認
- キーボードナビゲーション全機能で動作確認 (f/c/r/Enter/Space/Escape/?)

## 公開準備レビュー対応 — [RELEASE_READINESS.md](RELEASE_READINESS.md)
- [ ] **R2(残り) プリフロップ全シナリオ網羅**: SB vs CO、BTN vs UTG/MP、CO vs UTG、facing 3bet 等を追加し 21 スポットを概ねカバー。
- [ ] **R10 ポリッシュ**: 勝者ハンドのハイライト(B3)、トータルポット表示(B1)、モバイル実機検証/最適化(D2)。下記 UI改善バックログと同一項目。

## UI改善(参考: クライアント標準 / GTO Wizard) — `docs/DESIGN.md` バックログより

ポリッシュフェーズで取り込む UI 項目(詳細は `docs/DESIGN.md`「UI改善バックログ」):
- [ ] **B1 トータルポット表示**: 中央ポットに現ストリートのベットを含めた total pot を表示(「ポット X(コールで Y)」)。
- [ ] **B3 勝者・勝ち手ハイライト**: ショーダウンで勝った5枚を強調 + ポット獲得アニメ。
- [ ] **B4 ベット→ポットのチップ移動アニメ**: ストリート終了時にチップがポットへ集まる演出。
- [ ] **B5 手番タイマー/クロック**: 発光リングに時間表現を追加(任意)。
- [ ] **B6 ホール/相手カードの配布アニメ**: ボードと一貫した配布演出。
- [ ] **D1 ベットサイズ presets に総額併記**: 「66% (17.5BB)」のように%と総額を視覚表示。
- [ ] **D2 モバイルレイアウト検証/最適化**: 狭幅で `aspect-[16/9]` の6席が潰れる問題。ブレークポイントで縦長/簡略レイアウトへ。
- [ ] **D3 サウンド/ハプティクス**: 任意。

## 検証方法

1. Lighthouse スコア: Performance 90+, Accessibility 95+
2. オフラインでアプリ起動 → Service Worker でキャッシュ提供
3. iPhone Safari でインストール可能なPWAとして動作
4. Framer Motionアニメーションが60fps維持 (DevTools > Performance)
5. Bundle サイズ確認: `npm run build` → dist/ の各chunk < 200KB (WASM/solver は遅延ロード chunk として別計上)
6. COOP/COEP 配信確認 → `crossOriginIsolated === true` でマルチスレッド求解
7. オフラインで study mode の live solve が WASM キャッシュから動作
