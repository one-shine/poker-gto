# 残タスク・課題 — 一元トラッカー

> **このファイルの役割**: これから着手しうる残タスク・課題の**唯一の集約**。進捗の正典。
> Phase 1〜6 の主要スコープは完了済み(完了の経緯は [`./archive/`](./archive/))。ここには**残っているものだけ**を書く。
> 凡例: 状態 ⬜ 未着手 / 🔄 進行中 / 🧊 凍結(環境制約・別軸) ／ 担当 = 👤 ユーザー判断 / 🤖 実装作業。
> 関連: 製品仕様 [`./SPEC.md`](./SPEC.md) / 公開準備プレイブック [`./RELEASE.md`](./RELEASE.md)。

---

## 0. バグ・気になる点(プレイ検証で発見)

> 実際に触って見つかった不具合・UX の引っかかりをここに集約しトリアージする。新しく気づいたら追記。
> フォーマット: **現象 / 重大度(🔴致命 🟠中 🟡軽)/ 状態(⬜未対応 🔄対応中 ✅修正済)/ メモ(再現・原因・対応)**。
> 修正したら ✅ にして1行残す(履歴)。設計レベルの大物は A〜D の該当セクションへ移す。

| # | 現象 | 重大度 | 状態 | メモ(再現・原因/対応) |
|---|------|--------|------|----------------------|
| U1 | コーチのアドバイスがすぐ消えて読みきれない | 🟠 | ✅ | 2026-05-31: `CoachToast` 5.5→8s + ホバー中は自動消滅停止 / `CoachPanel` もホバー停止(ミスは元々「次へ」まで残る)。 |
| U2 | GTO アドバイスが「対象外」になる局面の理由が不明 | 🟡 | ✅ | 2026-05-31: 対象外メッセージに理由(マルチウェイ=3人以上 / 未収録 / 盲対盲 / 深いレイズ応酬)を明示。スキップ自体は誤評価回避のため意図的。 |
| U3 | ハンドの途中で終われない / 次へ進めない | 🟠 | ✅ | 2026-05-31: 進行中に「↻ 新しいハンド(このハンドを中断)」ボタンを常時表示(`GamePage`)。 |
| U4 | 学習ドリルの履歴が残らない | 🟠 | ⬜ | ドリルは `addXP` で XP を加算するだけで、試行回数・正誤・カテゴリ別成績を永続化していない(`progressStore` は XP/level のみ・drill 専用記録なし)。→ カテゴリ別の試行/正解数・直近結果を `progressStore` か新規 `drillStore` に永続化し、ドリルタブ/ダッシュボードに表示。 |
| U5 | ハンド履歴が並ぶだけで使い道がない | 🟠 | ⬜ | 現状 `handHistory`(ActionRecord 列)を一覧 + `HandReplay`(アクション再生)のみ。勝敗・自分のミス・GTO ライン比較が無く学びに繋がらない。→ 案: 各ハンドに勝敗/ミス印、ミス→該当ドリル・理論へ導線、「コーチ付きで再求解」。要設計判断(価値が薄ければ縮小/統合も検討)。 |
| U6 | レンジ表をもっと一目で分かる色分けに | 🟡 | ⬜ | 現状 `RangeGrid` は既にアクション頻度のスプリット塗り(R=緑/C=青/F=暗灰)+ R/C/M トークン。さらに「一目で」分かる工夫の余地: アクション色のコントラスト強化 / raise頻度・EV・ハンド強度のヒートマップ表示オプション / 凡例の明確化 / ポジション横断の比較ビュー。**着手時に「ネットで見た例」(URL/サービス名)を共有してもらえると最短で寄せられる。** |

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
| 静的ホスティング(HTTPS)へデプロイ | ✅ | 🤖 | **GitHub Pages 稼働中(2026-06-06)** <https://one-shine.github.io/poker-gto/>。下記「Web アプリ化 = GitHub Pages 公開」参照。 |
| PRIVACY_POLICY の確定 + 公開 URL 化 | 🔄 | 👤 | 事業者名・連絡先・施行日を確定([`./PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) はドラフト)。 |
| 本番 Sentry DSN 配線 | ⬜ | 👤 任意 | エラー境界+クラッシュレポート基盤は実装済み(既定 OFF・`VITE_SENTRY_DSN` 設定時のみ)。 |
| Capacitor で店舗配信 | ⬜ | 👤 任意・後日 | 同じ `dist/` を WebView でラップ(~3-5日)。Apple Developer($99/年)+ Google Play($25)。年齢区分申告(Apple 17+ / Google Teen)+ ストア素材。手順は [`./RELEASE.md`](./RELEASE.md) §1/§2/§5。 |
| 国際化(英語化) | ⬜ | 👤 任意 | 現状 UI は日本語のみ。市場拡大用。 |

> 収益化(広告)を入れる場合は同意管理(CMP/ATT)・子ども向け除外・ギャンブル隣接の配信制限が発生する。当面は無償・広告なしが店舗摩擦最小([`./RELEASE.md`](./RELEASE.md) D3 推奨)。

### Web アプリ化 = GitHub Pages 公開 ✅ 稼働中(2026-06-06)

> **公開URL(稼働中・HTTP 200 検証済)**: <https://one-shine.github.io/poker-gto/> — noindex で検索除外・PWA インストール可(Mac/Win=Chrome/Edge「インストール」, iPhone=Safari「ホーム画面に追加」)。
>
> **決定の経緯**: 「自分だけ非公開」は GitHub Pages(Free)では不可と確認(`422 your current plan does not support GitHub Pages for this repository` = private repo 非対応 → public 化必須)。代替の Cloudflare Pages(private 維持可)も提示したうえで、ユーザー判断で **GitHub Pages 公開 + 検索除外(noindex)** を採用。Mac/Win ネイティブ(Tauri)は不要化し **PWA 一本化**(`src-tauri/` はコードのみ温存・ビルド対象から外す)。
>
> - **公開URL**: `https://one-shine.github.io/poker-gto/`(プロジェクトサイト = サブパス配信)。ルーター不使用なので SPA フォールバック不要・バックエンド無し・`SharedArrayBuffer` 不使用で COOP/COEP 不要。
> - **検索除外**: robots.txt は**ホスト単位**でしか効かず、配置できるのは `…/poker-gto/` 配下のみ=無効 → `index.html` に `<meta name="robots" content="noindex,nofollow">`。**URL を知る人はアクセス可・検索には出ない**(完全な非公開ではない)。
> - **代償**: **ソースコードが public 化**(誰でも閲覧/clone 可)。データライセンスは L1=`self-generated`/`original` のみ・第三者ソルバー出力非同梱のため公開可([`./DATA_LICENSE.md`](./DATA_LICENSE.md))。
>
> **実装タスク(🤖)** — 全完了(commit `556bbf8`):
> - [x] `vite.config.ts` `base='/poker-gto/'`(サブパス配信。custom domain にするなら `/` に戻すだけ)
> - [x] サブパス耐性: `index.html` 公開資産を `%BASE_URL%` 化 / `manifest.json` 相対URL化(start_url/scope/icons/screenshots)/ `sw.js` SHELL を相対パス化 / `inject-sw-precache.mjs` を `./assets/` / `main.tsx` SW 登録を `import.meta.env.BASE_URL` 基準
> - [x] `index.html` に noindex メタ追加
> - [x] `.github/workflows/deploy-pages.yml`(main push → build → Pages 自動デプロイ・upload-pages-artifact@v3/deploy-pages@v4)
> - [x] repo public 化 + Pages 有効化(Source: GitHub Actions・`build_type=workflow`)
> - [x] 検証: 並列ワークフローで build+dist パス確認・338テスト緑・lint0、初回デプロイ成功・本番URL HTTP 200 + 資産/manifest/sw すべて 200 を実測。
>
> **残ノート**: deploy-pages.yml も既存 ci.yml と同様 actions が Node20(@v4)で deprecation 警告(2026-06-16 以降 Node24 強制)。E節「CI ハードニング(@v4→@v5)」で deploy-pages.yml も対象に含める。
>
> **将来オプション(今回スコープ外)**: (a) 再デプロイ時の SW stale 対策(`sw.js` no-cache 配信 + 新版検知→リロード促し)/ (b) URL ルーティング(現状 `App.tsx` の `page` 状態で戻る/共有リンク不可・必要なら hash 同期の小改修)/ (c) クラウド同期(認証+バックエンド DB=新規プロジェクト規模)。

---

## D. 配布(Mac ローカル / iPhone / Windows)

> **✅ 現行配信は C節のとおり PWA一本化で GitHub Pages 公開済(2026-06-06)** <https://one-shine.github.io/poker-gto/>。本節の Tauri デスクトップ/Capacitor は**歴史的経緯・将来オプション**として保持(現行の配布対象ではない)。Mac/Win ネイティブは見送り(`src-tauri/` はコードのみ温存)。
>
> 現状はクライアント完結の Vite SPA(PWA 足場・manifest・sw.js・アイコン・自前ソルバー・オフライン可)。
> `dist/` を共通成果物として「包み方」を変えるだけ。
> **方針(2026-05-31 決定)**: **iPhone は PWA で行く**(Safari「ホーム画面に追加」)。ネイティブ iOS(Capacitor / Tauri iOS = App Store)は当面**見送り**。公開は iPhone 個人確認後。
> iPhone PWA に必要なのは **HTTPS 配信**のみ: 個人確認 = `cloudflared` 等の HTTPS トンネル経由で Safari → ホーム画面に追加 / 恒久 = 静的ホスティング(E② / C節)。共通土台(フォント/オフライン/screenshots)は完了済み。

### 共通土台(PWA を実質完成)— ✅ 完了(2026-05-31・dynamic workflow + Playwright 検証)
- **Web フォントのセルフホスト** ✅ — `@fontsource-variable/{hanken-grotesk,bricolage-grotesque,jetbrains-mono}` + `@fontsource/zen-kaku-gothic-new`(japanese/latin 400/500/700)を `src/main.tsx` で import、`index.html` の Google Fonts CDN(preconnect+stylesheet)を削除、`index.css` の @theme family 名を可変フォントの **" Variable" サフィックス**に整合(=最大の落とし穴を回避)。**Playwright 実測: 外部フォントリクエスト 0 件・4フォント全て同一オリジンから適用**。woff2 計 3.1MB(和文 ~2.9MB が支配的)。
- **オフライン動作** ✅ — `public/sw.js` をビルド後フック `scripts/inject-sw-precache.mjs` で dist の woff2 17件をプリキャッシュ注入(完全オフライン保証)。`build` = `tsc -b && vite build && node scripts/inject-sw-precache.mjs`。dist に Google Fonts 参照ゼロを確認。
- **`manifest.screenshots`** ✅ — `public/screenshots/{mobile-1(390×844),desktop-1(1280×800)}.png` を Playwright で撮影し manifest に narrow/wide で登録。
- **GTO戦略パネルのアイコン是正** ✅ — `LiveStrategyPanel` の `📊` 絵文字を lucide 風インライン SVG(バーチャート・`navItems` と同書式)に置換。
- 検証: **338テスト緑・型0・lint0・build緑**。

> ✅ **完了(2026-06-06)**: 静的ホスティング(HTTPS)= GitHub Pages 公開済。iPhone は公開 URL を Safari で開き「ホーム画面に追加」。

### 配布パス(土台の後・必要になったら選定)
| パス | 対象 | アカウント/$ | 別OS機 | 主作業 |
|------|------|------------|--------|--------|
| **① PWA**(最有力・個人/ローカル) | Mac/Win=Edge/Chrome「インストール」, iPhone=Safari「ホーム画面に追加」 | 不要・$0 | 不要 | HTTPS 配信 or localhost。共通土台で実質完成 |
| **② Tauri デスクトップ** ✅Mac | Mac(.dmg/.app)=**実装済** / Windows(.msi)=未 | 署名時 Apple ID $99 / Win 証明書(任意) | **Win は要 Windows/CI** | `src-tauri/` 追加済・`npm run tauri:build`。下記「実装」参照 |
| ③ Capacitor / Tauri iOS(ネイティブ)🧊 見送り | iPhone(App Store) | **Apple $99 必須** | **要 Mac + Xcode** | **当面見送り(2026-05-31)= iPhone は PWA 方針**。将来 App Store 配布が必要になれば: wrapper + 署名 + 審査(simulated gambling=17+ 申告)。手順は [`./RELEASE.md`](./RELEASE.md) §1/§2/§5。`capacitor://`/`tauri://` で sw.js 無効化要。 |

> Electron は Tauri の代替(楽だが ~100MB+)。Android は Capacitor で iOS と同時に出せる(Google Play $25・要 screenshots)。

### Tauri デスクトップ実装 ✅ Mac(2026-05-31)
- `src-tauri/`(Tauri v2)を追加。**`npm run tauri:dev`**(開発・ホットリロード)/ **`npm run tauri:build`**(配布物生成)。
- 成果物: `src-tauri/target/release/bundle/macos/GTO Lab.app`(16MB)+ `.../dmg/GTO Lab_0.1.0_aarch64.dmg`(**約11MB の単一ファイル = 「1ファDLで実行」**)。Rust コンパイル ~57s。
- `tauri.conf.json`: frontendDist=`../dist` / beforeBuildCommand=`npm run build` / window 1200×820(min 900×600)/ CSP=null(起動優先・後で厳格化可)/ identifier `com.gtolab.app`(商標 L4 は後で変更可)。
- `src/main.tsx`: Tauri 配下(`__TAURI_INTERNALS__` 検出)では SW を登録しない(資産バイナリ同梱で不要・stale 回避)。**Web/PWA 経路は不変**(ブラウザでは従来どおり SW 登録)。
- 前提: Rust(rustup)導入済・Xcode あり・Apple Silicon。`src-tauri/target` `gen` は gitignore。検証: 338テスト緑・lint0・build緑・bundle 生成確認。
- 残(任意): **Apple Developer ID 署名 + notarize**(未署名は初回起動で「未確認の開発元」警告 → 右クリック→開く で回避)/ **Windows ビルド**(要 Windows マシン or CI・同手順)/ CSP 厳格化。

---

## E. CI/CD・リリース運用

> 現状 CI(GitHub Actions・`.github/workflows/ci.yml`): push/PR で lint → build(tsc -b)→ test → `npm audit`。緑で稼働中。**CD(自動デプロイ/配布)は未整備**。
> 「うまく回す」の具体像は要決定(下記候補)。

| 項目 | 状態 | 担当 | メモ |
|------|------|------|------|
| CI ハードニング | ⬜ | 🤖 | Node20 actions 非推奨警告の解消(`ci.yml` と `deploy-pages.yml` 両方の `actions/checkout`・`setup-node`・`upload-pages-artifact`・`deploy-pages` を @v4→@v5、2026-06-16 で Node24 強制)/ npm・cargo キャッシュで高速化 / 重い CFR テストの安定化(testTimeout 45s 済)。 |
| CD: PWA 自動デプロイ | ✅ | 🤖 | **稼働中(2026-06-06)**。main push → `deploy-pages.yml` で build → Pages 自動公開(初回デプロイ成功確認)。下記 C節「Web アプリ化 = GitHub Pages 公開」が正典。 |
| CD: Mac+Windows 配布物の自動ビルド(Tauri) | 🧊 見送り | 🤖 | **2026-06-06 降格**: 配布は PWA一本化(C節・GitHub Pages 公開済)に決定 → Tauri ネイティブ配布は見送り・本項目は保留(再開時は以下の旧計画)。<br>旧計画(2026-05-31): `v*` タグ push をトリガに GitHub Actions の**マトリクス**で自動ビルド → GitHub Releases に自動添付。<br>・`macos-latest` → `.dmg`/`.app`(aarch64)<br>・`windows-latest` → `.msi`/`.exe`(NSIS)。Windows は WebView2 標準搭載で追加不要<br>・新規 `.github/workflows/release.yml`。`tauri-apps/tauri-action` で build+Release 添付を一括(各 runner で `npm run tauri:build`)<br>・署名は別途・未署名でも動作(Mac=Gatekeeper / Win=SmartScreen 警告のみ)。Intel Mac も配るなら x86_64/universal を追加<br>・既存 `ci.yml`(lint/build/test)はそのまま、本ワークフローは tag 時のみ起動 |
| リリースのバージョニング | ⬜ | 🤖 | `package.json` / `tauri.conf.json` の version 統一 + tag → Release のフロー化。 |

> **方向決定済(2026-05-31)**: ③ **tag → Mac `.dmg` + Windows `.msi` を CI マトリクスで自動ビルド → GitHub Releases**(上記「✅採用」行)。これで Mac だけで Windows 版まで配れる。
> ①CI ハードニング・②PWA 自動デプロイは未判断(別途)。実装は別タスクで着手予定。

---

## 対象外(判断済み・やらない)

- **WASM / COOP-COEP / SharedArrayBuffer**: 自前 TS ソルバーで非依存のため不要(R29)。`archive/` の WASM 関連項目(postflop-solver 配線等)は採用しない。
- **マルチウェイポットの GTO 精度**: 設計ルール4で意図的に除外(「参考値」と表示)。
- **プリフロップの 4bet/5bet・スクイーズ・ミニレイズ戦略**: スコープ外。
- **可変スタック深さ**: 100BB 固定が前提(push/fold ドリルのみ 5〜25BB を別途提供)。
