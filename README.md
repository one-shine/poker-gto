# GTO Atlas — ポーカー GTO 学習アプリ

PokerSnowie / GTO Wizard ライクな、**ローカル動作のポーカー GTO 学習アプリ**。
6-max ノーリミットホールデムのレンジ・ドリル・push/fold を、解の信頼度を常に正直に表示しながら学べる。
React 19 + TypeScript + Vite の SPA。UI は日本語。完全オフライン動作・アカウント不要・データは端末内のみ。

> 🌐 **公開中(PWA): https://one-shine.github.io/poker-gto/**
> ブラウザで開いてそのまま使えます。インストール可能(Mac/Win は Chrome・Edge の「インストール」、iPhone は Safari の「ホーム画面に追加」)、初回ロード後はオフラインで動作します。
> 検索エンジンには登録していない(`noindex`)ため、URL を知っている人向けの公開です。

> ⚠️ 教育・シミュレーション目的のツールです。実マネーの賭け・換金・賞金は一切ありません。
> 「GTO Wizard」「PokerSnowie」その他のサービスとは無関係であり、提携・推奨関係はありません(各名称は各社の商標)。

## 特徴

- **解の信頼度を正直に表示** — 各局面の解を `source`(GTOソルバー解 / ローカル求解 / 近似)でラベル化し、"GTO最適""絶対" のような断定はしない。push/fold(≤25BB)は exploitability まで出荷する厳密解。
- **コーチング** — EV 損失(BB)とミスのカテゴリを指摘。ミックス戦略(頻度 10% 以上)は正解として扱う。
- **学習ループ** — ライブプレイ → ミス記録 → 弱点分析 → 理論 → ドリル → 反復。プリフロップ/ポストフロップ/push-fold のドリル、100ハンドごとのリフレクション。
- **レンジ可視化** — 13×13 グリッド(混合戦略のセル内スプリット塗り)、レンジ vs レンジのエクイティ分布。
- **2モード** — trainer(vs GTO・既定)/ exploit(vs Fish)。
- **アクセシビリティ** — 色だけに依存せず形状・アイコンを併用(カラーブラインド対応)、タップ域 44px、キーボード操作。

## 技術スタック

| 用途 | 採用 |
|------|------|
| UI | React 19 + Vite |
| 型 | TypeScript 5.8(strict) |
| スタイル | Tailwind CSS 4 + shadcn/ui(ダークモード既定) |
| アニメーション | Framer Motion 12 |
| 状態管理 | Zustand 5 |
| 重計算 | Web Workers: モンテカルロ(エクイティ)+ 自前 TypeScript CFR ソルバー(外部依存ゼロ) |
| 永続化 | IndexedDB(`idb`) |
| テスト | Vitest + Testing Library |

実行時依存はすべて寛容ライセンス(MIT / ISC)。AGPL の postflop-solver は不採用([`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md))。

## セットアップ

```bash
npm install
npm run dev          # 開発サーバー (http://localhost:5173/poker-gto/ — base パスは /poker-gto/)
npm run build        # プロダクションビルド (tsc -b で型チェック込み + vite build)
npm run test         # Vitest 全テスト
npm run type-check   # 型チェックのみ (tsc -b)
npm run lint         # ESLint
npm run build:icons  # PWA アイコン (favicon.svg → PNG) 再生成
```

## アーキテクチャ概要

- **エージェントバス** — 型付き EventEmitter(`AgentBus`)で Dealer / AIPlayer / Coach が pub/sub 連携。
- **依存方向を一方向に固定** — `src/engine/`(純 TypeScript・React 非依存)← `src/lib/solver/`(解供給層)← stores / UI。
- **解の統一窓口** — Coach・対戦相手・可視化はすべて `src/lib/solver/getSolution()` が返す `NodeSolution` を基準にする。
- **6ページ固定** — Game / Learn / Analysis / Theory / Ranges / Settings。

開発規約(コーディング・テスト・ストア構成・スキルレベル/XP)の詳細は [`CLAUDE.md`](CLAUDE.md) を参照。

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | 利用マニュアル(起動・画面・操作・解の信頼度の読み方) |
| [`docs/OVERVIEW.md`](docs/OVERVIEW.md) | 説明資料(ソルバー解説・アピールポイント・開発概要)— PPT 化前提 |
| [`docs/SPEC.md`](docs/SPEC.md) | 製品仕様の正典(スコープ・前提・GTO精度の保証・評価ルール・2モード) |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | 残タスク・課題の一元トラッカー(進捗の正典) |
| [`docs/DESIGN.md`](docs/DESIGN.md) | デザイン仕様(Felt & Brass) |
| [`docs/RELEASE.md`](docs/RELEASE.md) | 公開準備プレイブック(配信・ストア・法務) |
| [`docs/DATA_LICENSE.md`](docs/DATA_LICENSE.md) | データライセンス方針(L1・正典) |
| [`docs/PRIVACY_POLICY.md`](docs/PRIVACY_POLICY.md) | プライバシーポリシー(ドラフト) |
| [`docs/dev-log.md`](docs/dev-log.md) | 開発ログ(試行錯誤・未確定の判断) |
| [`docs/archive/`](docs/archive/) | Phase 1〜6 の実装計画・進捗トラッカー・フェーズ別メモ(完了履歴) |

## 前提・スコープ

6-max NLHE / **100BB 固定 / ノーレーク / キャッシュ / ICM 非考慮**。GTO 精度の対象はヘッズアップ局面のみ
(マルチウェイは「参考値」)。本物の厳密解は push/fold(≤25BB)。100BB の open/3bet は概算 EV 付き近似、
postflop は study 限定のローカル CFR。詳細は [`docs/SPEC.md`](docs/SPEC.md)。

## 配布・プライバシー

- **配布は PWA 一本化** — GitHub Pages で公開し、ブラウザからインストールする方式に統一(Mac/Win ネイティブの Tauri 版は見送り。`src-tauri/` はコードとして残置)。
- **アプリはユーザーデータを一切送信しない** — 状態はすべて端末内(localStorage / IndexedDB)、フォントは自前ホスト、広告・解析なし。
  ただしホスティング先(GitHub Pages / Fastly CDN)には、一般的な Web サーバーと同様にアクセスログ(IP・User-Agent・時刻)が記録される(これはアプリの送信ではなくホストのサーバーログ)。通信は HTTPS。
