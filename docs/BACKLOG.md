# 残タスク・課題 — 一元トラッカー

> **このファイルの役割**: これから着手しうる残タスク・課題の**唯一の集約**。進捗の正典。
> Phase 1〜6 の主要スコープは完了済み(完了の経緯は [`./archive/`](./archive/))。ここには**残っているものだけ**を書く。
> 凡例: 状態 ⬜ 未着手 / 🔄 進行中 / 🧊 凍結(環境制約・別軸) ／ 担当 = 👤 ユーザー判断 / 🤖 実装作業。
> 関連: 製品仕様 [`./SPEC.md`](./SPEC.md) / 公開準備プレイブック [`./RELEASE.md`](./RELEASE.md)。

---

## A. GTO 精度(本丸の残・主に環境制約)

| ID | 課題 | 状態 | 担当 | なぜ残るか / 方針 |
|----|------|------|------|------------------|
| **R4** | 100BB の open/3bet を真 Nash 解(`solver_precomputed`)へ | 🧊 | 🤖 別軸 | 現状はプリフロップ全27スポットを `approximate_with_ev`(概算EV)で公開水準に到達。真 Nash は **postflop EV モデルを伴う厳密解=サーバ事前計算級で in-browser 不可**。push/fold(≤25BB)のみ厳密解済み。手作りレンジの再調整はせず、実データ生成で一括置換する方針(L1=自社ソルバー生成)。出典: `archive/RELEASE_READINESS.md` R4 / `archive/PHASE_3_5.md`。 |
| **flop 完全チャンス CFR** | flop を river ベッティングまで含む厳密 CFR で求解 | 🧊 | 🤖 別軸 | エンジン(`flopSolver.ts` / `chanceCfr.ts`)は実装済みだが、実レンジでの exploitability が **~13% で頭打ち**(反復ではなくアブストラクションの構造的下限)。13% を「GTOソルバー解」と称するのはルール1違反 → flop は引き続きエクイティ近似(「簡易: 賭け未考慮」)で正直表示。前提: サーバ/オフライン事前計算 or カードアブストラクション(スート同型+コンボバケッティング)。turn は完全チャンス CFR 済み(exploit 4〜5%)。出典: `archive/PHASE_3_5.md`「flop 完全チャンス CFR」。 |
| **R16 残ノード** | 再々レイズ(raisesLeft≥2)/ SB コンプリート(リンプドポット)の postflop コーチ | 🧊 | 🤖 defer | ①ツリーが構造的に「レイズ深さ1」で頭打ち(改修3層 + 実戦頻度低=費用対効果低)。②SBコンプリート/BB-vs-complete レンジが未整備で**新規手作り近似が必要**=入力レンジ品質が精度の鎖の根 → **R4(実データ)後**に回すのが効率的。マルチウェイは設計ルール4で意図的に除外。出典: `archive/RELEASE_READINESS.md` R16。 |
| **事前計算 postflop ライブラリ** | 代表ボードの解を JSON 同梱し live solve 依存を減らす | ⬜ | 🤖 任意 | trainer/mobile のカバー率向上。現状は study で都度 live solve。優先度低(機能はすでに成立)。出典: `archive/PHASE_3_5.md` / `archive/PHASE_6.md`。 |

> 監修(随時): 近似レンジ・理論数値は現代 GTO 一般理論と突合済み(R11/R19)。**ソルバー水準の精密化は R4 の領域**で、手作りの再調整はしない方針。既知の近似乖離(bb-vs-btn 3bet が理論より薄い等)も R4 で実解化。

---

## B. 機能の残(Phase 6 系・UI ポリッシュ)

✅ **全項目実装済み**(2026-05-31・dynamic workflow で 4 並列実装 + 統合検証・**338テスト緑・型0・lint0・build緑**):

- **B2** アクション履歴 / ベットライン — `src/components/game/BetLine.tsx`(+test)。ストリート別(プリフロップ/フロップ/ターン/リバー/ショーダウン)にアクション列を色覚配慮アイコン+BB額で表示。GamePage の卓下に常時表示(空履歴は null=非表示)。
- **B5** 手番タイマー — `PlayerSeat.tsx`。手番リングに**控えめな brass スイープ弧**(装飾のみ・非懲罰的=自動フォールド/カウントダウン圧なし・study トレーナー方針)。`prefers-reduced-motion` 尊重。
- **B6** ホール/相手カードの配布アニメ — `PlayerSeat.tsx` + `PokerTable.tsx`(`dealKey={handId}`)。ボード配布と一貫した opacity+y+rotateY の stagger、毎ハンド再生。CardDisplay の role/aria は不変。
- **D1** ベットサイズ presets 総額併記 — `ActionPanel.tsx`。ポストフロップ%プリセットに絶対 BB を2行表示(aria-label 契約は維持)。
- **D3** サウンド / ハプティクス — `src/lib/sound/sound.ts`(Web Audio 合成・外部アセット無し)+ `src/hooks/useSoundEffects.ts`(store 購読で deal/action/win を発火)。**既定 OFF**・SettingsPage にトグル。

> B1/B3/B4/D2/R27/R30 も実装済み(詳細は `archive/RELEASE_READINESS.md` / `archive/PHASE_6.md`)。
> ⇒ **Phase 6 系の UI ポリッシュは完了**。残るは A(GTO精度・主に環境制約)と C(公開準備・主にユーザー判断)。

---

## C. 公開準備(商用B・主にユーザー判断/実務)

> 製品品質(A)は学習アプリとして公開水準に到達済み。以下は配信・ストア・法務の実務。
> 手順・文言・調査根拠の詳細は [`./RELEASE.md`](./RELEASE.md)。最短ルート = PWA 無償公開。

| 項目 | 状態 | 担当 | メモ |
|------|------|------|------|
| L4 アプリ名「GTO Lab」の商標調査 | 🔄 | 👤 | 各国商標 DB 検索は外部作業(本ツール不可)。"GTO Wizard"/"PokerSnowie" は他社商標=非提携を明示済み。 |
| Web フォントのセルフホスト | ✅ | 🤖 | 完了(D 節)。`@fontsource` 化で Google Fonts CDN 排除 → 真のオフライン + 第三者送信ゼロ(Playwright 実測: 外部リクエスト0)。 |
| `manifest.screenshots` 追加 | ✅ | 🤖 | 完了(D 節)。mobile 390×844 / desktop 1280×800 を登録。 |
| 静的ホスティング(HTTPS)へデプロイ | ⬜ | 👤🤖 | Vercel / Netlify / Cloudflare Pages いずれか + 独自ドメイン。 |
| PRIVACY_POLICY の確定 + 公開 URL 化 | 🔄 | 👤 | 事業者名・連絡先・施行日を確定([`./PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) はドラフト)。 |
| 本番 Sentry DSN 配線 | ⬜ | 👤 任意 | エラー境界+クラッシュレポート基盤は実装済み(既定 OFF・`VITE_SENTRY_DSN` 設定時のみ)。 |
| Capacitor で店舗配信 | ⬜ | 👤 任意・後日 | 同じ `dist/` を WebView でラップ(~3-5日)。Apple Developer($99/年)+ Google Play($25)。年齢区分申告(Apple 17+ / Google Teen)+ ストア素材。手順は [`./RELEASE.md`](./RELEASE.md) §1/§2/§5。 |
| 国際化(英語化) | ⬜ | 👤 任意 | 現状 UI は日本語のみ。市場拡大用。 |

> 収益化(広告)を入れる場合は同意管理(CMP/ATT)・子ども向け除外・ギャンブル隣接の配信制限が発生する。当面は無償・広告なしが店舗摩擦最小([`./RELEASE.md`](./RELEASE.md) D3 推奨)。

---

## D. 配布(Mac ローカル / iPhone / Windows)

> 現状はクライアント完結の Vite SPA(PWA 足場・manifest・sw.js・アイコン・自前ソルバー・オフライン可)。
> `dist/` を共通成果物として「包み方」を変えるだけ。
> **方針: 公開は iPhone 個人確認後**(まず共通土台を整え、ホーム画面 PWA で個人検証 → その後に配布形態を選定)。

### 共通土台(PWA を実質完成)— ✅ 完了(2026-05-31・dynamic workflow + Playwright 検証)
- **Web フォントのセルフホスト** ✅ — `@fontsource-variable/{hanken-grotesk,bricolage-grotesque,jetbrains-mono}` + `@fontsource/zen-kaku-gothic-new`(japanese/latin 400/500/700)を `src/main.tsx` で import、`index.html` の Google Fonts CDN(preconnect+stylesheet)を削除、`index.css` の @theme family 名を可変フォントの **" Variable" サフィックス**に整合(=最大の落とし穴を回避)。**Playwright 実測: 外部フォントリクエスト 0 件・4フォント全て同一オリジンから適用**。woff2 計 3.1MB(和文 ~2.9MB が支配的)。
- **オフライン動作** ✅ — `public/sw.js` をビルド後フック `scripts/inject-sw-precache.mjs` で dist の woff2 17件をプリキャッシュ注入(完全オフライン保証)。`build` = `tsc -b && vite build && node scripts/inject-sw-precache.mjs`。dist に Google Fonts 参照ゼロを確認。
- **`manifest.screenshots`** ✅ — `public/screenshots/{mobile-1(390×844),desktop-1(1280×800)}.png` を Playwright で撮影し manifest に narrow/wide で登録。
- **GTO戦略パネルのアイコン是正** ✅ — `LiveStrategyPanel` の `📊` 絵文字を lucide 風インライン SVG(バーチャート・`navItems` と同書式)に置換。
- 検証: **338テスト緑・型0・lint0・build緑**。

> 残(👤): 静的ホスティング(HTTPS)へデプロイ or ローカル配信 → **iPhone Safari でホーム画面に追加して個人確認**(方針どおり公開はその後)。

### 配布パス(土台の後・必要になったら選定)
| パス | 対象 | アカウント/$ | 別OS機 | 主作業 |
|------|------|------------|--------|--------|
| **① PWA**(最有力・個人/ローカル) | Mac/Win=Edge/Chrome「インストール」, iPhone=Safari「ホーム画面に追加」 | 不要・$0 | 不要 | HTTPS 配信 or localhost。共通土台で実質完成 |
| **② Tauri デスクトップ** | Mac(.dmg)+ Windows(.msi) | 署名時 Apple ID $99 / Win 証明書(任意) | **Win は要 Windows/CI** | wrapper + OS別ビルド + 署名/notarize。ネイティブでは sw.js 無効化 |
| **③ Capacitor** | iPhone(App Store) | **Apple $99 必須** | **要 Mac + Xcode** | wrapper + 署名 + 審査。simulated gambling=17+ 申告。手順は [`./RELEASE.md`](./RELEASE.md) §1/§2/§5。`capacitor://` で sw.js 無効化 |

> Electron は Tauri の代替(楽だが ~100MB+)。Android は Capacitor で iOS と同時に出せる(Google Play $25・要 screenshots)。

---

## 対象外(判断済み・やらない)

- **WASM / COOP-COEP / SharedArrayBuffer**: 自前 TS ソルバーで非依存のため不要(R29)。`archive/` の WASM 関連項目(postflop-solver 配線等)は採用しない。
- **マルチウェイポットの GTO 精度**: 設計ルール4で意図的に除外(「参考値」と表示)。
- **プリフロップの 4bet/5bet・スクイーズ・ミニレイズ戦略**: スコープ外。
- **可変スタック深さ**: 100BB 固定が前提(push/fold ドリルのみ 5〜25BB を別途提供)。
