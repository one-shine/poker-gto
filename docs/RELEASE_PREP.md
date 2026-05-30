# 公開準備プレイブック (B. 商用公開)

> 製品品質(A)は学習アプリとして公開水準に到達済み。本書は**配信・ストア・法務**の実務playbook。
> 調査根拠は 2026-05-30 の店舗ポリシー/Capacitor リサーチ + コード監査(下部「出典」)。
> 親トラッカー: [RELEASE_READINESS.md](RELEASE_READINESS.md) B 節。

---

## 0. あなたが決める3つの判断 (DECISION MEMO)

| # | 判断 | 推奨 | 理由・含意 |
|---|------|------|-----------|
| **D1 配信方式 (T1)** | **PWA-first** | 既に manifest+sw.js+icons があり**即配信可**。審査キュー・$99/年・15-30%手数料なし・更新即時。Capacitor は店舗プレゼンスが欲しくなったら後から同じ dist で追加(~3-5日) |
| **D2 アプリ名 (L4)** | 「**GTO Lab**」(manifest 既定) で進める | 既に決定済(manifest=「GTO Lab — ポーカーGTO学習」)。**残=商標調査のみ**(あなた): 「GTO Lab」の各国商標衝突を確認。"GTO Wizard"/"PokerSnowie" は他社商標→**非提携を明示**(下記 L4 文言) |
| **D3 収益化 (M1/M2)** | **当面は無償(広告なし)** を推奨 | 広告はギャンブル隣接で配信制限・同意管理(P2)・ストア審査が重くなる。**購入通貨を作らない**現設計が店舗摩擦最小。収益化するなら買い切り/サブスク/レンジパック販売を、PWA→Capacitor 移行後に |

> D3 を「無償・広告なし」にする限り、P2(同意バナー)・P3(子ども広告)・M1/M2 は**不要**になり公開が大幅に簡素化する。

---

## 1. 配信方式 (T1) — PWA-first

### 現状(コード監査)
- ✅ `public/manifest.json`(name=「GTO Lab — ポーカーGTO学習」/ standalone / icon-192・512 maskable / theme `#18181b`)
- ✅ `index.html`(apple-touch-icon / apple-mobile-web-app-capable / viewport-fit=cover)
- ✅ `public/sw.js`(app shell キャッシュ・navigation=network-first・hashed asset=SWR・本番のみ登録)
- ✅ **完全オフライン動作可**(初回ロード後・全状態ローカル)

### PWA 公開前に埋める gap(小)
- [ ] `manifest.screenshots` 追加(**Google Play PWA で必須**・モバイル/デスクトップ各1枚以上)
- [ ] (任意) `manifest.scope` / `shortcuts`(ホーム長押しの主要導線: ゲーム/ドリル)
- [ ] ホスティング(静的: Vercel/Netlify/Cloudflare Pages いずれか)+ HTTPS + 独自ドメイン

### Capacitor で店舗配信する場合(後日・~3-5日)
同じ `dist/` を WebView でラップ。手順:
```
npm i @capacitor/core && npm i -D @capacitor/cli
npx cap init "GTO Lab" com.<you>.gtolab
# capacitor.config の webDir を "dist" に
npm run build
npm i @capacitor/ios @capacitor/android
npx cap add ios && npx cap add android
npx cap sync            # build のたびに
npx cap open ios / android  # Xcode / Android Studio で署名・archive→提出
```
- 前提: Apple Developer($99/年)+ Google Play Console($25)。
- ⚠ **要確認**: Capacitor は `capacitor://` ローカルオリジンで配信するため、現 `sw.js`(cache-first)が**ネイティブで stale/ルーティング問題**を起こしうる→ネイティブビルドでは SW を無効化 or スコープ限定。WASM/Worker は WebView で動作継続。

---

## 2. ストアポリシー対応 (S2) — simulated gambling

**判定: 両ストアとも一般に許可**(実マネー無し=ギャンブルではない)。ただし**「シミュレーテッド・ギャンブリング」コンテンツ**として扱われる。

- **年齢区分(安全側で計画)**: Apple **17+**(実カード配布のテーブルは "Frequent/Intense Simulated Gambling" 該当・全地域で17+自動付与)/ Google **Teen(13+)**(IARC で simulated gambling reference を正直申告)。
- **必須明示**(アプリ内 + ストア説明 + 申告):
  - 実マネーの賭けは一切無く、現実価値の賞金・換金も無い(教育・娯楽目的)。
  - 仮想チップに現実価値は無く換金不可。
  - IARC(Google)/ Apple 年齢区分アンケートを**正直に**回答(申告自体が必須メタデータ)。
- **却下リスクと回避**:
  - 年齢区分の過少申告 → 正直に回答(実カード配布=Apple 17+ 想定)。
  - 実マネー/賞金を匂わせる表現 → 全排除。
  - 購入通貨を非Apple決済で販売 → **そもそも購入通貨を作らない**(現設計が回避済)。
  - "casino" / "win money" / "real money poker" 等の語 → 使わず「GTO トレーナー / 戦略学習 / ポーカー study」で訴求。
  - sweepstakes/賞金/換金機構 → 一切入れない(Google 2025-10 で sweepstakes を licensed-gambling 側へ厳格化)。

---

## 3. プライバシー開示 (S3 / P1) — 「データ収集なし」

コード監査の実態(全てローカル・運営者は取得しない):
- localStorage `poker-gto-settings`(設定)/ `poker-gto-progress`(XP・レベル・統計)
- IndexedDB `poker-gto-session`(ハンド履歴≤1000・ミス・evalByPosition 等)
- **外部送信**: ① Google Fonts CDN(IP がフォント配信元 Google に到達)② 任意 Sentry(`VITE_SENTRY_DSN` 設定時のみ・既定OFF)。解析トラッカー無し。

### Apple Privacy Nutrition Label(申告)
- **Data Not Collected**(運営者はデータを収集しない)で申告可。
- ⚠ クリーンに「第三者送信なし」と言い切るには **Google Fonts をセルフホスト**するのが確実(現状は CDN→IP到達)。Sentry を本番で有効化する場合は "Crash Data / Diagnostics" を申告。

### Google Data Safety
- **No data collected / No data shared**。
- 同上の Google Fonts CDN 注記。本番 Sentry を入れるなら "Crash logs"(任意・匿名)を申告。

→ **推奨アクション**: 公開前に **Web フォントをセルフホスト**(`@fontsource/*` 等)し「第三者送信ゼロ」を成立させる。`docs/PRIVACY_POLICY.md` は作成済(事業者名・連絡先・施行日のみ要確定)。

---

## 4. ブランド非提携 文言 (L4)

アプリ内(設定 or About)+ ストア説明 + ランディングに記載:

> **GTO Lab** は独立した学習用アプリです。実際の金銭を賭けるギャンブル機能・換金・賞金は一切ありません(教育・シミュレーション目的)。
> 「GTO Wizard」「PokerSnowie」その他のサービスとは**無関係であり、提携・推奨関係はありません**。各名称は各社の商標です。

---

## 5. ストア説明文ドラフト (S4)

**タイトル**: GTO Lab — ポーカーGTO学習
**サブタイトル**: 実マネー無しのGTO戦略トレーナー(教育用)

**説明(草案・禁止語回避済)**:
> GTO Lab は、ポーカー(6-max ノーリミットホールデム)の **GTO(ゲーム理論的最適)戦略を学ぶための学習・シミュレーションアプリ**です。実際の金銭の賭けや換金は一切なく、教育・練習を目的としています。
>
> ・プリフロップ/ポストフロップのレンジとドリル、push/fold は自前ソルバーの厳密解
> ・各局面の解の信頼度(ソルバー解/近似)を常に正直に表示
> ・コーチが EV 損失とミスを指摘、ポジション別の精度を可視化
> ・完全ローカル動作・アカウント不要・データは端末内のみ
>
> ※ 仮想的な状況の学習ツールであり、賞金や換金はありません。

- 年齢区分: 17+(Apple)/ Teen(Google)。
- スクリーンショット: ゲーム卓 / レンジグリッド / ドリル / 分析 の4枚以上(モバイル縦)。
- サポート URL + プライバシーポリシー URL(`PRIVACY_POLICY.md` を公開ページ化)必須。

---

## 6. 公開前チェックリスト(最短ルート = PWA 無償公開)

- [ ] D2: 「GTO Lab」の商標調査(あなた)
- [ ] Web フォントをセルフホスト(S3 を「第三者送信ゼロ」に)
- [ ] `manifest.screenshots` 追加 + 静的ホスティング(HTTPS)へデプロイ
- [ ] アプリ内に「教育用・実マネー無し・非提携」明示(下記コードで footer 追加済)
- [ ] `PRIVACY_POLICY.md` の事業者名/連絡先/施行日を確定し公開 URL 化
- [ ] (Capacitor で店舗も出すなら)§1 手順 + §2 年齢区分申告 + §5 ストア素材

---

## 出典(2026-05-30 調査)

- Apple App Review Guidelines 5.3 / Apple 17+ simulated gambling(2019-08-20 全地域)
- Google Play: Real-Money Gambling & Contests policy / IARC content rating / 2025-10 sweepstakes 再分類
- Capacitor docs(getting-started / iOS deploy / PWA）
- コード監査: `public/manifest.json` / `public/sw.js` / `index.html` / stores(session/settings/progress) / `lib/monitoring/reporter.ts`
