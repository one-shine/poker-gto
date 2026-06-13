---
tags: [dev-log]
app: poker-gto
date: 2026-05-30
---
# poker-gto 開発ログ

### 2026-06-13 Phase C2-2 精緻化(Phase B V 配線)+ 採用ゲート — 較正済 flat の頑健性を実証
- **実装**: ①3bet/4bet サイズを Phase B pot に整合(11/24 → srp 5.5 / 3bet 22.5 が一致)②HU seen-flop 終端を **Phase B の解いたサブゲーム V 行列**で評価(`huSeenFlopEV` 解決器・UTG/MP/CO/BTN SRP + BTN/CO 3bet・support<0.5 で flat フォールバック・未被覆=flat)。`huHeroValue` は全 cell flat なら flat 分岐と厳密一致(正規化整合)。
- **知見(重要・C2-1 の見立てを実証的に訂正)**: Phase B V の配線は flat 実現率と差 **≤0.4pt** = 較正済 flat(IP/OOP 実現率)が解いたサブゲーム EV をよく近似し、**open 幅は seen-flop EV の精度に頑健**。BTN40.7/CO24.1 は flat でも既にアンカー命中 = 「BTN/CO 圧縮は flat-EV 律速」は誤りだった。V 配線は provenance/原理整合のため保持。
- **SB の限界を確定**: 29.1(vs 35-58)= **no-limp 抽象**(raise-or-fold は GTO の SB リンプ多用を表現不能)+ OOP 実現率の構造的境界。`srp-sb-bb` は open 2.5≠モデルの 3.0 / IP-OOP ラベルの緊張で**未配線**(ミスマッチモデルで無理にアンカーへ寄せない=正直表示)。SB の本丸はリンプ抽象(木拡張=別タスク)。
- **結果(600 反復・Phase B V)**: UTG15.5/MP18.3/CO24.1/BTN40.7 = **4/5 アンカー命中**・安定性 Δ(300↔600)≤0.6。候補レンジ妥当(BTN: AA-AKs/AJo/55=1.0・98s=0.50 ミックス・72o≈0)。
- **5bet-allin 完全木の検証**: 29,105 の allin 終端(N-way 厳密)を実求解で初通過(MR=3 には allin 終端が無く未実行だったパス)。200 反復・8 分・NaN なし。結果は 4bet-cap と頑健に同傾向(UTG13.5/MP16.8/CO21.9/BTN39.6/SB28.1=5bet で全席 ~2pt 締まる)→ betting-tree 深さに頑健。
- **採用ゲート**: 候補レンジ(`scripts/out/`・gitignore・src/ 未採用)は UTG/MP/CO/BTN 妥当だが SB 据え置き。**C-2a(解 JSON 配給)/ C-2b(フル置換)は product/正直表示の判断 = 明示承認後**(手作りレンジは理論照合済=ROI 注記)。型0/lint0/全テスト緑。詳細 `docs/SOLVER.md §6.5-4/5`。

### 2026-06-13 Phase C2-1 マルチウェイ プリフロップ ジョイント CFR — Phase C の構造的限界を解決
- **経緯**: 「続きを進めて」を当初「A節は天井到達=残課題クローズ」と誤判断したが、ユーザー指摘(「backlog は見たか / phase c の検討は」)で**承認済み計画 Phase C2**(`~/.claude/plans/backlog-a-gto-mac-delegated-candy.md`・C2-0 スパイク GO 済)を再発見。Phase C 中止(HU 縮約=背後プレイヤー無視で UTG 63.5%)を、6-max プリフロップ木を1つのジョイント CFR で解いて**構造から**解決する路線(postflop は EV 抽象=Simple Preflop Holdem/HRC v3)。
- **一次実測で中止判断を再確認**: キャッシュ済み Phase B モデル(10件)+ エクイティ(2500iters)が残存 → `solve-preflop-nash.ts` を再実行し round-0(UTG 63.5% 等)を完全再現。**open 超過量が「無視する中間席数」に単調**(UTG+47pt→CO+13pt)= 構造的欠落の指紋。被覆では直らないことを一次確認。
- **実装**: ①`preflopEquity.nWayEquity`(N-way 厳密エクイティ・C2-0 値 AA/KK/QQ=0.671/0.177/0.152 と一致・6-way で 76s>QQ>AKs のマルチウェイ再評価を捕捉)②`preflopMultiwayGame.ts`(6-max 木 + CFR+ + 終端 EV)③`scripts/solve-preflop-multiway.ts`(全席求解 + アンカー差分)。
- **潰したバグ(致命・退化均衡の原因)**: 初版は終端で相手レンジを `wSum` 正規化 → アクション到達確率(reach 質量)の重みが消え、非行動プレイヤーの価値集約 `Σ_a` が過大計上 → 退化均衡(BB 3bet 51% / 早い位置 1% / 位置順序消失)。**標準 CFR どおり他プレイヤー reach 積 `prodOthers` で非正規化重み付け**に修正 → 即座に健全化(UTG 13.1%・順序回復)。場当たり的 `oppReach` 加重を撤去。
- **精緻化**: IP/OOP 非対称実現率(IP=postflop 最後=ポジション優位)で後ろ位置のオープンを正当化 → BTN 24→42%。
- **結果(600 反復・R_ip1.05/oop0.82)**: UTG15.7 / MP19.1 / CO25.0 / BTN41.7 = **4/5 アンカー命中**・手作り幅と同傾向。安定性 Δ(300↔600)≤0.4 = 収束。SB のみ外(29.2 vs 35-58 = no-limp/OOP 実現率の緊張・BvB は最難 → C2-2)。手ごと戦略も妥当(UTG A5s=0.27 ミックス・72o≈0)。**Phase C の UTG 63.5% → 15.7% = 構造的失敗を解消**。
- **検証**: 木ノード数が C2-0 スパイクと厳密一致(33,969 決定 / 5.74M info-set / allin29105 / HU1697 / mw3162)を回帰テスト化。型0 / lint0 / license OK / **全577テスト緑**(+8)。候補レンジは `scripts/out/`(gitignore 追加・採用ゲート C-2a/C-2b 前・src/ 未採用)。残=C2-2(SB 精緻化 / HU 終端 Phase B V / 5bet-allin 本求解 / 採用ゲート)。詳細 `docs/SOLVER.md §6.5`。

### 2026-06-10 ハンド相談ツール(RangesPage 新タブ)— B9
- **経緯**: 「続きのタスク」= B8(13x13ソルバータブ)だったが、設計ワークフロー+敵対的レビューで **既存事前計算が cap/narrow 縮約済=13x13 の7〜9割が空セル**になり「レンジ全体」を正直に出せないと判明。ユーザーに確認したところ、本当に欲しかったのは **「盤面+手札+状況を自由に設定 → その1ハンドのおすすめ」=1ハンド相談ツール**(レンジ全体ではない)。B8 とは別物として B9 を新規実装。
- **設計**(2回目のワークフロー: 既存経路精査→設計→3観点の敵対的レビュー)。1回目は設計エージェントが巨大スキーマ出力で無限リトライ(40分空回り)→ TaskStop→ 設計をテキスト出力化して resume で復旧(キャッシュ済み精査3件を再利用)。
- **核心**: `resolveSpotKey` は GameState 依存で再利用不可 → `manualSpot.ts` の `buildManualSpotKey` がフォーム入力から **SpotKey を直接構築**し `getSolution(spot,{allowLiveSolve:true})` を駆動。位置マップは spotKey.ts/opponentRange.ts と同方針で内側に複製(共有分類モジュール化は別タスク)。
- **レビューで潰した穴**: ①**SB の SRP postflop** は `baseHeroIsOOP('bb-vs-sb')`=true で通ってしまう → `POSTFLOP_OPENERS`(UTG/MP/CO/BTN)で明示的に弾く(`sb_srp`)。②「precomputed と live が一致」前提は誤り(cap/iters 差)→ 代表盤=precomputed・任意盤=live と分離。③共有 solver 定数(live turn cap)は変更しない(Coach/drill 波及回避)。④任意ベット額は live が当該サイズを実際に解く=「pot-odds 参考落とし」より良い。⑤flop は ✓ソルバー解バッジが誤誘導 → **flop は GTO 頻度を出さず勝率/ポットオッズのみ**(賭け未考慮を明示)。
- **正直表示**: preflop=`handCategory`/postflop=`comboKey` でキー切替(SpotPanel は全街 handCategory で postflop は実は引けていない疑い=別件)。source ラベルは既存規約準拠・"GTO最適" 不使用。equity は potSpec 由来の相手レンジ(=ソルバーが使う側と一致)で `computeEquityAsync`。
- **実装**: `lib/solver/manualSpot.ts`(+test 22件)・`lib/equity/manualEquity.ts`・`lib/solver/riverRanges.ts`(`villainRangeSpec` 追加)・`hooks/useManualAdvice.ts`・`components/ranges/ManualAdvisorPanel.tsx`・`pages/RangesPage.tsx`(タブ追加+見出し中立化)。
- **検証**: 型0・lint0・**全488テスト緑(+22)**・build緑・license/version OK。Playwright 実機で preflop(GTO近似+概算EV)/ river-lead(solver_live・レイズ89%)/ river-vsbet(コール89%+ポットオッズ2.5:1→✓コール有利)/ flop(頻度非表示+勝率のみ)の4経路を確認。SB が SRP の位置選択肢から除外されることも確認。console 2 errors は既知の dev 限定 `%BASE_URL%` 二重展開(本番正常・U27)。

### 2026-06-06 ポット二重計上修正 + 全方位レビュー
- **ポット二重計上(U20・commit 608420d)**: ユーザーの「なぜ開始ポットが3BBか」から発覚。`GameState` がブラインドを `mainPotBB:1.5` と `currentBetBB` の両方に入れていた=チップ保存則破れ(600→601.5)。表示2倍に加え `collectBetsIntoPot` が膨らんだ mainPot へ加算しポストフロップ確定ポット・配当・spotKey の求解ポットまで +1.5 過大(毎ハンドリセットで累積はしないが表示/解は誤り)。→ `mainPotBB:0`(ブラインドは currentBetBB のみ・pot は collect で単一経路集約)+ `record.potBB`=実ポット(getTotalPot+現ベット)。`potAccounting.test.ts` で保存則を回帰化。
- **全方位レビュー(workflow・64エージェント)**: 10次元(engine会計/GTO正直さ/評価ルール/multiway勝率/事前計算/a11y/security/データライセンス/テスト網羅/UX)を find→**敵対的verify**→synthesis。確証42件(high21)。
  - **採用した確証修正**: ①最小レイズ過大バグ(U21・commit 43a9454)②CoachToast の solver_live ラベル補完(ルール1)③turn=完全チャンスCFR の誤コメント修正 ④MIXED_STRATEGY_THRESHOLD 4重複を types/gtoRules に一元化 ⑤未使用 ALL_RANKS 削除 ⑥close/次へ ボタンのタップ44px化(commit c412528)。
  - **却下した誤検出**: isHeroIP の「button≠0でバグ」(実際は完全に button 相対=正しい)/ useEquity の reference stale(`cancelled` ガードで防御済)。
  - **保留(妥当だが低優先)**: rejection sampling のサンプル減(参考値として許容・スクラッチ調査でも実効率高)/ 多数のテスト網羅ギャップ(Showdown/GameStateMachine 専用ユニット等)/ 一部 a11y(色のみ強調の WeaknessCard/RangeGrid)/ データライセンスのビルド時強制。
- **検証**: 型0・lint0・全410テスト緑・build緑・CI/Pages 緑。

### 2026-06-06 リリースのバージョニング + 3betポット代表盤面
- **バージョニング(E節)**: `package.json` を version の正に統一(0.0.0→0.1.0・tauri.conf.json 0.1.0 と一致)。`scripts/check-version.mjs`(package.json===tauri.conf.json を検証・tag 引数で tag とも照合)+ `npm run version:check` を CI に追加(push/PR ごとにドリフト検出)。`.github/workflows/release.yml`: `v*` タグ push で ①タグ形式 vX.Y.Z 検証 ②`tag==package.json==tauri.conf.json` 保証 ③build→dist を zip 添付 ④`gh release create --generate-notes`。配信は PWA(Pages 自動デプロイ)が本線で Release は履歴の節目+固定版アーカイブ。手順は RELEASE.md §8。**セキュリティ**: `GITHUB_REF_NAME` は引用済み env 参照(`${{}}` 補間なし)+ 先頭で vX.Y.Z 形式に限定(security-guidance hook 指摘の workflow injection 対策)。commit `a1b6d6e`。
- **3betポット代表盤面(A節 追補)**: 代表ボード事前計算を pot 種別で一般化。`representativeBoards.ts` に `REPRESENTATIVE_SPOT_SETS`(srp: pot5.5/stack100/4スポット, 3bet: pot22.5/stack89/6スポット=BB/SB 3bet vs BTN/CO の 3better OOP×caller IP)。`precompute-postflop.ts` を pot 横断ループに(`--pot-type` フィルタ)。3bet は **96ファイル**(代表8×6スポット×phase2)を生成(turn iters160/cap64 で exploit 0.8〜1.1% / river <0.5%)。**計160ファイル**。ドリル代表モードに SRP/3bet トグルを表示(`generateRepresentativePostflopQuestion(rng, potType)`)。getSolution は spotId/pot/stack で別キーなので無改修でヒット。
- **検証**: 型0・lint0・全403テスト緑(precomputed 統合を srp/3bet × turn/river に拡張・ドリル生成を両 pot 種別に)・build緑(main bundle 不変)。Playwright で 代表ボード+3betポット → A高ブリック盤・ポット22.5BB・厳密解(事前計算)即時採点を実測。

### 2026-06-06 マルチウェイの「あなたの勝率」を参考値として表示
- **背景**: ゲーム(study答え合わせ)で勝率が「—」になる主因はマルチウェイ(`resolveOpponentRanges` が `villains.length!==1` で null)。8エージェントのワークフローで全原因を検証(別の表示面なし・ショーダウン後も holeCards はスナップショットに残る等を確認)。ユーザー要望で「参考として出す」対応。
- **実装**: `resolveOpponentRangesEx(state, heroId): { ranges, reference } | null` を新設。アクティブ相手全員の想定レンジをラインから推定し、2人以上なら `reference:true`、一人でも推定不能(リンプ・未収録ライン)なら null(偽値を出さない)。`resolveOpponentRanges`(HU専用)は後方互換で委譲(既存テスト不変)。`computeEquity` は元々 N 相手対応(hero が全員に勝てば勝ち・タイ分割・カードリムーバル厳密)なので計算層は無改修。`useEquity` の `EquityState` に `reference` を追加し `LiveStrategyPanel`/`OddsGuide` が「あなたの勝率(参考)」+注記。
- **敵対的レビュー(2観点)で1件採用**: マルチウェイで「✓ コール有利 / ✗ フォールド寄り」を生の勝率 vs ポットオッズで断定するのは、背後の未行動プレイヤー・含意オッズ・実現割引を無視し**ルール1違反**。→ `reference` 時は判定バッジを出さず参考数値のみ(ポットオッズ/必要勝率/参考勝率)に。レビューの「samples不足/async stale」blockerは却下(前者はHU既存・参考値として許容範囲、後者は `cancelled` ガードで既に防御済=誤指摘)。
- **検証**: 型0・lint0・全398テスト緑(opponentRangesEx +5・LiveStrategyPanel multiway 参考表示+✓/✗非表示を追加)・build緑(main bundle 不変)。

開発中の試行錯誤・未確定の判断はここに書く。
固まった再利用知見は /harvest で brain/30_Tech_Notes/ に蒸留する。

## 設計判断

## TODO

## 試行錯誤ログ

### [auto] 2026-05-31 セッション変更ファイル
- `CLAUDE.md`
- ※自動収集。要点・設計判断は手動で追記し、固まったら `/harvest poker-gto` で蒸留する。

### 2026-06-06 GitHub Pages 公開 (PWA一本化)
- **配布先の選定**: Cloudflare Pages はリポジトリを private のまま使え商用フレンドリーだが、最終的に GitHub Pages を採用。public ソース公開を許容する判断（ユーザー選択）。
- **private では不可**: Free プランでは private リポジトリで Pages を有効化できず 422 を確認 → リポジトリを public 化して対応。
- **Pages 有効化**: `build_type=workflow` で有効化。
- **サブパス対応**: プロジェクトサイトのため `base='/poker-gto/'`。manifest / service worker / inject の相対パス化で固め、`index.html` に `%BASE_URL%` を導入。検索除けに `noindex` meta を追加。SW 登録は `import.meta.env.BASE_URL` 経由に。
- **自動デプロイ**: `.github/workflows/deploy-pages.yml` を追加。main への push で build → Pages 公開。
- **PWA一本化**: Tauri はデプロイ計画から降格（src-tauri/ はコードとして保持・ビルド/配布はしない）。
- **結果**: https://one-shine.github.io/poker-gto/ で稼働（HTTP 200 確認）。338 テスト green。
- **収益化の注意**: 本格収益化するなら Cloudflare Pages へ移行（base を `'/'` に戻す1行のみ）。
- **フォローアップ**: deploy-pages.yml / ci.yml の actions が Node20 で deprecation 警告 → @v4→@v5 へ更新する。
  - ✅ **対応済(2026-06-06)**: 実体の最新メジャーを裏取りし、`checkout`/`setup-node` は @v6、Pages 系ペア(`upload-pages-artifact`/`deploy-pages`)は @v5 へ更新(checkout/setup-node は既に v6 が最新で、当初メモの @v5 想定より進んでいた)。これで Node24 ランタイムへ移行し、2026-06-16 の Node20 強制廃止に先んじて解消。設定は最小構成(`node-version:'22'`/`cache:npm`/`path:dist`)のため破壊的変更の影響なし。残: 実 CI で緑を確認。
  - ⚠ **CI 赤の別要因を発見**: actions 更新後の CI で `checkout/setup-node/lint/build/test` は全 success だが **Audit ステップが failure**。原因は actions 無関係で、`vitest`/`@vitest/ui`(3.2.4)の critical 2件(GHSA-5xrq-8626-4rwp)を `npm audit --audit-level=high` が検知。dev 依存で本番非同梱。修正は `vitest@4.1.8` への破壊的更新が必要 → BACKLOG E「CI: npm audit 失敗(vitest 脆弱性)」に記録、別タスクで対応。

### 2026-06-06 ゲーム UX 是正(U7/U8/U9 ・スマホ中心)
- **U7 アクション履歴がスマホで邪魔**: `BetLine` を `GamePage` で `hidden sm:block`(モバイル非表示)。卓の各シートが直近アクションを出すので冗長。
- **U8 GTO戦略の事前表示で答えが先に見える**: study の戦略パネルを「アクション**前**の常時表示」→「アクション**後**の答え合わせ」へ。
  - `gameStore` に `lastHeroDecision`(打った payload+action を保持)を追加。`submitHeroAction` で記録、`HAND_START`/`resetGame` でクリア。
  - `LiveStrategyPanel` に `revealActed?` を追加(ヘッダ「答え合わせ — あなた: ◯◯」)。reveal 時は `markHinted` しない=**事前に見せないので精度サンプルに入る**(測定が正直に)。
  - `GamePage`: `pendingHeroAction` 中は `ActionPanel` のみ(戦略非表示)、打った後の「相手の番」中に reveal。
  - 既知の穴: 自分の決定がそのままハンド終了(HU リバーのコール等)する局面は reveal が出ず結果/復習に委ねる。
- **U9 相手アクションが速すぎる**: 「間」を読める速さへ(fish 550–1100 / gto 650–1300ms・従来比約2倍)。
  - 遅延算出を engine から **UI 層(`gameStore`)へ移設**(engine の設定非依存を維持)。`settingsStore.aiSpeed`(slow1.7 / normal1 / fast0.5)を emit 時に読むので再初期化なしで即反映。
  - engine の `fishDelayScheduler`/`gtoDelayScheduler` は残置(未使用)。
- **設定 UI**: 「相手アクションの速さ」3択を追加。study 戦略トグルの文言を「常時表示」→「アクション後の答え合わせ」に是正。
- **検証**: 型 0・**全 338+1=新規テスト含め緑**(`LiveStrategyPanel` に reveal モードのテスト追加)。`npm run build` 緑。

### 2026-06-06 ゲーム卓のモバイル収まり是正(U10・Playwright 実測)
- **症状(スマホ)**: 「自分のカードとアクションボタンが重なる」「スクロールしないと全体が見えない」。
- **原因**: デスクトップだけ `useContainSize` で幅×高さ両フィットさせ、モバイルは CSS `aspect-[5/6]`(幅基準)で**高さ無制約** → 卓が縦に溢れ、`top:90%` のヒーロー席(固定サイズ)が卓ボックス下にはみ出してアクション領域に重なっていた。
- **対応**:
  - モバイルも `useContainSize(isMobile?5/6:16/9)` で利用可能高さにフィット。`GamePage` の測定高さ `tableH` を**モバイル卓コンテナにも付与**(従来 `isMobile||!gameState?undefined` を `!gameState?undefined` に)。`GamePage` の `isMobile` は不要になり削除。
  - `SEAT_POS_MOBILE`: ヒーロー 90→86、上席 8→13、左右席を上げて分離。`PlayerSeat` のヒーローカードを compact 時 md→sm に縮小(席が小さくなり重なり減)。
- **検証**: Playwright を local dev(390/360/430 幅 × 640–844 高 + デスクトップ1280)で駆動し bounding box 実測。全モバイルサイズで **no-scroll**・**札↔ボタン gap 5–21px**・**上端見切れ解消**・ヒーロー↔側席の重なり解消(360幅のみ側席バッジが軽微近接)。デスクトップ回帰なし。型0/lint0/test339緑/build緑。

### 2026-06-06 残バックログ一括(U4/U5/U6/U11/U12)— 計画ワークフロー + 順次実装
- **進め方**: 4並列の計画ワークフロー(各機能の現状コード精査→構造化計画)を回し、ファイル競合を避けて U11→U6+U12→U4→U5 の順に実装・検証・コミット。最後に Playwright で全UI目視。
- **U11 データ移送**: `src/lib/storage/dataTransfer.ts`(exportAll/importAll・3 persist 先を束ね・完全ローカル・version 検証/部分インポート)+ SettingsPage に書き出し/読み込み。
- **U12 レンジ選択**: 27ピル羅列→種別×シナリオ2段選択。`preflop.ts` に `scenarioKind/scenarioOpponent/scenariosOfKind`(id規則・単一の真実源)。RangeVsRange は optgroup 化。
- **U6 ヒートマップ**: `RangeGrid` に `heatmap`(off/raise/call)。暗→色の濃淡+角に頻度%+グラデ凡例。**EV は出さない**(approximate 規約・RangeCell に EV 無)→頻度のみ。
- **U4 ドリル成績**: 新規 `drillStore`(IndexedDB)。byKind/byBucket/recent。3パネルで `recordDrill`。`evLossFrom`(postflop/pushfold のみ)。Dashboard/DrillTab に表示。
- **U5 ハンド履歴**: `HandSummary` 型 + `sessionStore.handSummaries`。gameStore で純損益算出(netBB=グロス受取−拠出、拠出=開始−終了stack)。History に勝敗/純損益/ミス印、HandReplay にミス→理論/ドリル導線。handId 突合・旧履歴は degrade。
- **検証**: 型0・lint0・**全359テスト緑**(+20: dataTransfer6/preflop.helpers4/drillStore5/evLoss3/sessionStore+2)。Playwright で 5機能すべて実機表示確認(ヒートマップ・2段選択・ドリル成績カード・履歴の勝敗バッジ+⚠+理論/ドリル導線・設定ボタン)。
- **設計判断**: ドリルは集計軸が MistakeCategory に乗らない(postflop=street/potType, pushfold=role/stack)ため progressStore 拡張でなく専用 `drillStore`。純損益は「配当を stack に戻さない」実装前提(将来 payout を stack 反映する変更が入ると二重計上 → gameStore に理由コメント)。

### 2026-06-06 スマホ scroll(iOS 100vh)/レンジ data/対象外整理 + 残注記
- **U13 scroll(a+d)**: スマホで「レンジ等が下まで見れない/ゲームで操作までスクロールが要る」原因は AppShell の `h-screen`。iOS の 100vh は URL バー込みで可視領域より高く、下端のナビ/ボタンが画面外に。→ `h-dvh`(+ `#root` 100dvh フォールバック / ErrorBoundary `min-h-dvh`)。全ページ + ゲームを一括解消。Chromium では dvh==vh のため Playwright では再現不可だが、定石の修正。
- **U14 レンジ data(b)**: `utgOpen`/`mpOpen` の suited ace 中抜け(A8s/A7s/A6s 飛ばし)を補完。ドリフトガードの widthPct 更新(utg .134 / mp .176)。R4 一括置換方針は不変=アーティファクト是正のみ。
- **U15 対象外(c)→B 実装**: 設計ルール4どおり、マルチウェイで HU レンジを「参考値」表示するよう実装。
  - 設計: **表示経路と精度経路を分離**。`resolveSpotKey(state, hero, { multiwayReference })` を追加し、表示(`useSolution`→`LiveStrategyPanel`)だけが cold-call ありの defense を `multiway:true` で解決。`CoachAgent`/`GTOPlayerAgent` はオプション無し=従来どおり null で除外(ルール4の精度除外 4a を不変に保つ)。
  - `getSolution` は `spot.multiway` のとき共有インスタンスを mutate せずコピーに `multiwayReference:true` を付与。`LiveStrategyPanel` は「マルチウェイ=参考値」バッジ+注記、EV 非表示。
  - multiway 判定は activeCount でなく「defense で cold-call が居るか」。RFI の背後ブラインドを誤って multiway 扱いしない(初版のバグを修正)。
  - 残: 未収録ディフェンス(MP vs UTG 等)・盲対盲・squeeze は依然レンジ自体が無く対象外(R4で拡充)。テスト+3。
- **残注記の片付け**: U8(自分の手でハンド終了する局面でも答え合わせを New Hand 上に表示=共通化した `strategyReveal` を hand-complete branch にも描画)/ U7(モバイル非表示で解消・トグル不要と判断)/ U10(360幅の側席近接は最小幅制約上の許容)。
- **検証**: 型0・lint0・全テスト緑・build緑。

### 2026-06-06 U17 フォールド後スキップ / U18 オッズ目安の常時併記
- **U17**: フォールド後は残りの AI を遅延0で即決着。`gameStore` にモジュールフラグ `heroFoldedThisHand`(`submitHeroAction(fold)` で立て・`HAND_START`/`resetGame` でリセット)、`delayScheduler` が遅延0へ分岐。結果表示→手動 New Hand。U16 ポーズ→「次へ」→瞬時決着の順。store の `gameState` は AI ハンドラ登録順で1手 stale になるためフラグ方式で同期。
- **U18**: `LiveStrategyPanel` に共通 `OddsGuide` を導入し GTO に常時併記(バー下=副 / 対象外=主)。コール直面=ポットオッズ/必要勝率/勝率→コール有利・フォールド寄り、チェック局面=エクイティ強弱。注意書きを1行に簡潔化(要望)。`useEquity` 常時化・`showPotOdds` prop 廃止(GamePage 受け渡しも除去)。ミス時は CoachPanel が答えを出すため reveal は出さない設計は維持。
- **検証**: 型0・lint0・全365テスト緑(U17/U18 のテスト更新+追加)・build緑。Playwright で対象外スポットの reveal に OddsGuide(エクイティ強弱・短い注意書き)が主表示されることを実測。U17 は unit test(フォールド→遅延0で即決着・handCount===1)で確証。

### 2026-06-06 オッズ学習の組み込み(オッズドリル + 答え合わせ→理論リンク)U19
- **オッズドリル**: 新規 `lib/drill/oddsDrill.ts`(純計算・ソルバー不要)。3種=必要勝率 B/(P+2B)/コール判断(勝率vs必要勝率)/アウツ→勝率(×2/×4)。`generateOddsQuestion`/`judgeOdds`、検証用の `meta` 付き。`OddsDrillPanel`(PushFold をテンプレ)は種別 seg・正誤+計算解説・`TermChips`+`ConceptLink('pot-odds')`、`drillStore.recordDrill(kind:'odds')`。
- **既存資産の再利用**: 理論 `pot-odds`・用語集(ポットオッズ/エクイティ/アウツ/EV)・`TermChips`/`ConceptLink`・`drillStore`(U4)。`DrillKind` に `'odds'` 追加、`LearnPage` の DrillTab に4つ目タブ+`DRILL_KIND_JP`/`DRILL_KINDS`(ダッシュボード/通算が自動対応)。
- **ゲーム側の導線**: `LiveStrategyPanel` の `OddsGuide`(U18)に `ConceptLink('pot-odds', 'オッズの理論 ▶')`+用語チップ。答え合わせのオッズ目安から理論/用語へ。
- **検証**: 型0・lint0・全372テスト緑(oddsDrill 6 + LiveStrategyPanel リンク+2)。build緑。Playwright で「学習→ドリル→オッズ」タブ→必要勝率の問題に正解→計算解説+用語チップ+関連理論→pot-odds 理論ページ遷移・通算成績記録を実測。

### 2026-06-06 CI(vitest 4.x で audit 緑化)+ 事前計算 postflop ライブラリ(代表ボードドリル)
- **CI**: `vitest`/`@vitest/ui` を `^3.2.4 → ^4.1.8`(semver-major)に更新し GHSA-5xrq-8626-4rwp(critical 2件)を解消。`npm audit --audit-level=high` 0件・CI Audit 緑。vitest4 が node 型を transitive 供給しなくなり、scripts/.cache を読む2 test(attachHeuristicEV/heuristicPreflopEV)が `node:fs` 等を解決できず型エラー → ファイル局所に `/// <reference types="node" />` を付与(app 全体の types へ node を足すと本番 src へ process/Buffer が漏れバグを隠すため、影響を test に閉じ込め)。commit `0ea891c`。
- **事前計算 postflop の設計判断**: ゲームもドリルも盤面はランダム(`shuffledDeck(rng)`)→ 完全一致の事前計算解はランダム盤面にほぼヒットしない。ランダム盤面をカバーするにはテクスチャ近似(カードアブストラクション)が要るが、それは**ルール1の正直表示に抵触**(近似を厳密と称せない)。→ 正直に価値が出る「こちらが盤面を選ぶ場面」=**代表ボードドリル**に限定(ユーザー承認済)。
- **正直なストリート**: river=後続なし=厳密 / turn=完全チャンスCFR(river 全48 runout 織り込み)のみ `solver_precomputed` と名乗れる。flop は ~13% 下限(アブストラクション構造)で対象外=従来通りライブ/近似。
- **実装**: ① `postflopNode.ts` に hero ノード特定(`heroNodeTarget`/`findHeroNode`)+ combo 行正規化(`comboActionsAt`・bet→raise)を抽出し、ライブ経路 `solveRiverSpot` をリファクタ(挙動不変・既存137テスト緑)→ スクリプトと共有しドリフト防止。② `representativeBoards.ts`(代表テクスチャ turn4/river4 + `representativeHeroCombos`= 事前計算と同一の narrow/cap でドリルの hero 抽選を必ずヒットさせる)。③ `getSolution` postflop に precomputed テーブル参照(盤面/pot/stack/betFrac 完全一致時のみ・**any mode で動く**=モバイル/オフライン可)。④ `scripts/precompute-postflop.ts`(オフライン生成・turn は iters160/cap64 で exploit 1〜2%台=ライブturn8%超を大幅改善 / river <1%)。⑤ ポストフロップドリルに「代表ボード」トグル+テクスチャ表示+厳密解バッジ。
- **オフライン高品質**: ライブの時間予算(turn=40iters/cap50→8.4%)に縛られず、turn を 160iters/cap64 に上げて 1〜2%台へ。cap は O(combos²) なので 110/400 だと 0.6% だが 74s/spot と過大 → 64/160(≈12s/spot・1.8%)を採用。全64ファイル ≈7分のワンタイム生成。
