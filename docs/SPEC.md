# 製品仕様 — ポーカーGTO学習アプリ (GTO Lab)

> **このファイルの役割**: 製品が「いま何であるか / 何を保証し、何を保証しないか」を記述する正典。
> 開発規約(コーディング・テスト方針・エージェント構成)は [`../CLAUDE.md`](../CLAUDE.md)、
> 残タスク・課題は [`./BACKLOG.md`](./BACKLOG.md)、データの権利は [`./DATA_LICENSE.md`](./DATA_LICENSE.md) を参照。
> 実装が進んだ当時の経緯は [`./archive/`](./archive/) に保全。

## 概要

PokerSnowie / GTO Wizard ライクな、**ローカル動作のポーカー GTO 学習アプリ**。
6-max ノーリミットホールデムのプリフロップ/ポストフロップのレンジ・ドリル・push/fold を、
解の信頼度を常に正直に表示しながら学べる。React 19 + TypeScript + Vite の SPA、UI は日本語、完全オフライン動作。

**配信**: GitHub Pages に PWA として公開(<https://one-shine.github.io/poker-gto/>)。静的ホスティング・HTTPS・`noindex`・PWA 一本化。初回ロード後は完全オフラインで動作。

## スコープと前提

| 項目 | 前提 | 備考 |
|------|------|------|
| ゲーム形式 | 6-max NLHE | キャッシュゲーム想定 |
| スタック深さ | **100BB 固定** | 可変深さは将来課題。push/fold ドリルのみ 5〜25BB を別途厳密解で提供 |
| レーキ | **0%(ノーレーク)** | — |
| キャッシュ/ICM | **非考慮** | トーナメント学習用途には不向き |
| GTO 精度の対象 | **ヘッズアップ(HU)局面のみ** | アクティブ3人以上のマルチウェイは GTO 精度計算から除外し「参考値」と表示(設計ルール4) |

全 UI のどこかに「100BB / ノーレーク / キャッシュ / ICM非考慮」と解の `source` を常時表示する。

## GTO 精度の保証(製品の核心)

本アプリは**解の確からしさを隠さず `source` でラベル化する**。"GTO最適""絶対" のような断定表現は使わない。
解は `src/lib/solver/getSolution()` が返す `NodeSolution.source`(`src/types/solver.ts`)に厳密に従って表示する。

| `source` | 意味 | 使用箇所 | UI 表記 |
|----------|------|---------|---------|
| `solver_precomputed` | 同梱の厳密解(信頼度最高) | push/fold ≤25BB(7段階・exploitability 0.0003〜0.0017 BB/hand=near-Nash) | 「**GTOソルバー解**」 |
| `solver_live` | ブラウザ内ローカル CFR 求解 | postflop(river=厳密 / turn=完全チャンスCFR・全48 runout・exploit 4〜5% / flop=エクイティ近似) | 「GTOソルバー解(ローカル求解・簡易)」。flop は「簡易: 賭け未考慮」、turn は「賭け考慮済 (runout 48)」 |
| `approximate_with_ev` | 手作り近似レンジ + 概算 EV | プリフロップ全27スポット(open5 + BB防御5 + 非BB防御6 + facing-3bet11 系)の頻度 + 概算EV | 「GTO近似 + 概算EV」+ EV に `~` プレフィックス |
| `approximate` | 手作り近似(EV なし) | ソルバー未取込・未カバースポット | 「GTO近似レンジ(一般理論ベースの手作り)」。postflop は「参考: GTO非準拠(ヒューリスティクス)」 |

- **本物の厳密解は push/fold(≤25BB)のみ**。100BB の open/3bet は `approximate_with_ev`(概算EV)、postflop は近似入力レンジ上の CFR(study 限定の `solver_live`)。
  → 本アプリは「**GTO 学習ツール**」であり「全局面が GTO 品質のアプリ」ではない。**正直な信頼度表示が強み**。
- 100BB の真 Nash 解への置換は [`./BACKLOG.md`](./BACKLOG.md) A節(R4)を参照(サーバ事前計算級・in-browser 不可)。
- フォールバック専用のヒューリスティクス関数には `// heuristic: not GTO-exact` を必ず付す。

## 学習評価のルール

### EV 損失(第一級の学習信号)
```
evLoss(BB) = max(全アクションのEV) − 選択アクションのEV   // src/types/solver.ts
```
Snowie 流に3段階分類し `MistakeSeverity` にマップ(閾値は settings で調整可能):

| 分類 | severity | evLoss |
|------|----------|--------|
| inaccuracy | minor | 0 < evLoss ≤ 0.5 BB |
| mistake | major | 0.5 < evLoss ≤ 2.0 BB |
| blunder | critical | evLoss > 2.0 BB |

- EV 損失数値はソルバー EV(`solver_*` / `approximate_with_ev`)に基づくときのみ表示。`source: 'approximate'`(EV=0)では数値を出さず、文章フィードバック+「参考(GTO非準拠)」バッジのみ。
- 集計は bb/100 で「精度」と併記。

### 正解判定・ミックス戦略
- `MIXED_STRATEGY_THRESHOLD = 0.10` — 頻度 10% 以上のアクションは正解扱い(ミックス戦略対応)。XP 満額。
- `MIN_SAMPLE_SIZE = 20` — 未満のシナリオは AnalysisPage で「データ不足」バッジ。
- 精度 = コーチ実評価数に対する正解数(ヒント参照ハンドは除外。未評価ポジションは 100% でなく「データ不足」)。

### 集計の例外
- **VPIP の BB チェック扱い**: BB のチェック(アンレイズドポット)は VPIP にカウントしない(標準 HUD 準拠)。

## 対戦相手の2モード

| モード | 相手 | 用途 | コーチ評価 |
|--------|------|------|-----------|
| **trainer**(既定・GTO Wizard 相当) | `gto_ai`(`NodeSolution` を頻度サンプリング) | 最適解との乖離を測る | 両者 GTO 前提で方法論的に整合 |
| **exploit** | `fish_ai`(リーク持ち・コール過多) | 実戦的な練習 | 固定解との突合は「GTO近似に照らすと」表記に留め、対 Fish の最大EV(エクスプロイト)と混同させない |

- 対戦相手は**プリフロップ未オープン時 raise-or-fold(リンプ禁止)**。これによりオープンスポットが「folded-around RFI」として清潔に成立し、`matchScenario` 判定が正当になる。相手にレンジが定まるためエクイティを「vs 相手レンジ」で計算できる。
- `gto_ai` 未カバースポットは事前計算→無ければ heuristic フォールバック(対戦相手のリアルタイム性のため live solve は使わない)。

## ベットサイジング

- オープン: 2x / 2.5x / 3x が標準。**CO は 2.5BB**(2.2BB は実在しないため不採用)。SB open は 3.0BB。
- ActionPanel は **スライダー + プリセットボタンの両方**を必須実装。プリフロップは BB 単位プリセット、ポストフロップはポット% プリセット。相手のベット前=「Bet」、ベット後=「Raise」に動的切替。

## レンジデータの前提

- 同梱する全 GTO 解データの出所は**「自社ソルバーのみ」**(L1 決定)。他社ソルバー出力(GTO Wizard 等)は商用再配布不可のため**同梱禁止**。正典は [`./DATA_LICENSE.md`](./DATA_LICENSE.md)。
- `SolutionMeta.license`(`self-generated` / `original`)・`sourceName`・`version` を必須化。取込器 `scripts/import-ranges.ts` は `--source`/`--license` 必須で既知プロプライエタリ出所を拒否。
- 現代 100BB 6-max GTO の一般理論と突合済み(RFI 頻度の目安: UTG≈16 / MP≈19 / CO≈28 / BTN≈37(combo比)/ SB≈58 / BB防御 ~55%)。レンジ%は combo 比(/1326)を権威メトリクスとして UI と一致させる。

## ページ構成・アーキテクチャ

6ページ固定(GamePage / LearnPage / AnalysisPage / TheoryPage / RangesPage / SettingsPage)。
エージェントバス(Dealer/AIPlayer/Coach)・Zustand ストア・engine←solver←UI の依存方向・Web Worker・IndexedDB 永続化の詳細は [`../CLAUDE.md`](../CLAUDE.md) を参照(本仕様では重複させない)。

## アクセシビリティ

赤/緑だけに依存しない。形状・アイコンを色と必ず併用(カラーブラインド対応)。重大度表示はテキストラベルを併記。タップターゲット 44px 維持。
