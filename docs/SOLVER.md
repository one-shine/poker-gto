# SOLVER.md — 自前 CFR ソルバー解説

> **このファイルの役割**: 本アプリが内包する自前 TypeScript CFR ソルバーのアルゴリズム・設計・精度に関する解説ドキュメント。各 Phase の実装前後で Before/After と実測値を追記していく。
> 関連: 製品仕様 [`./SPEC.md`](./SPEC.md) / 残課題 [`./BACKLOG.md`](./BACKLOG.md) / データ権利 [`./DATA_LICENSE.md`](./DATA_LICENSE.md)

---

## 1. 業界標準との比較

### 1-1. CFR ファミリーの系譜

| 年 | アルゴリズム | 特徴 |
|----|-------------|------|
| 2007 | Vanilla CFR | 後悔最小化の基本形。全ノードを逐次トラバース |
| 2014 | CFR+ | regret の負値をゼロにクランプ。正の後悔のみ蓄積し収束を加速 |
| 2019 | Linear CFR / Discounted CFR (DCFR) | 反復に線形加重・古い戦略を割り引き。DCFR は加重と割引を組み合わせた変種 |
| — | MCCFR | モンテカルロサンプリングで一部ノードのみ更新。大規模ゲームに有効 |

**本実装の位置づけ**:

- `riverSolver.ts` / `chanceCfr.ts`: regret の負値クランプ実装済み(CFR+系)
- 平均戦略の線形加重(Linear CFR)と DCFR 割引は **Phase 0 で opt-in 実装済み**(DCFR α1.5/β0/γ2 で 50iters 時 0.24%。詳細は 4 節)

### 1-2. 商用ソルバーとの比較

| ソルバー | アーキテクチャ | 主な用途 | 精度感 |
|----------|--------------|---------|--------|
| PioSOLVER | ポストフロップ特化・カードアブストラクションなし・ベットサイズ離散化のみ | HU ポストフロップ解析 | exploitability 0.1〜0.5% pot 水準 |
| GTO Wizard | サーバで事前計算した解を配信・ツリー外の外挿はしない | Web ブラウザで即時参照 | 本アプリの `solver_precomputed` + Phase B EV モデルと同じ思想 |
| MonkerSolver | カードアブストラクション + 大容量 RAM でプリフロップ / マルチウェイを求解 | GTO 研究・大規模ツリー | 大容量環境前提 |
| PokerSnowie | ニューラルネット近似 | 学習・解析 | CFR 厳密系ではない |

> **Phase B の位置づけ**: 「代表サブゲームを解いて EV モデルを保存し手作り戦略に EV を後付け」は GTO Wizard の事前計算解配信思想に近い。ただしこれは完全解ではなく**モデル**(169 カテゴリ抽象・N=60 ボード・固定ベットサイズ)であるため `source` は `approximate_with_ev` に留める(正直表示)。support ゲート(「ソルバーを十分サンプルされた範囲だけ信頼する」)は、商用ソルバーがツリー外を外挿しないのと同じ正直さを実現している。

> **商標注記**: GTO Wizard / PioSOLVER / MonkerSolver / PokerSnowie は各社の商標。本プロジェクトはこれらと提携しておらず、比較は公知情報に基づく事実記述。本アプリの GTO 解データは全て自前ソルバーで生成した自社データのみ([`./DATA_LICENSE.md`](./DATA_LICENSE.md) L1)。

### 1-3. 本実装の正直な位置づけ

**制約条件**:

- ブラウザ同梱・完全自社生成(他社ソルバー出力の同梱禁止)
- Mac 16GB ローカル環境という計算資源制約
- オフライン動作優先(Worker + IndexedDB キャッシュ)

**現状の精度実測値**:

| ストリート / スポット | 精度 | 備考 |
|---------------------|------|------|
| river(ライブ求解) | exploitability < 1% pot | 厳密ショーダウン・CFR+ |
| turn(事前計算) | exploit 1〜2% | 完全チャンス CFR・全 48 runout |
| turn(ライブ求解) | exploit 4〜5% | 同上・リアルタイム制約下 |
| flop offline(全列挙・cap80・100iters) | **0.40%** | Phase 0 実測(2026-06-13)。旧サブサンプル ~13% から大幅改善 |
| flop offline(全列挙・cap80・250iters) | **0.06%** | 同上・高精度モード |
| push/fold ≤25BB | exploitability 0.0003〜0.0017 BB/hand | 厳密解・near-Nash |

**本アプリは「GTO 学習ツール」であり「全局面が GTO 品質のアプリ」ではない**。`source` によって確からしさを常に UI に明示し、誇張表現は使わない(CLAUDE.md 設計ルール1)。

---

## 2. アーキテクチャ概要

### 2-1. ソルバーファイル構成

```
src/lib/solver/
├── riverSolver.ts      CFR+(チャンスノードなし)。600 iters。< 1% pot
├── turnSolver.ts       chanceCfr を使った完全チャンス CFR。turn のみ
├── chanceCfr.ts        turn / flop 共有コア。チャンス層の深さに非依存
├── flopSolver.ts       2 層チャンス(turn×river)。事前計算専用
├── getSolution.ts      統一供給窓口(precomputed > live > 近似 の優先順)
├── solverClient.ts     Worker への橋渡しクライアント
├── solveCache.ts       L1 メモリ + L2 IndexedDB の永続キャッシュ
└── pushFold.ts         HU push/fold Nash(fictitious play・厳密解)
```

### 2-2. 各ソルバーの役割と精度

**`riverSolver.ts` — CFR+・厳密ショーダウン**

- リバー(board=5枚)を対象。チャンスノードが存在しないため最も高精度。
- ショーダウンは `HandEvaluator` で厳密2値評価(card removal 込み)。
- 反復 600・exploitability < 1% pot。
- OOP 先行ベッティングツリー(check/bet · fold/call/raise、レイズ深さ可変)。

**`turnSolver.ts` + `chanceCfr.ts` — 完全チャンスノード CFR**

- ターン(board=4枚)を対象。「turn ベッティング → ChanceNode(river 札 全 48 列挙) → river ベッティング → 厳密ショーダウン」の 2 ストリート CFR。
- `chanceCfr.ts` が共有コアで、チャンス層の深さに関わらず同一コードでトラバース。
- 反復 40・combo cap 50・全 48 runout 列挙。exploit 4〜5%(ライブ求解)。
- 事前計算では iters 160 / cap 64 で exploit 1〜2% 台に改善。

**`flopSolver.ts` — 2 層チャンス(turn 49 × river 48 = 2,352 runout)**

- フロップ(board=3枚)を対象。`chanceCfr.ts` コアの2層ネスト。
- 計算量は O(N_turn × N_river × combos² × ノード) で重く、**事前計算専用**。
- ライブ求解には使わない。事前計算スクリプト(`scripts/precompute-flop.ts` 予定)で利用。

**`pushFold.ts` — HU push/fold Nash(厳密解)**

- ≤25BB の push/fold のみ。fictitious play による fictitious Nash 求解。
- ショーダウン = オールイン勝率 = 真値なのでアブストラクション誤差ゼロ。
- exploitability 0.0003〜0.0017 BB/hand = near-Nash。

### 2-3. アブストラクション設計

| パラメータ | ライブ求解 | 事前計算 | 備考 |
|-----------|-----------|---------|------|
| レンジ cap | 200 combo | 64 combo | 実用上位コンボ |
| ベットサイズ | 0.66 pot 中心 | 同左 | 離散化。複数サイズも設定可 |
| レイズ深さ | 1 | 1 | 再レイズ以降は別ノード |

### 2-4. 解の供給フロー

```
getSolution(spot)
  ├── 1. precomputed JSON 完全一致? → source:'solver_precomputed'  (最優先)
  ├── 2. live solve 可能? → source:'solver_live'                   (Worker 経由)
  └── 3. 近似レンジ存在? → source:'approximate' / 'approximate_with_ev'
```

`source` は `NodeSolution.source`(`src/types/solver.ts`)に格納され、UI が常時表示する。"GTO 最適" 等の断定表現は使わない(CLAUDE.md ルール1)。

---

## 3. `flop 13%` 頭打ちの再診断(2026-06-12)【検証済み】

### 3-1. 従来の結論

`docs/archive/PHASE_3_5.md` の実測ログに基づき「アブストラクション(combo cap + runout サブサンプル)の構造的下限」として凍結([`./BACKLOG.md`](./BACKLOG.md) A 節)されていた。

### 3-2. 実測ログの内訳

| combos | turn/river runout | iters | 時間 | exploitability |
|--------|------------------|-------|------|----------------|
| 30×30 | 6×6 | 30 | 7s | 0.190 |
| 30×30 | 6×6 | 150 | 35s | **0.138** |
| 30×30 | 6×6 | 400 | 93s | **0.137(プラトー)** |
| 60×60 | 8×8 | 40 | 63s | 0.180 |
| 80×80 | 8×8 | 40 | 111s | 0.170 |

**再診断**: この 13% は **30×30 combo・6×6 ランナウトサブサンプル** での測定。反復を 150→400 に増やしても 0.138→0.137 でプラトー = **反復不足ではなくランナウトサブサンプリングが支配的な近似誤差**。

フロップの 2 チャンス層は組み合わせ 49×48 = 2,352 runout が必要で、当時はサブサンプル(6×6=36)に制約していたためサンプリング誤差が下限を作っていた。

**全列挙(2,352 runout)のオフライン計算であれば突破可能** — この診断は Phase 0 実測によって確認済み(AhKd7s cap80・100iters で 65.5s・0.40%。当時見積もり ~38 分/ボードから大幅短縮)。

### 3-3. コード調査で発見した未使用の高速化余地

1. **eq 行列の 25 倍冗長計算**: `makeRiverChance`(flopSolver.ts)が flop 終端 × turn 終端ごとに river 勝率行列を再計算。実際には盤面(4 枚)が同一なら勝率行列はユニークであり、2,352 通りに対してユニーク数は 2,352 のみ — 現実装は同じキー値を繰り返し計算している形になっており、キャッシュ化で計算量を大幅削減できる。
2. **Card オブジェクト文字列比較 + C(7,5) 列挙評価のホットパス**: HandEvaluator のショーダウン評価がホットパスになっており、整数カード表現と lookup テーブルで大幅高速化できる。
3. **スート同型未実装**: ボードのスート配置が異なっても戦略的に等価な局面を縮約するスート同型変換が未実装。実装すれば有効ボード数を 1/2〜1/4 程度に圧縮できる。
4. **オフラインスクリプト単一スレッド**: `scripts/precompute-postflop.ts` は M5(10 コア)のマシンで単一スレッド実行。並列化で素の速度改善が得られる。

---

## 4. Phase 0 改良計画 — Before / After(2026-06-13 実測完了)

Phase 0 カーネル最適化を実装し、ベンチマークで効果を実測した。以下は確定実測値。

### 4-1. 実装した改良項目と実測効果

| 改良 | 内容 | 実測効果 |
|------|------|---------|
| intカード化 + 衝突マスク(第1波) | Card オブジェクト → 6bit 整数(rank4+suit2)。衝突チェックをビット演算化 | flop **9.8倍**(3,950→381-426ms) / turn **7.6倍**(2,843→361-388ms)。出力チェックサムはビット一致(正しさ保証) |
| Float64Array 化(第1波) | `regret` / `stratSum` 配列を `Float64Array` に変換 | 上記 intカード化と合算して計測 |
| eq dedup(勝率行列キャッシュ)(第2波) | `makeRiverChance` の river 勝率行列を `board4 key` でメモ化 | 58,800回→ユニーク2,352回(25倍冗長の解消) |
| fastEval7(第2波) | アロケーションフリーな 7 枚ベストハンド評価(lookup table) | 全列挙 eq 構築(2,352ボード×30×30コンボ) **2,020ms→44ms=46倍**。eqSum 完全一致 |
| スート同型縮約(第2波) | ボードのスート置換群による同型分類と戦略マージ。opt-in フラグ `--iso` | monotone Kh9h4h **3.38倍** / two-tone Th9h5s **1.38倍**(rainbow は群サイズ1で縮約なし=想定どおり)。iso on/off で exploitability 差・root戦略 L∞差 = 厳密に0 |
| Linear Averaging + DCFR (opt-in)(第1波) | 平均戦略の線形加重 / DCFR 割引を opt-in で追加 | 50iters 同条件: 既定CFR+ **3.13%** → linearAveraging **0.37%** → DCFR(α1.5/β0/γ2) **0.24%** |

### 4-2. go/no-go ゲート結果(2026-06-13・Apple M5 10コア16GB)

全列挙・`--iso --dcfr` で計測。ゲート基準: cap≥80 全列挙で exploit ≤5%・求解時間 ≤30 分/ボード。

| 板 | cap | iters | 時間 | exploitability | peak RSS |
|-----|-----|-------|------|---------------|---------|
| AhKd7s(rainbow・最悪ケース) | 80 | 100 | 65.5s | 0.40% | 987MB |
| AhKd7s | 80 | 250 | 189.8s | 0.06% | 1.76GB |
| AhKd7s | 100 | 100 | 111.3s | 0.17% | 2.24GB |
| AhKd7s | 100 | 250 | 279.6s | 0.03% | 2.59GB |
| Kh9h4h(monotone) | 100 | 250 | 72.5s | 0.03% | 454MB |

**ゲート基準(≤5%・≤30分)を大幅クリア。商用ソルバーの典型的収束水準(0.1-0.5% pot)を同一ツリー内ベストレスポンス測定で上回る。**「~13%・38分/ボード」(旧サブサンプル測定)からの複合改善。

### 4-3. Phase A 量産結果(2026-06-13 完了)

代表フロップ 10 枚 × 10 スポット(SRP 4 + 3bet 6)を `scripts/precompute-flop.ts`(worker_threads 4 並列・iters250・cap100・DCFR・スート同型)で量産:

| 指標 | 実測値 |
|------|--------|
| ジョブ数 / 生成ファイル | 100 求解(lead/facing は 1 求解 2 出力)→ **200 テーブル** |
| 総所要時間 | **16,620s(4.6 時間)**・M5 4 ワーカー(約 181s/求解 wall) |
| exploitability | **最小 0 / 中央値 0.02% / 最大 0.06%**(全テーブルがハードゲート 5% の 1/80 以下) |
| ゲート落ち / エラー | **0 / 0** |
| 追加バンドルサイズ | flop 200 テーブルで **+2.2MB**(postflop 全体 360 ファイル 6.8MB・PWA 予算 15MB 内) |
| ライセンス | 401 ファイル全て `self-generated`/`original`(CI 強制) |

運用上の改良: 量産中に書き込みが「全ジョブ完了後の一括」だと数時間ランの途中クラッシュで全損すると判明 → `jobPool.onResult` を追加し**ジョブ完了の都度書き込む方式**に変更(`existsSync` による再開も機能するようになった)。

検証: 543 テスト緑・type-check/lint/license 全緑。Playwright 実機で ①ソルバータブ: 代表フロップ+レンジ内手札 → 「GTOソルバー解(事前計算)」バッジ+頻度/EV 表示 ②代表ボードドリル: flop 出題 → 実ソルバー頻度・EV での採点、を確認済み。

---

## 5. Phase B — postflop EV モデル(2026-06-13 完了)

Phase A のフロップ完全 CFR カーネルを使い、プリフロップ EV 計算のヒューリスティックをサブゲーム解で置換した。

### 5-1. Before / After

| 項目 | Before (Phase A まで) | After (Phase B) |
|------|-----------------------|-----------------|
| コール EV 計算式 | `(equity − 0.5) × F`（F≈30 SRP / 45 3bet / 60 4bet） | `E_w[V[ci][cj]] − cPre`（V = フロップサブゲームの純チップ EV・w = 到達重み） |
| 戦略自体 | 手作り近似レンジ | 変更なし(手作りのまま) |
| source | `approximate` | `approximate_with_ev`(戦略は手作りなので格上げしない) |
| 4bet 枝 | ヒューリスティック | v1 モデル外・ヒューリスティック据え置き |

### 5-2. V モデルの構築

10 ポット構成でフロップ EV モデルを量産した:

- **構成**: SRP 5 スポット(`bb-vs-{btn,co,mp,utg,sb}`) + 3bet 5 スポット(`3bp-{bb-vs-btn, btn-vs-bb, bb-vs-co, co-vs-bb, sb-vs-btn}`)
- **各ポット**: `canonicalFlops()` から層化サンプル N=60(テクスチャ bucket 比例) / `solveFlop` cap=60 iters=120(Phase 0 カーネル) / `rootValueMatrix` + `aggregateToCategories` で 169×169 の `vOop`/`vIp` を抽出 / `composeMatrix` でボード加重平均
- **量産規模**: 600 ジョブ・6 worker・約 5 時間・各ボード exploitability 中央値 0.0〜0.1%
- **出力先**: `scripts/data/postflop-ev-model/{potKey}.json`(license: self-generated・コミットするが `src/` 外のためバンドルしない)

**vOop/vIp の値域**: `[potBB/2 − stack, potBB/2 + stack]`(約 ±78BB)。`[0, potBB]` ではない点に注意(ポストフロップのベットによる可変性を含む)。

**恒等式検証**: `vOop[i][j] + vIp[j][i] = potBB`(零和 + ポット)を実キャッシュで最大誤差 1e-14 で確認 = 内部整合の独立チェック。

### 5-3. 検出・修正した 2 つのバグ

**バグ 1 — id 配線バグ(敵対的レビュー workflow が検出)**

3bet モデルが postflop spot id(`3bp-bb-vs-btn`)でラベルされていたが、消費側 `heroValueMatrix` はプリフロップ `RangeScenario` id で完全一致照合 → 全 3bet 枝が静かにヒューリスティックフォールバックしていた。

修正: producer がモデルを `RangeScenario` id でラベル(`oopId` = 3better の defender id 例 `bb-vs-btn` / `ipId` = opener が 3bet に直面する id 例 `btn-vs-bb-3bet`)+ エントリポイントガード + 回帰テスト 2 件。solve 自体は spotId でレンジ解決していたため正しく、再求解は不要で再合成のみで対処。

**バグ 2 — 尾手ノイズ(相関ゲートが検出)**

`capRangeSuitClosed(cap=60)` が低頻度の尾手(98s/76s/KTs 等)を多くのボードのレンジから落とす → 尾手は 60 枚中 1〜2 枚のボードにしか残らず、合成値が ±70BB のノイズになる。facing-3bet(`vIp` 側)スポットは EV 全体が 3bet モデルに依存するためノイズが相関を破壊(co-vs-bb-3bet r=0.285)。一方 defender(`vOop` 側)は 3bet 枝が EV の小部分(大半は SRP call 枝)のためノイズが希釈され高相関 — この非対称性が診断の手がかりとなった。

修正: カテゴリ別 `support`(= そのカテゴリが非 null 行を持ったボードの重み比率 0..1)を新設。core 手 = 1.000 / 尾手 ≤ 0.087。`modelCallTerm` は `support < MIN_SUPPORT(0.5)` のカテゴリで null を返しヒューリスティックにフォールバック。

### 5-4. 相関ゲート結果(compare-ev-model.ts・Pearson 相関・閾値 0.7)

| スポット | support ゲート前 | support ゲート後 |
|----------|-----------------|-----------------|
| co-vs-bb-3bet | 0.285 | 0.961 |
| btn-vs-bb-3bet | 0.617 | 0.962 |
| btn-vs-sb-3bet | 0.675 | 0.982 |
| utg-open | 0.74 | 0.81 |
| bb-vs-mp | 0.83 | 0.96 |
| bb-vs-utg | 0.92 | 0.97 |

**結果**: support ゲート後、全 27 スポット ≥ 0.7 でゲートクリア。アンカー健全性: AA open-raise EV ≈ 3.6BB(ブレンド値・大半フォールド勝ち + 被コール時の postflop EV)。

### 5-5. 変更ファイル

`src/lib/solver/evExtraction.ts`(+test) / `src/lib/solver/attachModelEV.ts`(+test) / `scripts/build-postflop-ev.ts` / `scripts/ev-model-worker.ts` / `scripts/compare-ev-model.ts` / `scripts/precompute-preflop-ev.ts`(`--model` フラグ追加・フラグ無しは従来と完全同一出力) / `src/data/solutions/preflop-ev/*.json`(28 ファイル再生成)。

**検証**: 全 569 テスト緑・type-check 緑・lint 緑・license:check 緑(401 データファイル)。

---

## 6. Phase C — プリフロップ モデル内 Nash の試行と構造的限界(2026-06-13 中止)

R4(100BB プリフロップ均衡)を「モデル内 Nash」で解く試み。**収束はしたが構造的限界が判明し、中止基準を適用してレンジ採用は見送った**。事実を恒久記録する。

### 6-1. 構築したもの

- `src/lib/solver/preflopModelGame.ts`: 1 ポジション対 (opener vs defender) を 2 人チェーンゲーム化 (open/fold → facing-3bet fold/call/4bet、defender fold/call/3bet → facing-4bet fold/call) し fictitious play で求解。
- 終端 EV(hero 視点・ハンド開始 0 基準・BB): **fold = 厳密**(forfeit 既投入)/ **SRP・3bet コール = Phase B の V 行列**(契約フレーム vOop/vIp・cPre = 総投入)/ **allin(4bet コール) = 厳密オールイン勝率**(showdown = 真値)。
- 未被覆セル(support < 0.5)は **被覆セルからの線形フィット `vHero ≈ a + b·eq` で外挿**(モデルが捉えたエクイティ→価値の関係を尾手へ適用)。旧 (eq−0.5)×F はベースラインが別系統で FP のレンジ導出に使えない(尾手で過大 penalty)ことを実測で確認した。
- `scripts/solve-preflop-nash.ts`: 5 ペア (opener vs BB) を round-0 求解しアンカー差分レポートを出す診断オーケストレータ。

### 6-2. 検証結果(round-0・全ペア)

| ペア | exploit | open%(アンカー) | 手作り幅 | BB defend%(アンカー) |
|------|---------|----------------|---------|---------------------|
| btn-open | 0.0011 | **57.8** (40-50) | 36.8 | 69.1 (55-68) |
| co-open | 0.0012 | **42.2** (25-32) | 24.7 | 49.7 ✓ (48-60) |
| mp-open | 0.0009 | **53.6** (16-21) | 17.6 | 58.6 (42-55) |
| utg-open | 0.0010 | **63.5** (13-17) | 13.4 | 57.7 (40-52) |
| sb-open | 0.0008 | **60.8** (35-48) | 49.7 | 52.7 ✓ (45-62) |

全ペアで **fictitious play は exploit ≤ 0.0012 BB/hand に収束**(求解器自体は正しく動く)。AA/KK open = 1.0・72o fold 等、定性は妥当。

### 6-3. 構造的限界(中止理由)

**open 幅が早い位置ほど過大**(UTG 63.5% に対し既知アンカー 13-17%)。原因は被覆ではなく**ゲーム構造**:

- 本モデルは **opener vs BB の HU 縮約**で、opener と BB の間のプレイヤー(UTG なら MP/CO/BTN/SB)を「全員フォールド済」と仮定する。
- よって早い位置でもボタン的にスチールでき、**位置依存のオープン幅(UTG < BTN)を原理的に再現できない**。手作り幅(UTG 13.4 < BTN 36.8)は multiway 知識込みで正しく、HU 縮約モデルが到達できない値である。
- これは**被覆律速ではなく構造的欠落**なので、外側反復(Phase B 被覆拡大→再求解)では解決しない。

正しい 6-max プリフロップ均衡には **multiway(背後プレイヤーの逐次応答)モデル**が要るが、これは 16GB ローカルでは非現実的(元 BACKLOG の R4 評価と一致)。

### 6-4. 結論

中止基準を適用し、**Nash レンジは採用しない**。`solver_model` source ティアは将来の multiway 拡張用に予約のまま(本リリースでは未使用)。A 節の成果は **Phase B の解由来 EV 改善(出荷済み)+ push/fold の厳密 Nash(短スタック)**。求解器コード(`preflopModelGame.ts` / `solve-preflop-nash.ts`)は HU 縮約が構造的に妥当な blind-battle / button-steal や、将来の multiway 化の土台として保持する。**→ Phase C2(§6.5)で背後プレイヤーを木に入れ構造から解決した。**

---

## 6.5. Phase C2 — マルチウェイ プリフロップ ジョイント CFR(2026-06-13・C2-1 完了)

Phase C の構造的限界(HU 縮約 = 背後プレイヤー無視)を、**背後プレイヤーを1つのアクション順ゲーム木に入れて**解くことで構造から解決する。路線(3): プリフロップ木を解き postflop は EV 抽象(Simple Preflop Holdem / HRC v3 がデスクトップで実証)。

### 6.5-1. アプローチ
- 6-max プリフロップを1ゲーム木として CFR+ で求解(`src/lib/solver/preflopMultiwayGame.ts`)。手 = 169 カテゴリ / アクション = fold/call/raise / サイズは段ごと離散1種(open 2.5 / 3bet 9 / 4bet 21 / 5bet-allin) / **リンプ無し**(ブラインド対面の最初は fold か open-raise)。postflop は解かず終端 EV に落とす。
- 終端 EV: **foldout** = 厳密 / **allin** = N-way 厳密エクイティ(`nWayEquity`・新規・C2-0 値と一致) / **HU・multiway seen-flop** = エクイティ × **IP/OOP 非対称実現率**(IP = postflop 最後 = ポジション優位)。multiway share は Π pairwise の粗 proxy(到達質量小・**最弱リンク**)。
- 反実仮想値は他プレイヤーの reach 積(`prodOthers`)で**非正規化重み付け**(標準 CFR)。席間カードリムーバルは v1 で独立近似。source は `solver_model`(採用ゲート通過後のみ配線)。

### 6.5-2. 木構造の検証(C2-0 スパイクと厳密一致)
`buildPreflopTree` は決定ノード/終端を C2-0 実測と一致で再現(回帰テスト `preflopMultiwayGame.test.ts`):
- MAX_RAISE=4(5bet-allin): 決定ノード **33,969** / info-set **5.74M** / allin 29,105 / HU seen-flop 1,697 / multiway seen-flop 3,162。
- MAX_RAISE=3(4bet 上限): info-set 0.82M / allin 0。

### 6.5-3. C2-1 結果 = 位置依存オープン幅の回復(600 反復・R_ip=1.05/R_oop=0.82・MAX_RAISE=3)

| 席 | 求解 open% | アンカー | 手作り幅 | 主な対応(対オープン先頭防御) |
|----|-----------|---------|---------|------------------------------|
| UTG | **15.7** ✓ | 13-18 | 13.4 | MP fold91/call2.5/3bet6.1 |
| MP | **19.1** ✓ | 15-22 | 17.6 | CO fold88/call4.8/3bet7.6 |
| CO | **25.0** ✓ | 22-30 | 24.7 | BTN fold81/call4.9/3bet14.1 |
| BTN | **41.7** ✓ | 40-50 | 36.8 | SB fold78/call13/3bet8.4 |
| SB | 29.2 ⚠ | 35-58 | 49.7 | BB fold0.9/call82/3bet16.7 |

- **Phase C の構造的失敗(UTG 63.5%)→ 15.7%**。位置依存オープン幅(UTG<MP<CO<BTN)を構造から回復し、**4/5 席がアンカー命中**。手ごとの戦略も妥当(UTG: AA/AKs=1.0・A5s=0.27 ミックス・72o≈0)。
- **安定性**: open% は 300↔600 反復で **Δ≤0.4** = 収束(多人数 CFR は収束保証無いが平均戦略は安定 → 計画どおり安定性+アンカーで品質判定)。
- **SB のみアンカー外**(29.2 vs 35-58): SB は BB に postflop OOP で OOP 実現率(0.82)が BvB オープンを締める + no-limp 抽象(GTO の SB はリンプ多用)の緊張。BvB は実務でも最難スポット。

### 6.5-4. 残課題(C2-2)
- **SB/BvB の精緻化**(リンプ抽象 or BvB 専用実現率)。
- **HU seen-flop を Phase B V 行列へ**(現在は flat 実現率近似 = BTN/CO 圧縮の一因)。ただし Phase B は opener-vs-BB 対のみ被覆 → cold-caller 対は被覆ギャップ(要追加生成)。
- **5bet-allin(MAX_RAISE=4)本求解**(allin 29K 終端 = N-way 厳密・計算重・一晩)。
- 採用ゲート **C-2a**(解 JSON 配給)/ **C-2b**(フル置換)。中止基準: アンカー大逸脱が抽象で残る → `solver_model` 出荷せず据え置き。候補レンジは `scripts/out/preflop-multiway/`(src/ 未採用・gitignore)。

求解器: `preflopMultiwayGame.ts`(木 + CFR+ + 終端 EV) / `preflopEquity.ts`(`nWayEquity` 追加) / `scripts/solve-preflop-multiway.ts`(全席求解 + アンカー差分レポート)。

---

## 7. AI(Fable 5)の実力により可能となったこと

以下は事実ベースの記録。検証済みの根拠(実測値・コード根拠)が伴うもののみ追記する方針とする。

1. **「13%=環境制約」の再診断(検証済み)**: 実測ログ(`docs/archive/PHASE_3_5.md`)を再解釈し、「サブサンプリング誤差の下限であり全列挙なら突破可能」という結論を導出。Phase 0 の全列挙実測(AhKd7s・cap80・100iters → 0.40%)によって正しさが確認された。

2. **eq 行列 25 倍冗長計算の発見(検証済み)**: `flopSolver.ts` の `makeRiverChance` が flop 終端 × turn 終端ごとに river 勝率行列を再計算しており、同一 4 枚ボードでのキャッシュ欠損を特定した。fastEval7 + dedup の実装により 58,800回→2,352回・46倍高速化として実証された。

3. **スート同型縮約の設計・実装(検証済み)**: スート置換群によるボードの同型分類と、解の置換アキュムレートによる戦略マージの数学的設計(正当性の導出込み)を実施し実装した。iso on/off で exploitability 差・root戦略 L∞差 = 厳密に0 であることを確認済み。monotone ボードで 3.38倍の縮約を実測。

4. **第1〜2波の並列実装によるPhase 0の即日完了**: モデル使い分け(fable=カーネル最適化・同型縮約、sonnet=評価器・スクリプト・文書)により、第1波(intカード化・Float64Array化・収束 opt-in)と第2波(fastEval7・eq dedup・スート同型)の並列実装が1日未満で Phase 0 を完了させ、go/no-go ゲートを即日通過した。

5. **Phase B の 2 つのバグを計画に組み込んだ安全機構が捕捉(検証済み)**: ① 敵対的レビュー workflow が id 配線バグを(5 時間の再求解を無駄にする前に)検出した。② 相関ゲートが尾手ノイズを検出した。いずれも非自明な根本原因(cap によるレンジ脱落がカテゴリ別サンプリングの非対称を生み、IP 側 facing-3bet でのみ顕在化)を、ボード出現数の分析(core 60/60 vs 尾手 1〜2/60)で診断した。coverage(villain 到達カテゴリ数)では区別できず出現数が判別子となる点は事前には自明でなかった。

6. **Phase C の構造的限界を一晩の無駄計算の前に検出(検証済み)**: 1 スポットのスパイク → 全 5 ペアの round-0 スイープという段階検証で、「open 幅が早い位置ほど過大(UTG 63.5%)」を確認し、その原因が**被覆律速ではなく HU 縮約の構造的欠落**(opener と BB の間のプレイヤー無視)だと切り分けた。被覆修正(外側反復・一晩計算)では直らないと判断し、計算投資前に中止基準を適用した。「収束する(exploit 0.001)≠正しい」を実データで弁別した点が要。

---

## 8. ロードマップ

| Phase | 内容 | go/no-go ゲート |
|-------|------|----------------|
| **Phase 0** ✅ | カーネル最適化(int カード化・Float64Array・eq dedup・fastEval7)+ ベンチマーク実測 | cap≥80 全列挙で exploit ≤5%・≤30 分/求解 → 0.03%・4.7 分で通過 |
| **Phase A** ✅ | flop 代表 10 ボードの事前計算(実測 4.6h・4-3 節) | `--max-exploit 0.05` のハードゲートを全 200 テーブルでクリア(最大 0.06%) |
| **Phase B** ✅ | postflop EV モデルの改善((equity−0.5)×30BB ヒューリスティックを、解いたサブゲーム EV で置換。正準フロップ層化サンプル N=60 × 10 ポット構成・600 ジョブ約 5 時間) | 全 27 スポット相関 ≥ 0.7・AA EV ≈ 3.6BB アンカー確認 → 通過(2026-06-13) |
| **Phase C** 🛑 | プリフロップのモデル内 Nash(2人チェーンゲーム×fictitious play) | 中止(2026-06-13)。FP は exploit ≤0.0012 に収束したが、HU 縮約が opener-BB 間のプレイヤーを無視するため早い位置の open が構造的に過広(UTG 63.5% vs 13-17%)。被覆では直らず中止基準を適用。求解器コードは保持(§6)。R4 真 6-max Nash は multiway 要で据え置き |

> **Phase A/B/C の前提**: Phase 0 の eq dedup + fastEval7 が完了していること。入力レンジ品質が精度の鎖の根にあるため、カーネル最適化を先行させる。

---

*初版: 2026-06-12。各 Phase 完了時に Before/After + 実測値を追記。*
