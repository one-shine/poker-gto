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
- [x] **R14 turn/flop 精度** — 2段階で対応 (① 信頼度明示 ✅ + ② turn 完全チャンス CFR ✅ 実装完了):
  - [x] **(1) 信頼度の明示**: turn/flop の solver_live は「オールイン相当のエクイティ近似(以降のベッティング未考慮)」で river より精度が低い。CoachFeedback に `street` を持たせ、CoachPanel に「簡易: 賭け未考慮」バッジ + exploitability「収束 X%」を表示。**誤った権威付けを防止**(最重要リスクを解消)。
  - [x] **(2) 精度の本丸: 完全チャンスノード CFR ✅ 実装完了 (2026-05-30)** → 下記「## R14② 完全チャンス CFR 実装完了」参照。**詳細設計 2026-05-28 追記** (R14② 計画書):

    ### 目的
    現状 turn (board=4) の `solver_live` は「リバーまでオールイン相当のエクイティ平均」で、リバーのベッティング判断 (フラッシュドロー降りる/降りない、バリュー反映/ブラフ) を一切考慮しない。結果としてドローが過大評価され EV/頻度が現実とずれる。完全チャンスノード CFR で「river ベッティングを含めた turn の真の EV」を求める。

    ### 範囲 (turn 限定 MVP)
    - **対応**: turn (board=4)。「turn ベッティング → ChanceNode (river 札) → river ベッティング → 厳密ショーダウン」の2ストリート CFR
    - **見送り**: flop (3ストリート・2チャンス層は重すぎる)。事前計算ライブラリ案件
    - **派生**: hero=OOP/IP 両対応 (river CFR で既に対応済の構造をそのまま再利用)

    ### データ構造
    ```ts
    // 既存 (riverSolver.ts) に追加
    interface ChanceNode {
      kind: 'chance'
      potAfterTurn: number          // chance 入口でのポット
      committedAtChance: [number, number] // chance 入口でのコミット (turn 終了時点)
      runouts: ChanceChild[]        // sampled river cards
    }
    interface ChanceChild {
      card: Card                    // dealt river card
      // 2-value 厳密エクイティ (board=5, runout 含む)
      eq: number[][]                // eq[oop_i][ip_j] (combo 衝突した手は -1)
      removedOOP: boolean[]         // この runout で除外される oop combo (card と衝突)
      removedIP: boolean[]
      subtree: Node                 // river ベッティング部分木 (この runout 専用、独立 regret/stratSum)
    }
    ```

    ### ツリー構築
    - turn ベッティング部分は既存 `buildTree` の構造をそのまま使う (OOP check/bet · IP応答 · レイズ)
    - **showdown 終端を ChanceNode へ置換**: fold 以外で到達する「コール後showdown」「双方check後showdown」の terminal を ChanceNode に
    - 各 ChanceChild の subtree:
      - 同じ `buildTree` で pot = potAfterTurn (turn 終了時) を渡して構築
      - river の betting サブツリーは turn と同じ構造 (check/bet→fold/call/raise)
      - 終端は strict 2-value showdown (引数の `eq` を使う、平均ではない)
    - fold 終端は ChanceNode で包まず (river に進まないため不変)

    ### CFR 拡張
    既存 `traverse(node, up, reachUp, reachOpp)` に分岐追加:
    ```
    if (node.kind === 'chance') {
      const N = node.runouts.length
      const acc = new Array(combos[up]).fill(0)
      for (const ro of node.runouts) {
        // 公開カード除去: runout カードを含む相手 combo の reach を 0 に
        const adjOpp = reachOpp.map((r, j) => (up === 0 ? ro.removedIP[j] : ro.removedOOP[j]) ? 0 : r)
        const adjUp = reachUp.map((r, i) => (up === 0 ? ro.removedOOP[i] : ro.removedIP[i]) ? 0 : r)
        // この runout の eq でショーダウン値を評価する subtree を traverse
        const v = traverseWithEq(ro.subtree, up, adjUp, adjOpp, ro.eq)
        for (let c = 0; c < acc.length; c++) acc[c] += v[c] / N
      }
      return acc
    }
    ```
    `traverseWithEq(eq)` は既存 traverse を eq パラメータ化したもの。terminal.showdown のときに渡された eq を使う (現行は closure の eqOOP)。最小変更案: eq を closure 変数 `currentEq` にして chance 突入時に書き換え (シグネチャ不変) → ただし再帰のため要 restore。安全には引数化が綺麗。

    `valueAvg` / `brValue` も同様に chance 分岐を追加 (平均戦略・最適応答評価)。

    ### Runout サンプリング
    - 全 44 通り (turn 後の残り 1 枚) のうち N=12 サンプル (決定的 stride or seeded random)
    - **rank multiplicity 重み**: 同じランクのスート違いは同等。重複排除 + ランク覆い率を確保
    - 重み付け: 各サンプルを 1/N で平均 (一様サンプル前提)

    ### 性能予算
    | パラメータ | 値 | 根拠 |
    |---|---|---|
    | runout sample N | 12 | 44通り中 27% カバー、ランク偏り抑制 |
    | コンボ上限 | 60 (R15 の 200 から削減) | 60×60×12 runout × CFR で許容 |
    | 反復 | 100 (R15 の 250 から削減) | runout 平均で十分収束 |
    | 期待求解時間 | 5-15s | turn study 用 (Worker・キャッシュ前提) |

    ### 実装ファイル
    - **新規** `src/lib/solver/turnSolver.ts`: 多ストリート CFR (上記データ構造 + traverse 拡張)
    - **修正** `src/lib/solver/getSolution.ts`: turn(board=4) で `useChanceCFR: true` 時に turnSolver を呼ぶ
    - **修正** `src/workers/solver.worker.ts`: turn 求解の入口を増設 (river との切替)
    - **修正** `src/lib/solver/solverClient.ts`: turn 専用エントリ追加

    ### テスト戦略
    1. **river 回帰 (絶対安全網)**: 既存 river/turn テストが全通過することを確認 (turn は従来の equity 近似のままにし、新コードは opt-in)
    2. **chance 単体**: ランダム runout でも `Σ (1/N) = 1` の重み和、card removal で removed 行が 0 reach
    3. **ドロー過大評価の解消**: 例: K♥9♥ on T♥6♥2♣ vs AhAc → 現行は flush draw 過大評価。新解で AA EV が上がる方向を assert (引数の閾値は緩めに)
    4. **value bet 反映**: 強い手 (top set) の turn betting 戦略が現行より bet 偏重になることを assert
    5. **収束**: exploitability < 10% pot (river の <5% より緩い目標)

    ### 段階展開
    | フェーズ | 内容 | コミット |
    |---|---|---|
    | R14②-1 | turnSolver.ts スケルトン + ChanceNode 型 + tree builder + 既存 river テスト維持 | 1 |
    | R14②-2 | CFR traverse 拡張 + chance handling + 単体テスト | 1 |
    | R14②-3 | getSolution opt-in 配線 + Worker 経由 + integration テスト | 1 |
    | R14②-4 | パフォーマンス調整 (runout N, iters, combo cap 探索) | 0-1 |
    | R14②-5 | UI バッジ更新 (turn は「賭け考慮済 / runout=12」と明示) | 1 |

    ### リスクと緩和
    - **バグリスク**: chance node のカード除去・reach 伝播は実装ミスが起きやすい → river との回帰テスト + 簡単なチャンスでの sanity (turn=確定 river=既知ボード) を先に通す
    - **パフォーマンス**: 想定 5-15s を超えたら runout を 8 に削減 / コンボを 40 に削減
    - **メモリ**: runout × river-subtree の regret 配列 (~ 12 × 60 × 5 × 数十 = ~50k floats) → 数 MB、許容範囲

    ### 着手前提
    - 入力レンジが薄いまま CFR だけ精密化しても効果限定 → **R4 実データ取込 / R15 narrowing が先**
    - R15 narrowing は実装済 (river 限定)。R14② で turn の narrowing 同種を入れる場合は別作業
    - 当面は R14① 信頼度明示で誤誘導は防げているので緊急度は低
  - **着手順序(重要)**: 精度の鎖は **R4(実データ)→ R15(レンジ narrowing)→ R14②(チャンスCFR)**。
    入力レンジが近似/上限/narrowing無しのままソルバーだけ精密化しても実精度は伸びない。R14② は R4/R15 の後 or 同時が効率的。
    R14①(信頼度明示)で誤誘導は防げているため、R14② は**後回し(専用枠)で可**。
- [ ] R15 入力レンジ品質(ストリート narrowing)/ 残ノード(チェックレイズ・3bet・マルチウェイ)— 残課題

## R14② 完全チャンス CFR 実装完了 (2026-05-30)
turn (board=4) を「turn ベッティング → ChanceNode(river札) → river ベッティング → 厳密2値ショーダウン」の2ストリート CFR で求解する `src/lib/solver/turnSolver.ts` を新設。riverSolver.ts は不変(回帰安全網)で、turnSolver は opt-in。

- **設計検証ワークフロー先行**: 実装前に複数視点(reach/カード除去・eq スレッディング/ゼロサム会計・EV/exploitability)で正しさを設計レビュー。統一スペックに従い実装。
- **データ構造**: `ChanceNode{potAfterTurn, committedAtChance, runouts}` / `ChanceChild{card, eq(5枚厳密2値), removedOOP/IP, subtree}`。非fold の turn 終端を ChanceNode へ置換(fold 終端は不変)。各 runout は独立 regret/stratSum の river サブツリーを持つ。
- **二重 half 体系**: turn-fold 終端 `halfT=potBB/2` / river サブツリー終端 `halfR=potAfterTurn/2`(turn 投入は potAfterTurn に畳み込み、river committed は [0,0] リセット・stack は turn 投入を差引)。
- **eq は明示パラメータ**で各 runout の厳密 eq を showdown へ伝播(closure-mutate 案は EV/exploitability パスで壊れるため不採用)。
- **チャンス分岐**は `chanceAccumulate` に集約: `acc[c]=Σ(removedSelf?0:v[c]/realN)`(1/N は値のみ・常に全 N で割る・fresh adjUp/adjOpp・index は up/1-up で選択)。traverse/valueAvg/brValue が共用。brValue は nature に best-response しない(runout 1/N 平均)。
- **正規化バグを発見・修正(ground-truth テストで検出)**: 静的 norm(turn レンジ reach)では除去バイアスが残り「ベットなし=エクイティ近似」と一致しなかった。EV 表示を value と同経路の `massAvg`(net≡1)で割る方式に変更し /N を相殺=条件付き EV を正しく返す(学習は /N の一様チャンス測度のまま=正しい)。
- **ランナウト被覆バグを発見・修正(レビューワークフロー検出)**: 当初 12 札の決定的ストライド抽出は `createDeck`(suit-outer/rank-inner=suit ブロック順)に対しストライド 4 となり ~5 ランクしか拾わず、オーバーカード/ドローを「死に手」と誤評価していた(例: K高ボードで KQ を EV 死に手扱い)。**turn river は単一札 48 通りのため全列挙に変更**(`allTurnRunouts`・ランク/スート完全被覆=サンプリングバイアス無し)。`selectRunouts`(テスト用サブセット)もランク被覆+スート分散へ是正。回帰テスト追加。
- **配線**: `getSolution` が turn(board=4)で `useChanceCFR:true`(全48 runout 列挙・combo cap 50・iters 40)。Worker/solverClient が solveTurn へ振替。`NodeSolution.bettingAware/runoutN` → `CoachFeedback` → `StrategyDetail` バッジ「賭け考慮済 (runout 48)」(flop は従来「簡易: 賭け未考慮」)。PostflopDrillPanel フッター注記も是正。
- **性能**: 代表 turn スポット 6.9–9.9s・exploitability 4.3–5.3%(目標 <10% に対し十分収束)。全48 runout は 12 の 4x のため iters 40・combo 50 で budget(5–15s)内に収めた(runout 完全列挙を優先し iters/combo で調整)。
- **検証**: turnSolver.test.ts 16件(ground-truth ベットなし=エクイティ近似一致 / マルチコンボ会計 / 分極化 EV 順序 / 支配ハンド / exploit 収束 / 会計&カード除去ストレス / **ランナウト被覆回帰**)+ solver.test.ts turn を chance-CFR 契約に更新。レビューワークフローの probe(マルチコンボ ground-truth・短スタック・除去 finiteness)を恒久テスト化。**259テスト緑**・build/lint/型 0。
- **スコープ**: turn 限定 MVP。flop(3ストリート2チャンス層)は事前計算ライブラリ案件として見送り。river サブツリーのノードコーチングは対象外(turn 判断のみ・river は従来 riverSolver 経路)。

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
