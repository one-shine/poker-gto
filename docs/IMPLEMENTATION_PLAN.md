# ポーカーGTO学習アプリ — 実装計画 (インデックス)

> **作業ルール**
> - セッション開始時: このファイル (進捗・共通制約) を読む
> - 該当フェーズ作業時: `docs/PHASE_X.md` を追加で読む
> - ステップ完了時: 下記チェックリストを `[x]` に更新
> - 中断時: 次に着手するステップを「現在の進捗」に明記してから停止
> - **各フェーズ完了時: 実装内容・ロジック・UI・UX を振り返る「公開準備レビュー」を必ず実施し、
>   新たな指摘を [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md) に追記して対応フェーズへ割当てる**(2026-05-24 ルール化)
> - このファイル + 該当フェーズファイルが唯一の正典。会話の記憶には頼らない。

---

## フェーズ進捗サマリー

- Phase 1 ✅ ゲームエンジン (19テスト通過)
- Phase 2 ✅ GTOレンジデータ + 13×13グリッドUI (Playwright動作確認済み)
- Phase 3 ✅ ポーカーテーブルUI + 基本プレイ (全14ステップ完了・Playwright動作確認済み・64テスト通過) — [docs/PHASE_3.md](docs/PHASE_3.md)
- Phase 3.5 🔄 **GTOソルバー基盤** (自前TSソルバー: AGPL回避。river/turn/flop求解✅ + Worker✅ + getSolution配線✅ + IndexedDB永続✅ + 取込器雛形✅。残: IP/レイズ応酬/精密化/事前計算/実preflopデータ) — [docs/PHASE_3_5.md](docs/PHASE_3_5.md)
- Phase 4 ✅ コーチ (EV損失/頻度評価) + ミス分析 + trainer対戦 + LearnPage/SettingsPage (全9タスク完了・97テスト・study/play/trainer実機確認) — [docs/PHASE_4.md](docs/PHASE_4.md)
- Phase 4.6 ✅ **公開準備ハードニング** (R9 Lint0/R5 永続化/R7 実一時停止/R6 精度UX) 完了・97テスト・lint0・実機確認 — [docs/PHASE_4_6.md](docs/PHASE_4_6.md)
- Phase 4.5 ⬜ 理論ライブラリ + 弱点分析 + レンジvsレンジ可視化 — [docs/PHASE_4_5.md](docs/PHASE_4_5.md)
- Phase 5 ⬜ 学習システム + ポストフロップドリル + リフレクション — [docs/PHASE_5.md](docs/PHASE_5.md)
- Phase 6 ⬜ ポリッシュ・最適化 + 事前計算ライブラリ拡充 — [docs/PHASE_6.md](docs/PHASE_6.md)
- 🎨 デザイン刷新 (Felt & Brass) ✅ 全6ステップ + 微調整(フル→クリーンなカード/ヒーロー下中央/ベットチップ/レンジ拡大/SVGアイコン)完了・64テスト維持・実機確認済み — [docs/DESIGN.md](docs/DESIGN.md)
  - 📋 **UI改善バックログ**(GTO Wizard/Snowie 比較の16項目)を `docs/DESIGN.md` に集約。各項目を下記フェーズへ織り込み済み:
    - Phase 4: 常時ストラテジー表示 / ポットオッズ・エクイティ / EV損失 / 有効スタック
    - Phase 4.5: レンジのセル内スプリット塗り / レンジメタ情報 / レンジ vs レンジ
    - Phase 5: アクション履歴(ベットライン)
    - Phase 6: トータルポット / 勝者ハイライト / チップ移動 / タイマー / 配布アニメ / presets総額 / モバイル最適化 / サウンド

> **📋 公開準備レビュー** ([docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md)): Phase 4 完了時点の自己レビューで
> 「一般公開に必要な11項目(R1–R11)」を洗い出し各フェーズへ割当済み。最大の課題は**ポストフロップ無言・
> プリフロップ10/21・近似のみ**(R1–R4=Phase 3.5/5/6 で解消)。即時の品質/UX修正は Phase 4.6。
>
> **設計の根幹 (GTO Wizard 準拠)**: プリフロップ/ポストフロップとも**本物のソルバー解**を供給する
> (Phase 3.5)。Coach の評価・EV損失・`gto_ai` 対戦相手・レンジvsレンジ可視化はすべて
> `src/lib/solver/getSolution()` が返す `NodeSolution` を基準にする。固定チャートとの突合や
> ヒューリスティクスは「ソルバー未カバースポットのフォールバック」に限定し、`source` で常に明示する。

---

## 現在の進捗 (作業再開時はここを最初に読む)

**現在のフェーズ**: Phase 4 ✅ + Phase 4.6 ✅ + Phase 3.5 🔄(自前TSソルバー: river/turn/flop 解✅ = **R1/R3 が postflop hero=OOP で稼働**。turn/flop はエクイティ近似)
**次に着手するステップ**: 2026-05-28 セッションで R15(入力レンジ品質)/ R4-A(ヒューリスティック preflop EV)/ R25(IDB 移行)を完了 (207テスト)。次は R4-B (UI で approximate_with_ev 種別導入) または R10 B4 (チップ移動アニメ) / R14② (完全チャンスCFR) / R11/R19 監修 (WebSearch ベース) から選択。
その後 Phase 5(R8エクイティ/postflopドリル)→ Phase 4.5 → Phase 6。
**Phase 4 成果**: 型、プリフロップ+5シナリオ(10計)、CoachAgent(EV損失/頻度評価)、session/progressStore、CoachPanel/StrategyBars、A1 LiveStrategyPanel(常時戦略+ポットオッズ)、A3 EV損失、play CoachToast、GTOPlayerAgent(trainer)、LearnPage(ダッシュボード+履歴)、SettingsPage、SampleSizeBadge、HandReplay。全97テスト・study/play/trainer 実機確認済。

> ⚠️ ビルド整備済み: `npm run build` (`tsc -b`) が厳格設定 (erasableSyntaxOnly/verbatimModuleSyntax) で
> 既存エンジンのパラメータプロパティ・type-only import・未使用変数を露出していたため修正。
> `vite.config.ts` は plugins のみ、test 設定は `vitest.config.ts` に分離 (rolldown-vite と vitest 同梱 vite の Plugin 型衝突回避)。
> `package.json` に `test`(vitest run) / `type-check`(tsc -b) を追加。旧 `tsc --noEmit` はルート設定で実質ノーチェックだった。
>
> ⚠️ 既存問題2件を修正 (Step 14 検証で発見):
> 1. `BettingEngine.applyAction` の `ActionRecord.amountBB` を **増分→to-amount(到達ベット水準)に統一**。raise が「レイズ 1BB」と増分表示されていた不整合を解消 (ポーカー慣習「raise to X」)。call/allin も to-amount に統一。型コメントも更新。
> 2. `RangesPage` の「GTO最適解に基づいています」表記が CLAUDE.md 絶対ルール1違反 → 「GTO近似レンジ (一般理論ベースの手作り・source: approximate)」に修正。冒頭の「ヒューリスティクス」表記も同様に是正。(L1 で「FreeBetRange参考」→「一般理論ベースの手作り」に再修正)

### Phase 3.5 ステップ別チェックリスト → 詳細は [docs/PHASE_3_5.md](docs/PHASE_3_5.md)

- [x] 解の橋渡し `fromRangeScenario.ts` (近似レンジ→NodeSolution) + `spotKey.ts` + `getSolution.ts` (preflop供給/postflop null)。8テスト追加・通過
- [ ] `solverClient.ts` + `src/workers/solver.worker.ts` — postflop-solver(WASM) 配線 (street-by-street)
- [ ] IndexedDB 求解キャッシュ
- [ ] `scripts/import-ranges.ts` — 実ソルバーCSV → `data/solutions/preflop/*.json` 取込 (approximate→solver_precomputed 置換)
- [ ] 事前計算ポストフロップ解 `data/solutions/postflop/*.json` (代表ボード)

### Phase 3 ステップ別チェックリスト

- [x] Step 1: `src/engine/agents/AIPlayerAgent.ts` — 注入式スケジューラ + raise-or-fold(ノーリンプ) + レンジ駆動。`handCategory.ts` 追加。19テスト継続通過
- [x] Step 2: `src/stores/gameStore.ts` — Zustand store (bus/dealer/AI配線、fishDelayScheduler注入、hero turn検出)。フルハンド駆動のスモークテスト通過 (計28テスト)
- [x] Step 3: `src/stores/settingsStore.ts` — appMode/opponentMode/stackBB/autoAdvanceSeconds/onboardingComplete + persist(localStorage)。3テスト追加 (計31)
- [x] Step 4: `src/components/game/CardDisplay.tsx` — CSS純粋カード描画 (♠♥♦♣ + 赤/黒 + 裏面、Tサイズ=10表示、aria-label、色のみ非依存)。4テスト追加 (計35)
- [x] Step 5: `src/components/game/PlayerSeat.tsx` — ポジションバッジ/スタック/ホールカード(hero表·相手裏·reveal対応)/直近アクション/手番リング/オールイン/フォールド減光。5テスト追加 (計40)
- [x] Step 6: `src/components/game/PokerTable.tsx` — 楕円テーブル + 6席(seatIndex絶対配置) + 中央ポット/ボード + ディーラーボタン + ショーダウン公開。4テスト追加 (計44)
- [x] Step 7: `src/components/game/ActionPanel.tsx` — Fold/Check·Call/Bet·Raise動的切替 + プリセット(preflop BB / postflop %·Pot·Overbet·All-in) + スライダー + キーボード f/c/r/Enter + 44px タップ。5テスト追加 (計49)
- [x] Step 8: `src/components/game/HintPanel.tsx` — getSolution+resolveSpotKey+handCategoryで推奨頻度表示、Hキー開閉、source/EVバッジ、ヒント参照記録(onHintViewed, 統計除外用)。3テスト追加 (計52)
- [x] Step 9: `src/components/game/GameFooter.tsx` — 100BB/ノーレーク/キャッシュ/ICM非考慮 常時表示バー + source信頼度(✓/△で色非依存) + 前提条件モーダル(Escで閉)。5テスト追加 (計57)
- [x] Step 10: `src/pages/GamePage.tsx` — PokerTable + ActionPanel(+study時HintPanel) + GameFooter 統合。起動時initGame、source解決→Footer、ショーダウン結果表示、Space=New Hand。1テスト追加 (計58)
- [x] Step 11: `src/components/onboarding/OnboardingFlow.tsx` — 初回チュートリアル5画面(ようこそ/ポジション/グリッド凡例R·C·M/モード/開始)、戻る·次へ·スキップ、完了でcompleteOnboarding。3テスト追加 (計61)
- [x] Step 12: `src/components/layout/AppShell.tsx` — desktopサイドバー(w-20)+mobileボトムタブ、6タブ(NAV_ITEMS export)、aria-current(色非依存)+アイコン+ラベル。`PageId`型export。3テスト追加 (計64)
- [x] Step 13: `src/App.tsx` — PageId状態でページ切替、onboardingComplete=false時OnboardingFlow最前面、未実装ページ(learn/analysis/theory/settings)はComingSoonプレースホルダー。build/全64テスト通過
- [x] Step 14: Playwright 動作確認 ✅ — オンボーディング5画面→スキップ→ゲーム画面、New Hand→プリフロップ(Hero=BTN AA表示)→レイズ→AI応答→フロップ(ポストフロップ%プリセットへ動的切替)→ショーダウン完走(全席公開・結果・New Hand再表示)、6タブ切替確認。勝者表示を生ID→ポジション名に修正

---

# ⚠️ 全フェーズ共通の注意事項 (実装前に必ず確認)

## GTO精度に関する既知の制約

### [改訂] レンジ/解データの出典・前提条件
**Phase 3.5 で実ソルバー解に差し替える**。`src/data/ranges/preflop.ts` の手作り近似は移行用の暫定で、
取り込み完了スポットから `src/data/solutions/preflop/*.json` (`source: 'solver_precomputed'`) に置換する。
- 取込元: **自社 TS ソルバー生成解のみ** (`license: 'self-generated'`)。他社ソルバー出力 (GTO Wizard 等) は商用再配布不可のため**同梱禁止** (L1 決定・`docs/DATA_LICENSE.md`)。`meta.sourceName` / `license` / `version` を必須
- 置換済みスポットの UI 表記は「GTO近似レンジ」→「**GTOソルバー解**」に格上げ
- **未取込スポットのみ**「GTO近似レンジ (一般理論ベースの手作り)」表記を残す (`source: 'approximate'`, `license: 'original'`)
- **スタック深さ: 100BB 固定前提**。取込解もこの深さ。可変深さは将来課題
- **レーキ: 0% 前提 / キャッシュ / ICM 非考慮**。トーナメント学習用途には不向き
- 全 UI のどこかに「100BB / ノーレーク / キャッシュ / ICM非考慮」+ `source` を常時表示すること

### [確定] trainer (vs GTO) と exploit (vs Fish) の2モード
GTO Wizard は「GTO相手にプレイして最適解との乖離を測る」のが中核。これを `gto_ai` で実装する:
- **trainer モード (既定·GTO Wizard相当)**: 相手は `gto_ai` (= `NodeSolution` を頻度サンプリングして打つ)。
  両者GTO前提なので Coach の評価が方法論的に整合する
- **exploit モード**: 相手は `fish_ai` (リーク持ち)。実戦的だが、固定解との突合は「GTO近似に照らすと」表記に留め、
  対Fishの最大EV(エクスプロイト)と混同させない (Coachに注意文)
- `settingsStore` でモード選択。`gto_ai` 未カバースポットは事前計算→無ければ heuristic フォールバック
  (対戦相手のリアルタイム性のため live solve は使わない)

### [修正済み] CO オープンサイズ
~~2.2BB~~ → **2.5BB** に修正済み (`preflop.ts` + raiseSize)。
2.2BB は実在しないサイジングのため。標準は 2x / 2.5x / 3x。

### [修正済み] BB vs BTN ディフェンスレンジ拡張
2回の改訂で現代GTOに近づけた:
- 1回目: K6s, K5s, Q7s 追加
- 2回目: Q低/J低/T低 スーテッド (Q5s-Q2s, J6s-J4s, T5s-T4s) + K4s + 94s + 62s + 65o 追加、
  A3s/A2s を pure call → mixed 3bet に変更 (ブロッカー理論)、A7o-A5o の頻度調整
これにより BB defense 全体は ~55% にカバー拡大。

### [修正済み] SBオープンレンジ拡張 (~46% → ~58%)
現代GTO (GTO Wizard 等) では 55-65% が標準。以下を追加:
- 全 Kxs (K2s 追加)、Q2s-Q4s, J2s-J4s, T2s-T4s 混合
- オフスートコネクター: 76o, 75o, 65o, 54o 等
- 全 Axo (A2o 追加)、K4o-K7o 混合、Q6o-Q7o 等

### [制約→解消] プリフロップシナリオの大幅な欠如

> **2026-05-26 更新: R2 完遂 — 21/21 スポット網羅完了**(open5 + BB防御5 + 非BB防御6 + facing-3bet5)。非BB防御はライブ・コーチングへ配線済(`spotKey.ts`)。マルチウェイは設計ルール4で除外。全て approximate 手作り(実解置換は R4/将来)。下記は当初の計画記録(歴史的経緯)。

当初、6-max に必要な主要シナリオのうちカバーできていたのは **5/21 (約24%)** のみだった。

#### 現状カバー済み (5シナリオ)
| シナリオ | ファイル |
|---------|---------|
| BTN open | ✅ preflop.ts |
| CO open  | ✅ preflop.ts |
| SB open (vs BB) | ✅ preflop.ts |
| BB vs BTN raise | ✅ preflop.ts |
| BB vs SB raise  | ✅ preflop.ts |

#### Phase 4 で追加するシナリオ (優先度最高: 最頻出スポット、前倒し済み)
フィードバック密度確保のため Phase 5 から前倒し。いずれも単独レイザー/RFI前提の単純レンジ。
| シナリオ | 理由 |
|---------|-----|
| UTG open (~14%) | 全ハンドの14%で直面 |
| MP open (~18%) | 全ハンドの18%で直面 |
| BB vs UTG raise | BBのDefense最多スポット |
| BB vs MP raise  | BBのDefense頻出スポット |
| BB vs CO raise  | BBのDefense頻出スポット |

#### Phase 5 で追加するシナリオ (優先度高: ポジション付き対レイズ)
3bet-or-fold / cold-call ロジックを伴うため Phase 4 とは分離。
| シナリオ | 理由 |
|---------|-----|
| SB vs BTN raise (3betまたはfold) | SBはOOPのためcold callなし |
| BTN vs CO raise (cold callまたは3bet) | BTNの最重要対応スポット |

#### Phase 6 で追加するシナリオ (優先度中)
| シナリオ | 備考 |
|---------|-----|
| SB vs CO raise | 3betまたはfold |
| BTN vs UTG/MP raise | cold callレンジ存在 |
| CO vs UTG raise | 3betまたはfold |
| BTN facing 3bet (vs BB/SB) | 4betまたはcall |
| CO facing 3bet | 4betまたはfold |

#### 将来対応 (スコープ外)
- 4bet/5betシナリオ
- スクイーズシナリオ (open+coldcall後)
- SBコンプリート/ミニレイズ戦略

#### Phase 4 での取り扱いルール
- CoachAgent はマッチするシナリオがない場合は**フィードバックをスキップ**（誤判定より安全）
- スキップ時は「このポジション/シナリオはデータ準備中」をUIに表示
- `matchScenario()` が `null` を返した場合 = スキップ確定
- **HU前提**: アクティブプレイヤー3人以上のマルチウェイポットでは評価しない
- **リンプ前提崩れ**: ヒーローより前にリンプ(未オープン状況のcall)があればオープンレンジ前提が崩れるためスキップ。Fish AI は raise-or-fold でリンプを出さない (`docs/PHASE_3.md` 参照) が、安全網として `matchScenario` でも検出する
- **単独レイザー限定**: BBディフェンスはプリフロップのレイズが1回のみのスポットで評価。3bet/スクイーズが挟まればスキップ

### [確定] 対戦相手(Fish AI)はノーリンプ + 定義レンジを持つ
GTO学習の文脈整合とエクイティ計算の前提のため、Fish AI は以下を満たす:
- **プリフロップ未オープン時は raise-or-fold (リンプ禁止)**。`PREFLOP_SCENARIOS` のオープンレンジ駆動で抽選する
- これによりオープンスポットが常に「folded-around RFI」として清潔に成立し、`matchScenario` 判定が正当になる
- "フィッシュらしさ" はポストフロップのコール過多・たまの暴発で表現する (`docs/PHASE_3.md`)
- 相手にレンジが定まることで、エクイティ表示を "vs ランダム2枚" ではなく "vs 相手レンジ" で計算できる (`docs/PHASE_5.md`)
- **フィードバック文言の注意**: 相手はGTOではないため、UIでは「GTO近似レンジに照らすと」等の表現に留め、対Fishの最大EV(エクスプロイト)と混同させない

### [改訂] ポストフロップはソルバー解を基準にする (織り込み済み)
旧方針「ポストフロップは必ずヒューリスティクス」は撤回。Phase 3.5 のソルバー基盤により:
- **ソルバーカバー済みスポット** (事前計算ライブラリ / live solve 成功) = `NodeSolution` を基準に
  EV損失で評価。表記は「**GTOソルバー解**」(precomputed) / 「GTOソルバー解(ローカル求解·簡易)」(live)
- **未カバースポット** (求解失敗·OOM·非対応環境) のみ従来のヒューリスティクスにフォールバックし、
  `missed_cbet_ip` 等には必ず「参考: GTO非準拠(ヒューリスティクス)」バッジを表示
- どのスポットがどの `source` かを UI に常時明示し、利用者が信頼度を判断できるようにする

### [修正済み] MistakeCategory の整理
`missed_steal` と `over_steal` を削除。`preflop_too_tight` / `preflop_too_wide` + ポジション情報で代替。
(`src/types/stats.ts` 修正済み)

### [制約] VPIP/PFR の BB チェック扱い
標準的な HUD では **BB のチェック (アンレイズドポット) は VPIP にカウントしない**。
CoachAgent / sessionStore でVPIP集計時に必ずこの例外を実装すること。

### [改訂] EV損失の表示方針 — ソルバーEVで定量化する
旧方針 (pot equity × pot は EV ではない → 数値非表示) は、ソルバー解が無い前提だった。
**Phase 3.5 で本物のソルバーEVを持つため、EV損失(BB)を第一級の学習信号として表示する** (GTO Wizard / Snowie 同様)。

```
evLoss(BB) = max(全アクションのEV) − 選択アクションのEV   // src/types/solver.ts の evLoss()
```

EV損失の大きさで Snowie 流に3段階分類し、既存 `MistakeSeverity` にマッピングする:
```
inaccuracy → minor    : 0 < evLoss ≤ 0.5 BB
mistake    → major    : 0.5 < evLoss ≤ 2.0 BB
blunder    → critical : evLoss > 2.0 BB
// 閾値は settings で調整可能。ミックス戦略の許容内 (頻度≥10%) は evLoss≈0 → 正解扱い
```

- **EV損失(BB)を数値表示してよい** (ソルバーEVに基づく真値のため)。集計は bb/100 で「精度」と併記
- ソルバー未カバー (`source: 'approximate'`) のスポットでは **EV損失数値を出さず**、文章フィードバック+「参考(GTO非準拠)」バッジのみ
- Coach フィードバックは数値+理由文の両方:「このコールは -1.8BB。KJsはBTNからレイズ100%が最大EVです」

### [制約] ミックス戦略は「ミス」ではなく「学習機会」
ミックス戦略の手 (例: JJ in BB vs BTN = 40% 3bet / 60% call) は、
どちらのアクションも正解として扱い、UI には学習機会として両頻度を表示する。XP満額。
詳細ロジックは [docs/PHASE_4.md](docs/PHASE_4.md) の `EvaluationResult` 参照。

### [制約] ショーダウン以外のカード公開ポリシー
フォールドで終わったハンドで AI のカードを見せるかどうかを Phase 3 で決定すること。
**推奨: 学習モードでは見せる、プレイモードでは見せない** (settingsStore.appMode で切り替え)。

## shadcn/ui の導入タイミング (統一)
Phase 4 開始前に shadcn/ui をセットアップする。Phase 3 終了後、Phase 4 実装前に以下を一括追加：
```bash
npx shadcn@latest add slider tabs dialog badge sonner
```
※ `toast` は廃止済み。トーストは `sonner` を使用。
Phase 6 での「置き換え」は不要になる。

## モバイル ActionPanel: スライダー + プリセットボタン必須
Phase 3 から ActionPanel にはスライダー**と**プリセットボタンを両方実装する：
```
[ Fold ] [ Check/Call ] [ Bet/Raise ▼ ]
  プリセット (プリフロップ): [2BB] [2.5BB] [3BB] [Pot] [All-in]
  プリセット (ポストフロップ): [33%] [50%] [66%] [75%] [Pot] [Overbet]
  スライダー: ━━━━●━━━━  X BB
```
**Bet vs Raise の動的切替**: 相手がベット前 = 「Bet」、ベット後 = 「Raise」
