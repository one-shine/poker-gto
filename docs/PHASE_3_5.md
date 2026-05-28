# Phase 3.5: GTOソルバー基盤 (本物の解の供給)

> 親計画: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) / 公開準備: [RELEASE_READINESS.md](RELEASE_READINESS.md)

## 方針変更 (2026-05-24): 自前TSソルバー
`postflop-solver`(Rust/WASM)は **AGPL-3.0 で商用(広告収益)と衝突** + この環境でビルド不可のため不採用。
代わりに **外部依存ゼロの自前 TypeScript ソルバー**を Web Worker で実装する(リバー→ターン→フロップ)。
これにより L1/L2 ライセンス問題を完全回避しつつ R1/R3 を満たす。プリフロップ実解(R4)は別途要ライセンスデータ。

## 進捗 (2026-05-24)
- [x] **リバーソルバー核** `src/lib/solver/riverSolver.ts` — HU リバーを vector CFR(CFR+)で厳密求解。
  OOP先行ツリー(check/bet・fold/call/raise、レイズ上限可変)、HandEvaluator で showdown 比較(card removal 込)、
  zero-sum 払戻(死にポット折半)。各コンボの **戦略頻度 + 実EV(BB)** を出力。
  4テスト通過(ポラライズで value>bluff混合 / pure-air低ベット / EV正値 / 頻度和=1)。
- [x] **solverClient + Web Worker** `solverClient.ts` / `workers/solver.worker.ts` — Worker で求解(非対応/テストはインラインfallback)。`riverSolver` に `nodes`(シリアライズ可能なノード要約: path/strategy/EV)を追加。
- [x] **getSolution postflop 配線**(#16) — `riverRanges.ts`(カテゴリ→具体コンボ展開、`comboKey`、`deriveRiverRanges` for bb-vs-X)。`resolveSpotKey` を「HU + river + hero=OOP先頭 + bb-vs-X」に限定(対応ノードのみ評価)。`getSolution` river → レンジ導出→ capRange(上限100)→ solveRiverAsync(250反復)→ NodeSolution(`solver_live`, hero combo戦略+実EV)→ メモリキャッシュ。CoachAgent は postflop で comboKey 参照、postflopカテゴリ対応。
  - **R1(postflopコーチ)+R3(実EV)が river OOP-lead BB-defense で稼働**。統合テストで state→solver→`solver_live`+showEv を実証。
- [x] **リバー被ベット(call/fold)** (#17) — `SpotKey.riverBetBB` 追加。`resolveSpotKey` が「先頭リード」と「hero check後にvillain単発ベット→被ベット」を区別。`getSolution` がベット比でツリーを解き該当ノード(先頭=root / 被ベット=`[OOP check, IP bet]` の OOP facing節)へナビゲートして hero戦略+EV抽出。リバーの最重要判断 call/fold をコーチ可能に(トップセット>80%コールを検証)。
- [x] **ターン/フロップ拡張**(#18) — **方式変更**: チャンスノードの完全CFR(44ランナウト×river求解≈20秒で不可)ではなく、**ショーダウンをランナウト平均エクイティに抽象化**。`equityMatrix(oop,ip,board,sampleN)` がボード長で分岐(5枚=二値リバー / 4枚=ターン全44 / 3枚=フロップは組サンプリング)。river/turn/flop が**同一エンジン**で解ける(CFR・ツリーは不変、showdown評価のみ差替)。`resolveSpotKey`/`getSolution` を flop/turn/river に開放(hero OOP・lead/被ベット・bb-vs-X)。turn 実機 <3秒。
  - **重要な近似**: turn/flop は「現ストリートでオールイン相当(以降のベッティング/エクイティ実現を無視)」の簡易解。ドローのエクイティ実現を過大評価しうる → `source: 'solver_live'`(簡易)として正直に明示。精密化は将来(完全チャンスCFR or 事前計算)。
- [x] **IndexedDB 永続キャッシュ + 取込器雛形**(#19) — `solveCache.ts`(L1メモリ + L2 IndexedDB via `idb`、非対応環境はメモリのみ)。getSolution の求解結果を永続化(リロード/再訪で即時)。`scripts/import-ranges.ts`(CSV→preflop NodeSolution JSON 変換の雛形)+ `import.meta.glob` で `src/data/solutions/preflop/*.json`(solver_precomputed)を近似より優先採用。**実データは未取込(要ライセンス, L1)** → 現状は全て approximate にフォールバック。
- 実機: アプリ起動エラー0、idb 最適化・glob 動作確認。

## 精密化 (2026-05-24〜)
- [x] **R17 exploitability 計測** — best-response 値を算出し均衡からのズレ(%pot)を計測。`riverSolver` が返し、`solverClient`/Worker → `getSolution` が `NodeSolution.exploitability` に設定 → `CoachFeedback` 経由で CoachPanel が「収束 X% pot」表示。収束テスト(反復↑で↓・収束時<5%)。**注意**: CFR の収束度であり、turn/flop のエクイティ抽象化誤差(R14)は測らない。
- [x] **R16 カバレッジ拡大: hero=IP 対応** — `deriveRiverRanges` を bb-vs-X(hero=OOP)+ X-open(hero=IP)両対応(2レンジは共通=opener raise + BB call、hero がどちら側かが base で決まる)。`resolveSpotKey` で heroIsOOP 判定、`getSolution` を OOP/IP × lead/被ベットの4ノードに一般化。hero=IP(btn-open, villain check後)の check/bet 戦略を検証。
- [🔄] **R14 turn/flop 精度** — 2段階で対応:
  - [x] **(1) 信頼度の明示(今回)**: turn/flop の solver_live は「オールイン相当のエクイティ近似(以降のベッティング未考慮)」で river より精度が低い。CoachFeedback に `street` を持たせ、CoachPanel に「簡易: 賭け未考慮」バッジ + exploitability「収束 X%」を表示。**誤った権威付けを防止**(最重要リスクを解消)。
  - [ ] **(2) 精度の本丸: 完全チャンスノード CFR(未了・専用作業)**。仕様:
    - ツリーをマルチストリート化: ターンのベッティング終了(fold以外)→ **ChanceNode(リバー札を配る)** → リバーのベッティング → ショーダウン(board+r の二値, 厳密)。
    - **実装方針**: `eq` 行列をクロージャ変数 `currentEq` 化し、ChanceNode が runout ごとに `currentEq=per-runout二値eq` を設定して再帰・平均(シグネチャ変更最小)。**公開カード除去**: runout r を含むコンボの reach を 0。committed/pot はストリート跨ぎで累積(リバーのベットサイズは現ポット比)。flatten は chance で停止(ターンノードのみ記録)。valueAvg/brValue も chance 対応。
    - **性能**: runout サンプリング(turn: 8–16) + コンボ上限60 + 反復150 + Worker。river の検証済みテストを安全網に段階導入。
    - flop は 2チャンス層で重い → 当面エクイティ近似のまま or 事前計算ライブラリ。
  - **着手順序(重要)**: 精度の鎖は **R4(実データ)→ R15(レンジ narrowing)→ R14②(チャンスCFR)**。
    入力レンジが近似/上限/narrowing無しのままソルバーだけ精密化しても実精度は伸びない。R14② は R4/R15 の後 or 同時が効率的。
    R14①(信頼度明示)で誤誘導は防げているため、R14② は**後回し(専用枠)で可**。
- [ ] R15 入力レンジ品質(ストリート narrowing)/ 残ノード(チェックレイズ・3bet・マルチウェイ)— 残課題

## Phase 3.5 ソルバー実装トラック: 完了
river/turn/flop の自前 CFR 求解 + Worker + getSolution 配線 + 永続キャッシュ + 取込器雛形が揃った。
**残課題(将来)**: hero=IP / レイズ応酬ノード / turn・flop の完全チャンスCFR(精密化)/ exploitability 計測 /
事前計算ポストフロップライブラリ(代表ボード)/ プリフロップ実解データの取込(要ライセンス)。

## 公開準備レビュー対応(本フェーズが本丸)
公開レビューのブロッカー R1/R3/R4/R11 を直接解消する:
- [ ] **R1 ポストフロップのコーチ不在**: `getSolution` postflop を事前計算/WASM で供給 → CoachAgent がフロップ以降も評価可能に。
- [ ] **R3 実EV損失の稼働**: `solver_*` 解は実EVを持つ → CoachAgent の EV損失数値表示が実際に出る(現状 approximate=ev0 で非表示)。
- [ ] **R4 本物のソルバー解**: 手作り近似を `data/solutions/**` の実解へ置換。trainer の `gto_ai` も実解ベースに。
- [ ] **R11 近似レンジの監修**: 実解取込で自動解消。取込までの暫定は出典明示を維持。

## 目標

**GTO Wizard に近づける根幹**: 本物のソルバー解をプリフロップ・ポストフロップ双方に供給する基盤を作る。
以降の Coach (実EV損失), `gto_ai` 対戦相手, レンジvsレンジ可視化, 精度計測はすべてこの層の上に乗る。

GTO Wizard 自体は「サーバで事前計算したソルバー解のビューア」。本アプリはそれをローカルで近似する:
**ハイブリッド = 事前計算ライブラリ(即時・モバイル) + ブラウザ内WASM CFRソルバー(任意スポット都度求解)**。

## アーキテクチャ

```
NodeSolution (統一インターフェース) ← src/types/solver.ts
  ├── preflop  : 事前計算 (実ソルバー出力/GTO Wizard CSV → JSON 変換)
  └── postflop : ハイブリッド
        ├── 事前計算ライブラリ (代表ボードの JSON 同梱) ──── 即時 (trainer / mobile)
        └── WASM CFR ソルバー (postflop-solver, Web Worker) ─ 任意スポット都度求解 (study / desktop)
              └── 解は IndexedDB にキャッシュ (2回目以降は即時)

供給窓口: src/lib/solver/getSolution()  ← Coach / gto_ai / 可視化はこれだけ呼ぶ
```

## 統一解モデル (`src/types/solver.ts`)

```ts
export type SolutionSource =
  | 'solver_precomputed'  // 同梱ソルバー解 (信頼度最高)
  | 'solver_live'         // ブラウザ内WASM求解 (簡易アブストラクション)
  | 'approximate'         // 手作り近似 (未カバースポットの暫定フォールバック)

export interface ActionSolution {
  action: PlayerAction    // fold/check/call/raise
  sizeBB?: number         // raise/bet の to-amount (BB)
  frequency: number       // 0..1 GTO戦略での採用頻度
  ev: number              // このアクションのEV (BB単位)
}

export interface NodeSolution {
  street: Street
  spotId: string          // 'btn-open' / 'bbvsbtn-flop-K72r' など
  board?: Card[]
  // キー: ハンドカテゴリ(プリフロップ "AKs") or 具体コンボ(ポストフロップ "AsKs")
  strategy: Record<string, ActionSolution[]>
  potBB: number
  source: SolutionSource
  exploitability?: number // solver_live が到達した exploitability (% pot)
  meta: { sourceName: string; version: string; solvedAt?: number }
}
```

**学習信号の核**: `evLoss = max(ev) − ev(選択アクション)`。Snowie/GTO Wizard と同じ「EV損失(BB)」。

## プリフロップ: 実ソルバーレンジ取り込み

- ソース: GTO Wizard 無料レンジ / 公開ソルバー出力 CSV (100BB · 6-max · ノーレーク前提を明記)
- `scripts/import-ranges.ts` (Node) で CSV → `NodeSolution` JSON に変換 → `src/data/solutions/preflop/*.json`
- EV列があれば取り込む。無ければ頻度のみ (EV損失はサイズ非依存の近似に劣化、`source` で明示)
- 既存 `src/data/ranges/preflop.ts` の手作りデータは段階的に置換。置換済み = `source: 'solver_precomputed'`
- `meta.sourceName` / `meta.version` を必須 (`src/CLAUDE.md` のJSONフォーマット準拠)

## ポストフロップ: WASM CFR ソルバー

- ライブラリ: `postflop-solver` (Rust, OSS) を WASM 化し Web Worker で実行 (`WASM Postflop` 同系)
- 入力: 両者レンジ(プリフロップ解から導出), ボード, スタック/ポット, 許容ベットサイズ集合
- 出力: 各ノードの strategy + EV → `NodeSolution` に変換
- **street-by-street 求解 (river まで届かせる鍵)**: フロップから全 turn/river ランナウトを
  一括で解くとツリーが爆発する。代わりに **`getSolution` が「現在ノード」を部分木として解く**:
  - flop ノード = flop サブゲーム / turn ノード = そのターン札の turn サブゲーム / river ノード = river サブゲーム
  - 入力レンジは直前ストリートの解(or レンジ伝播)から引き継ぐ
  - river サブゲームは小さく速い (数百ms〜)。turn は中、flop は重い → ストリートが進むほど軽い
- **ツリーを小さく保つ (ブラウザ制約必須)**:
  - ベットサイズは離散少数 (例: flop 33%/75%, turn 75%, river 50%/125%)、レイズ上限1回
  - target exploitability を緩め (例: ≤0.5% pot) て数秒で収束させる

### ストリート別カバレッジ (river まで届くか)

| ストリート | 事前計算ライブラリ | live solve | 評価の到達度 |
|---|---|---|---|
| flop  | 代表ボードを広くカバー | 可(重い) | ◎ |
| turn  | 主要ボードのみ | 可(中) | ○ |
| river | 限定的 | 可(軽い·部分木が小さい) | study都度求解で ○ |

- **ゲーム進行は常に river/ショーダウンまで完結** (エンジン Phase 1 済)。評価が無くてもプレイは止まらない
- river まで事前計算で全保持は組合せ爆発で不可能 → **不足ストリートは live solve(study) / heuristic フォールバック**
- play/trainer モード(即応·モバイル)で未カバーの後ストリートは、評価をスキップ or heuristic を `approximate` 明示
- **WASMスレッド要件**: SharedArrayBuffer のため **COOP/COEP ヘッダ必須** (Vite dev & 本番)。
  非対応環境はシングルスレッドにフォールバック(遅い)+ UIで遅延警告
- **メモリ**: 大きいツリーは数百MB〜。ノード数上限を設け OOM 回避。超過/失敗時は heuristic フォールバック(`approximate` 明示)
- 求解結果は IndexedDB にキャッシュ (キー = spotId + board + 設定ハッシュ)

## 事前計算ライブラリ (即時・モバイル)

- オフラインで同 solver を回し、代表スポット × 代表ボードの解を JSON 同梱
- **ボード抽象化**: 1755 戦略的フロップを suit isomorphism + クラスタリングで代表 ~40–80 種に圧縮。
  turn/river は主要のみ同梱、それ以外は live solve (study) で補完
- trainer モード(特に mobile)はこのライブラリのみ使用 → 常に即応・OOMなし
- カバー対象スポットは IMPLEMENTATION_PLAN のスポット表に追記して管理

## 解供給API (`src/lib/solver/`)

```ts
// 統一窓口。Coach / gto_ai / 可視化はこれだけを呼ぶ
async function getSolution(
  spot: SpotKey,
  opts?: { allowLiveSolve?: boolean },  // study mode のみ true
): Promise<NodeSolution | null>
// 1) 事前計算ライブラリ命中            → 即返す (solver_precomputed)
// 2) IndexedDB キャッシュ命中           → 返す
// 3) allowLiveSolve && WASM可           → Worker求解 → キャッシュ → 返す (solver_live)
// 4) いずれも不可                       → null (Coach はスキップ / heuristic を明示)
```

`SpotKey` は preflop シナリオID or postflop(基底preflopスポット + ストリート + ボード)から生成。

## 実装ファイル一覧 (新規)

| ファイル | 役割 |
|---------|------|
| `src/types/solver.ts` | `NodeSolution` 等の統一解モデル |
| `src/lib/solver/getSolution.ts` | 供給窓口 (ライブラリ→キャッシュ→live solve→null) |
| `src/lib/solver/spotKey.ts` | GameState → SpotKey 解決 |
| `src/lib/solver/solverClient.ts` | Worker への求解依頼ラッパー |
| `src/workers/solver.worker.ts` | postflop-solver(WASM) 実行 Worker |
| `scripts/import-ranges.ts` | CSV → preflop NodeSolution JSON 変換 (Node, ビルド時) |
| `src/data/solutions/preflop/*.json` | 取込済みプリフロップ解 |
| `src/data/solutions/postflop/*.json` | 同梱ポストフロップ解 (代表ボード) |

## 検証方法

1. preflop JSON を既存 13×13 グリッドで描画でき、EV列が読める
2. Worker で代表フロップ1スポットが数秒で解け、exploitability が表示される
3. 同スポット2回目が IndexedDB キャッシュで即時返る
4. COOP/COEP 無効環境でシングルスレッド動作 (遅延警告が出る)
5. ノード数上限超過スポットで heuristic フォールバック (`source: 'approximate'` 表示)

## 注意事項

- `postflop-solver` のライセンス・帰属表記を README とアプリの「ライセンス」画面に明記する
- ライブラリ/解データの前提 (100BB · ノーレーク · 特定ベットツリー) を `meta` と UI に常時明示
- `src/engine/` は本層に依存しない (依存方向は engine ← solver ← stores/UI)
