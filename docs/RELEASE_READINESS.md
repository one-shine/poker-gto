# 公開準備レビュー — 対応トラッカー

> Phase 4 完了時点(2026-05-23)の自己レビューで洗い出した「一般公開に必要な項目」の正典。
> 各項目を対応フェーズに割り当て済み。状態: ⬜ 未着手 / 🔄 進行中 / ✅ 完了。
> 親計画: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

## 総合判定(レビュー時点)
> 旧判定 (Phase 4 完了時, 2026-05-23): 「完成度の高いプロトタイプ」。土台・UI・正直さ(出典明示)は高品質だが、
> **「GTO学習アプリ」の看板に対し実際に学べる範囲が狭い**(ポストフロップ無言・プリフロップ10/21・近似のみ)。

### 最新判定(2026-05-28 セッション完了時)
**R1–R4 のブロッカー 4 件のうち 3 件が解消** (R1/R2/R3 ✅、R4 は 100BB 完全化のみ残)。
- ポストフロップ: hero=OOP/IP × lead/被ベット/被レイズ × SRP/3betポットで Coach 稼働 (R16)
- プリフロップ: 21/21 スポット網羅 + opener 5 + defender 5 で概算 EV 稼働 (R4-A/B) + push/fold 7 段階で厳密解
- 全スポットで `source` バッジ + EV 数値表示 (approximate / approximate_with_ev / solver_live / solver_precomputed の 4 段階)
- 「学習アプリとして公開水準」を**満たすライン**に到達。R14② (turn 賭け考慮・完全チャンス CFR) ✅ 完了。flop 賭け考慮は **エンジン実装済だが GTO 品質のライブラリ生成は当環境では不可**(full-tree CFR が exploitability ~13% で頭打ち=アブストラクション下限・サーバ/カードアブストラクション前提)→ flop はエクイティ近似のまま正直に表示。残る精度向上は R4 (100BB 厳密解)・R11/R19 (近似レンジ監修) 等の漸進的改善。

## 対応表

| ID | 指摘 | 重大度 | 対応フェーズ | 状態 |
|----|------|--------|------------|------|
| **R1** | ポストフロップのコーチが完全に不在(`getSolution` postflop=null → フロップ以降フィードバックなし)。**ブロッカー解消済 ✅** 2026-05-28 時点: R16 で hero=OOP/IP × lead/被ベット/被レイズ/チェックレイズ × SRP/3betポット × ライブ配線まで対応済み。実機で Coach がポストフロップでもフィードバック可能。残課題は (1) turn/flop の精度向上 = **R14②** に切り出し済み、(2) マルチウェイ = 設計ルール4で**意図的に除外**、(3) raisesLeft≥2 の再々レイズ応酬 = カバレッジ拡大の課題で軽度。R1 自体は β 公開水準に到達。 | 🔴→🟢 解消 | Phase 3.5 + Phase 5 | ✅ ブロッカー解消・残は R14② で吸収 |
| **R2** | プリフロップ網羅 **21/21 スポット完了✅**(2026-05-26)。①defender 4スポット(SB vs CO・BTN vs UTG/MP・CO vs UTG)②**非BB防御のライブ・コーチング配線**(`POS_VS_SPOT` + `getPreflopActionOrder` で clean fold-around 判定)③**facing-3bet 5スポット**(BTN/CO opener × SB/BB/BTN 3better、4bet/call/fold)。`preflopSpotId` を raises.length=2(open+3bet・HU限定)に拡張、スクイーズ/コールド参加は除外。RangeGrid/RangesPage の凡例を 3bet スポットで「4-Bet」表記に。すべて approximate手作り(R11 監修対象)。**プリフロップのみ配線**(postflop は deriveRiverRanges 非対応で正しくスキップ)。マルチウェイは設計ルール4でGTO精度除外=対象外 | ✅ | 完了(実解置換は R4/将来) | ✅ 21/21 |
| **R3** | 「実EV損失」が実質ドーマント(approximate は ev=0、数値は solver_* 時のみ→現状出ない)。**ブロッカー解消済 ✅** 2026-05-28: ①ポストフロップ flop/turn/river で `solver_live` の実 EV が稼働(R16 + R15)、②プリフロップ push/fold 7 段階で `solver_precomputed` の厳密 EV、③プリフロップ opener 5 + defender 5 で `approximate_with_ev` の概算 EV(R4-A/B)。これでほぼ全スポットで Coach が evLoss を数値表示できる。残: 100BB open/3bet を `solver_precomputed` レベルに引き上げる = **R4 100BB 完全化** (別軸・サーバ事前計算級)。 | 🔴→🟢 解消 | Phase 3.5 | ✅ ブロッカー解消・残は R4 100BB に集約 |
| **R4** | 本物のソルバー解が無い(全レンジ手作り近似、trainer 相手も近似ベース)。**R4-A 実装済 ✅** 2026-05-28: `src/lib/solver/heuristicPreflopEV.ts` でヒューリスティック open-raise 求解(fictitious play + postflop EV = `(equity-0.5) × 30BB`)。BTN open vs BB call の 169×169 fictitious play で per-category EV/頻度を算出。exploitability < 0.005 BB/hand。実出力: opener レンジ ~51%(AA/KK/QQ/AKs 100% raise EV +2〜3BB / 72o-32o 0% raise EV -0.35〜-0.67)、caller ~28%(3bet 無しのため実 GTO ~55% より狭い・既知の限界)。テスト 5 件(AA bullish / 72o folds / 単調性 / 収束 / raiseSize 影響)。**R4-B 実装済 ✅** 2026-05-28: `attachHeuristicEV.ts` + `scripts/precompute-preflop-ev.ts` で opener 5 spot(btn/co/mp/utg/sb-open)の EV 付き解を JSON 生成(`src/data/solutions/preflop-ev/*.json`、各 6-22KB・lazy import → 個別 chunk 5-10KB)。`SolutionSource` に `approximate_with_ev` 追加。`getSolution` の優先順位: solver_precomputed > approximate_with_ev > approximate。`CoachAgent` を `isHandBuilt` で両 source 対応(未収録=fold 100% 扱い継続)。UI: `GameFooter`/`StrategyDetail`/`LiveStrategyPanel`/`StrategyBars` に「GTO近似 + 概算EV」バッジと `~` プレフィックス付き EV 表示(approximate と区別)。テスト 6 件。これで opener spot で **evLoss が稼働** = Coach が「-1.2BB の損失」を数値で示せる。**defender bb-vs-X 拡張 ✅** 2026-05-28: `computeDefenderHeuristicEV` + `buildOpenerRaiseFreq` を追加し、bb-vs-{utg,mp,co,btn,sb} の 5 defender spot を precompute。EV(call) = avail × opener raise 頻度加重の `(eq-0.5)×F` (BB 視点)、EV(fold) = -bb、EV(raise/3bet) = 0 (TODO: opener 4bet/call/fold 連鎖が複雑)。テスト 5 件 (AA 高 call EV / fold=-1 / 単調性 / 弱手 < fold / 頻度保存)。これで defender spot でも Coach が **call vs fold の evLoss を算出**できる (例: 22 call EV -1.4BB vs fold -1BB → 22 call は -0.4BB のミス判定)。 | 🔴 ブロッカー | Phase 3.5(実解取込) | 🔄 **HU プッシュ/フォールドは厳密 GTO を自前生成 + opener 5 + defender 5 spot の概算EV 稼働 + トレーナー UI 稼働** (`scripts/solve-pushfold.ts`→`hu-pf-*.json`, `solver_precomputed`, ショーダウン=オールイン勝率=真値)。学習→ドリル→「プッシュ/フォールド」で stack/立場(SB/BB/ミックス)別に出題・**実EV表示**・厳密解判定。**スタック拡充✅**(2026-05-27): 5/8/12/25BB を追加生成し **5/8/10/12/15/20/25BB の7段階**を網羅(exploitability 0.0003〜0.0017・push頻度は 5BB 131/169→25BB 74/169 と単調に縮小=公開Nashチャート整合)。トレーナーは `PUSHFOLD_STACKS`(JSON自動発見)で自動反映。**バンドル改善**: `getSolution` の precomputed glob を eager→**spotId一致のみ遅延import**化し、push/fold JSON を gameStore チャンクから排除(223KB→41KB・旧来の +80KB 肥大も解消)。残: 100BB オープン/3bet は postflop EV 要(別軸・厳密不可) |
| **R5** | セッション統計が非永続(リロードで精度・ハンド履歴が消える) | 🟠 | **Phase 4.6**(前倒し)/ 恒久は Phase 5 IndexedDB | ✅ |
| **R6** | study モードは GTO精度が常に N=0(常時戦略=全ハンド hinted 除外)。ユーザーが戸惑う | 🟠 | **Phase 4.6**(UX調整:測定用ドリル/トグル) | ✅ |
| **R7** | study の「一時停止」が見かけだけ(エンジンは止まらず裏で進行) | 🟠 | **Phase 4.6**(実エンジン停止) | ✅ |
| **R8** | エクイティ(自分の勝率)未計算。A2 は必要勝率のみで片手落ち → **Phase 5 で解消(下表 R8 詳細参照)** | 🟠 | Phase 5(Monte Carlo worker) | ✅ |
| **R9** | Lint が7件失敗(setState-in-effect×3 / any×2 / 未使用 `_opts` / react-refresh×1) | 🟠 | **Phase 4.6**(即時・低リスク) | ✅ |
| **R10** | 勝者ハンドのハイライト・トータルポット表示・モバイル実機検証 | 🟡 | Phase 6(DESIGN バックログ B1/B3/D2 と同一) | ⬜ |
| **R11** | 近似レンジの監修(追加した UTG/MP/BB-vs-X の頻度妥当性)。**監修パス実施 ✅** 2026-05-29: 全21スポットを現代100BB 6-max GTO の一般理論と突合。RFI 頻度 (UTG≈16/MP≈19/CO≈28/BTN≈44/SB≈58) は標準レンジ内・**明確な誤りなし**。UTG の suited wheel ace 選好 (A9s/A5s/A4s 採用・A8s-A6s 不採用) はソルバー傾向と整合。BB ディフェンス・3bet-or-fold (SB OOP)・対3bet 4bet混合も妥当。**ソルバー水準の精密化は L1 (他社解の同梱禁止) により実データ生成 = R4 の領域**。現状は honest な手作り近似として公開水準。 | 🟡 | Phase 3.5(実解置換=R4 で解消)+ 随時監修 | 🔄 監修パス済・実解精密化は R4 |
| **R12** | (Phase 4.6 レビュー)一時停止フラグが appMode 切替(study→play)で残留しうる。`startNewHand` で解除済のため実害は次ハンドで解消 | 🟡 監視 | 緩和済 | 🔄 |
| **R13** | (Phase 3.5 レビュー)ライブ求解中に「データ準備中(評価対象外)」と誤表示 → `useSolution` に loading 状態追加、LiveStrategyPanel で「GTO解を求めています…」(スピナー)/「評価対象外」を区別 | 🟠 UX | 即時修正 | ✅ |
| **R14** | (3.5)turn/flop はエクイティ近似(以降のベッティング無視)でドロー過大評価。①**信頼度の明示**(CoachPanel に「簡易: 賭け未考慮」+「収束 X%」)で誤った権威付けを解消 ✅。②**精度の本丸=完全チャンスCFR ✅ 実装完了 (2026-05-30)**: `turnSolver.ts`(turn ベッティング→ChanceNode(river札)→river ベッティング→厳密ショーダウンの2街CFR)。getSolution が turn で opt-in(**全48 runout 列挙**・combo50・iters40)。バッジ「賭け考慮済 (runout 48)」。性能 6.9–9.9s・exploit 4.3–5.3%。ground-truth(ベット無=エクイティ近似一致)で会計検証→EV 正規化バグを発見・修正。さらに**レビューワークフローがランナウト抽出バグ(suit-block ストライドで ~5 ランクのみ→全列挙に修正)を検出・修正**。flop(3街2チャンス層)は事前計算案件として見送り。 | 🟠→🟢 精度 | ①Phase 3.5 ✅ / ②2026-05-30 ✅ | ✅ turn 完了 (flop 見送り) |
| **R15** | (3.5→**実装済 ✅** 2026-05-28)postflop の入力レンジの精度向上。①**コンボ上限を 100→200・top-N から「重みしきい値 0.05 + 上限」へ**: 尾部の意味ある mixed 戦略(0.05〜)を保護しつつ SRP の超巨大レンジ(200-570 combos)を許容範囲に圧縮。実測 (`scripts/measure-ranges.ts`) で 90%+ カバー(従来 18%)。②**River 限定 board 強度 narrowing**: 5枚ボードの rankValue で下位20%を落とし「フロップ/ターンを peel しなかった手」を近似。`rangeNarrowing.ts` に分離(9テスト)。must=hero 必ず保持・board overlap は drop 優先。turn/flop はドロー価値必要のため R14②(完全チャンスCFR)領域として未着手。性能影響: river/turn 求解 720ms→2.8s (4×, vitest timeout を 15s に拡張)。 | 🟠 精度 | Phase 3.5 精密化 + R4(実preflop解) | ✅ R15-A/B 完了 |
| **R16** | (3.5)postflop コーチのカバレッジ拡大 → **hero=IP対応 + レイズ応酬対応✅**(2026-05-26)。`deriveRiverRanges` は bb-vs-X(OOP)+ X-open(IP)両対応。`getSolution` が `raiseSizes:[0.5]` を渡し、被ベットノードに **raise(OOP=チェックレイズ / IP=レイズ)** が加わる(`riverSolver` の `facingBet`/`raisesLeft` は元々対応・未使用だった)。被ベット時 hero は fold/call/raise で評価。ポストフロップドリルでも3択化。実機確認(BTN-open IP 被ベット=fold11%/call87%+raise)。**3bet pot postflop ✅**(2026-05-27): `deriveRiverRanges` を `potSpec()` 経由に一般化し `3bp-{hero}-vs-{villain}`(5ポット×両視点=10スポット)を追加。3betレンジ=`{3better}-vs-{opener}` raise / 対3betコールレンジ=`{opener}-vs-{3better}-3bet` call。ポストフロップドリルに「ポット種別(シングルレイズド/3betポット)」トグル+`heroRangeSpec()`。ポット≈22.5BB・残り≈89BB。実機確認(SB 3betポット vs BTN・K9s 2pair on AK9→レイズ99% +11.22BB)。**被レイズ深いノード ✅**(2026-05-27): hero が自ベット/チェックレイズをレイズし返された節([1,2]=OOP被レイズ / [0,1,2]=IP被チェックレイズ)を `SpotKey.facingRaise` + `getSolution` targetPath で対応(`riverSolver` は raiseSizes 指定時に元々生成済・到達していなかっただけ)。ポストフロップドリルに3択目「被レイズ」(fold/call のみ・hero ベット額→相手レイズ to 額を明示)を追加。実機確認(リバー被レイズ・ワンペア→フォールド94% -6.38BB)。**ライブコーチング配線 ✅**(2026-05-27): `resolveSpotKey` のポストフロップを `postflopBase()` で再構成するよう刷新。**IPオープナー postflop の長年のバグを修正**(defender のコールを limp 誤判定して null を返していた→ btn-open 等が実ゲームで稼働)。3bet ポット(open→3bet→call → `3bp-{hero}-vs-{villain}`)・被レイズ(hero ベット→villain レイズ)も実ゲームで検出。`baseHeroIsOOP()` クロスチェックで SB盲対盲の IP/OOP 反転を除外。postflop resolveSpotKey テスト +8(従来ゼロ)。実機: 配線後も study/コーチ 0 console err。残: マルチウェイ・SBコンプリート・再レイズ応酬(raisesLeft≥2) | 🟢 カバレッジ | ✅ IP+チェックレイズ+3betポット+被レイズ+ライブ配線対応 |
| **R17** | (3.5)exploitability 未計測 → best-response 計算で算出。`NodeSolution`/`CoachFeedback` に載せ、CoachPanel に「収束 X% pot」表示。収束テスト(反復↑で↓・<5%)。※CFR収束の指標でありエクイティ抽象化誤差(R14)は別 | 🟡 | Phase 3.5 | ✅ |
| **R18** | (3.5→**実装済 ✅** 2026-05-28)`solveCache.ts` に2層 LRU/上限を実装。L1 メモリ: Map の挿入順 = LRU、get で再昇格、超過時に最古を捨て (`MEM_LIMIT=200`)。L2 IDB: 件数上限 (`IDB_LIMIT=1000`)、put 時に count() を見て超過なら `solvedAt` 昇順で `IDB_BATCH_TRIM=50` 件まとめて削除 (毎 put フルスキャンしない)。`clearSolveCache()` を追加 (テスト/メンテ用)。テスト 3 件追加 (mem 上限 / LRU 再昇格 / IDB トリム最古先頭から削除)。 | 🟡 | Phase 6(LRU/サイズ上限) | ✅ |
| **R19** | (4.5レビュー)理論コンテンツ(17コンセプト + 48用語)は手書き。数値(オープン頻度 UTG15/BTN45、バリュー:ブラフ 2:1 等)は概算で、レンジ同様**監修が必要**。誤字「sui ted」を1件修正済。**数値監修パス ✅** 2026-05-29: 主要数値を教科書理論と照合 — RFI 頻度 (UTG15/MP18/CO27/BTN45)・リバー pot bet の value:bluff = 2:1・必要勝率の例 (3/(6+3+3)=25%) すべて正確。**内部不整合を1件修正**: 理論の「SB 40%」が app の実 SB レンジ (raise-or-fold で ≈58%) と乖離 → 「SB 約55%(リンプ無し前提で広がる)」+ SB サイズ 3BB 注記に是正し data と整合化。 | 🟡 内容 | 随時監修(R11 と同枠) | ✅ 数値検証済・内部不整合是正 |
| **R20** | (4.5)`PositionStatsTable` の**推定精度**は近似: 母数=ヒーローHU判断数(コーチ未評価スポットも含む)、分子=判断数−`sessionStore.mistakes`。ヒント除外・未評価スポットを厳密に扱わず楽観寄り。「推定」表記+注記で緩和 | 🟡 精度UX | 厳密化は per-position 評価集計を持てば可(Phase 5/6) | 🔄 緩和済 |
| **R21** | (4.5→**実装済✅** 2026-05-28)レンジvsレンジに**ボード上のエクイティ分布**を追加。`lib/equity/rangeVsRange.ts`(コンボごとに相手レンジ全体へのエクイティを算出→10分位ヒストグラム・平均エクイティ=レンジ優位・ナッツ級/弱い手比率=ナッツ優位)。river=厳密・flop/turn=seeded MC(400ランナウト)。`equity.worker.ts`/`equityClient.ts` を rangeInput 系統に拡張(Worker共有)。RangesPage「レンジ比較」タブに `RangeEquityDistribution`(ボードプリセット6種+ランダムフロップ・advantageバー・2ヒストグラム)。色覚配慮(横軸=エクイティで読める・凡例マーカー)。入力レンジは手作り近似のため**参考値**と明示。検証6件(AA圧勝/avg和≒1/セットのナッツ優位/正規化/seed再現/空レンジ)。189テスト | 🟢 機能 | ✅ | ✅ |
| **R22** | (4.5→**実装済 ✅** 2026-05-28)集計ロジックを純関数モジュールに切り出してテスト。①`src/lib/analysis/positionStats.ts` に `aggregatePositionStats` + `estimateAccuracy` を切り出し、`PositionStatsTable.tsx` から import。テスト 9 件 (空入力 / VPIP/PFR 区別 / MW 除外 / ミス紐づけ / 異常データ防御)。②`src/lib/ranges/rangeStats.ts` に `rangeStats` + `combosForHand` を切り出し、`RangeVsRange.tsx` から import。テスト 10 件 (空 / AA / 混合カテゴリ / pure fold 除外 / 実シナリオ sanity)。これでアドホックリファクタの逸脱を防止。 | 🟢 | 随時(集計をpure module化してテスト) | ✅ |
| **R8** | エクイティ Monte Carlo worker(`monteCarlo.ts`+`equity.worker.ts`+`equityClient.ts`)実装。相手レンジ指定でシミュレートし、study(intermediate+)で「あなたの勝率」を必要勝率と並べて表示・オッズ充足判定。検証テスト4件(AAvsKK/タイ/ナッツ/空レンジ) | 🟠→✅ | Phase 5 | ✅ |
| **R23** | (5レビュー)ポストフロップドリル**実装済✅**(2026-05-26): `postflopDrill.ts`+`PostflopDrillPanel.tsx`。HU SRP(bb-vs-{btn,co}/{btn,co}-open)でランダムボード+レンジ内hero手を出題→自前CFRを**都度求解(async)**→返却アクションから選択肢を動的生成(lead=check/bet / 被ベット=call/fold)。**実EV併記**・source=`solver_live`(△ ローカル求解と正直表記)。XP 8/3。ストリート切替(flop/turn/river/mix)。ドリルタブに統合。146テスト | 🟢 機能 | ✅ | ✅ |
| **R24** | (5)エクイティの相手レンジは近似: 非BBの相手は一律「オープンレンジ」、BBは「bb-vs-hero ディフェンスレンジ」。実際のアクション系列(3bet/コール経路)は未反映。HU 限定・多人数/未対応は非表示(正直) | 🟡 精度 | アクション系列からのレンジ推定(Phase 6) | 🔄 |
| **R25** | (5→**実装済 ✅** 2026-05-28)`src/lib/storage/idbStorage.ts` で Zustand `StateStorage` 互換の IDB アダプタを実装し sessionStore を IDB に移行。**自動マイグレーション**: 旧 `localStorage` データを初回 read で IDB へコピー → localStorage 削除(一回限り)。IDB 非対応環境は localStorage にフォールバック。履歴上限を 50 → **1000** に緩和。テスト 4 件(roundtrip / 未設定キー → null / 旧 LS 移行 / IDB 無効時 fallback)。`fake-indexeddb` を dev-dep に追加。 | 🟡 永続化 | Phase 6(idb 移行・R18 と同枠) | ✅ |
| **R26** | (5)追加プリフロップ 2スポット(sb-vs-btn 3bet-or-fold / btn-vs-co 3bet+coldcall)は **approximate 手作り**(R11 と同じく監修・実解置換対象)。これで 12/必要スポット | 🟡 内容 | 監修 + 実解(R4) | 🔄 |
| **R10** | ポリッシュ: **B1 トータルポット表示✅**(現ベット込み総額 + 確定/ベット内訳)/ **B3 勝者ハイライト✅**(WINNERバッジ+発光・色覚配慮)/ **B4 チップ→ポット移動アニメ ✅** 2026-05-28: `PokerTable` のベットチップを `AnimatePresence` でラップし、`currentBetBB → 0` の遷移で `exit={ left:'50%', top:'42%/40%', scale: 0.4, opacity: 0 }` のアニメ (0.32s) でチップが中央ポットへ吸い込まれる。ポット側は `key={pot-${mainPotBB}}` で `mainPotBB` の変化ごとに `scale: [1.08, 1]` の短い pulse。視線が「誰が払い → ポット」に流れる演出。テスト 2 件追加 (bet 額表示 / showdown 非表示)。**D2 他ページのモバイルQA ✅** 2026-05-29: Learn(ダッシュボード/ドリル)・Analysis(弱点/ポジション統計テーブル)・Theory(戦略理論・フィルタチップ)・Ranges(13×13グリッド/レンジ比較ヒストグラム)・Settings の5ページを 390px 幅で Playwright 実機確認。全ページ **horizontal overflow ゼロ**(`scrollWidth===clientWidth===390`・viewport超過要素0をグリッド/比較タブで実測)、カード縦積み・フィルタチップ折返し・テーブル収まり・ボトムナビ固定すべて良好。タップ域 `min-h-11`(44px) 維持。修正不要=既存レスポンシブが他ページでも公開水準と確認。 | 🟡 | Phase 6 | ✅ B1/B3/B4 + D2 完了 |
| **R27** | (6)**ページ遅延ロード✅**(lazy/Suspense・main 471→334KB・各ページ別chunk)。**PWA✅**(manifest+sw.js runtime cache+登録+meta)。**PWA PNG アイコン✅** 2026-05-28: `scripts/build-icons.ts` で `public/favicon.svg` を sharp ラスタライズし `icon-192.png` (15KB) / `icon-512.png` (78KB) / `apple-touch-icon.png` (13KB) を生成。maskable で OS クロップに対応するため安全域 = 中央 65% に配置 + テーマ色 `#18181b` で背景塗り。`manifest.json` の `icons` 配列を SVG (any) + PNG 192/512 (any maskable) に更新。`index.html` に PNG / Apple Touch リンクを追加。`npm run build:icons` で再生成。 | 🟡 配信 | Phase 6 仕上げ(PNGアイコン) | ✅ |
| **R28** | (6)**D2 モバイルレイアウト**: テーブルを `useIsMobile` でレスポンシブ化(縦長 `aspect-[5/6]` + `SEAT_POS_MOBILE`)。端の見切れ解消 + 中央列(ポット/ボード)と席の重なりも解消 → ヒーローカード `md`・下端へ / ボード `sm` / 相手カード新 `xs` / 側席を外側(14%/86%)へ / ポット内訳はモバイル非表示。390px 実機幅・フロップで確認・desktop 不変。残: 他ページの実機QA | 🟠→✅ 配信 | Phase 6 | ✅ ゲーム表完了 |
| **R29** | (6)WASM/COOP-COEP は**当アプリでは不要**(自前TSソルバーで SharedArrayBuffer 非依存)。PHASE_6 のWASM項目は対象外として整理。Service Worker は現状 solution JSON/WASM の事前キャッシュ対象なし(未生成) | 🟢 整理 | — | ✅ 不要と判断 |
| **R30** | (6)**プレイ画面テーブルの余白が固定**: `PokerTable` が `max-w-4xl`(896px)で頭打ちのため、広い画面/ブラウザ縮小時に左右の黒余白が大きく残り、ズーム・リサイズに連動して**流動的にスケールしない**。要望=ビューポート幅に応じて余白を調整(大画面で広げる・小画面で縮める)。**制約**: 16/9 は幅を広げると高さも増え、短い窓(例 670×620)でアクションパネルが見切れる → **幅と高さの両方**を考慮した流動サイズが必要(例: `width = min(コンテナ幅, (利用可能高さ)×16/9)` を clamp / `aspect` + `max-h-[Nvh]` / コンテナクエリ)。**失敗履歴**: ①`xl:max-w-6xl` 単純拡大=部分対応のみ ②md ブレークポイントで縦長化=短い窓で高さ超過しアクションパネル見切れ → 両方撤回。次回は width+height 同時制約で実装すること | 🟡 配信/UX | Phase 6(レスポンシブ・専用) | ✅ (2026-05-25) **JS レターボックスフィットで解決**: `useContainSize(ratio, maxW)`(ResizeObserver で `width=min(親幅, 親高×ratio, 1100)` を計測)+ GamePage を「卓領域 `flex-1 min-h-0`(先に縮む)＋アクション領域 `shrink-0`(常に表示)」に再構成。CSS だけでは幅100%固定 vs 高さ制約が両立せず歪むため JS 計測。実機確認: 1400×900(卓拡大・余白減)/ 670×620・1100×480(短窓でも卓が縮みアクション/フッター全表示)/ 390×800(モバイル縦長は不変)。136テスト維持 |

## 「公開水準」を満たす最短ルート(推奨順)
1. **Phase 4.6 公開準備ハードニング**(R9 Lint → R5 永続化 → R7 一時停止 → R6 精度UX)。すぐ・低リスク。
2. **Phase 3.5 ソルバー基盤**(R1/R3/R4/R11)。本丸。事前計算 or WASM で postflop と残りプリフロップを供給し、実EVを稼働。
3. **Phase 5**(R2 一部・R8 エクイティ・postflopドリル)。
4. **Phase 6**(R2 残り・R10 ポリッシュ)。

> 暫定公開する場合は「プリフロップ RFI/BBディフェンス特化の学習プロトタイプ」と正直に位置づければ可。
> 「総合 GTO 学習アプリ」を名乗るなら R1–R4 の解消が必須。

---

# B. 商用公開・配信・収益化チェックリスト(完成後)

> Web公開 / スマホアプリ化 / 広告収益化を見据えた、プロダクト品質(A)とは別軸の「事業/法務/運用」要件。
> 着手は完成後だが、設計判断(特に L1 データライセンス)は早期に方針を決めるべき。状態 ⬜/🔄/✅。

## L. 法務・ライセンス(最重要・早期に方針決定)
- [x] **L1 レンジ/ソルバーデータの権利** ⚠最重要 → **方針決定済 (2026-05-25): 「自社ソルバーのみ」**。正典は [docs/DATA_LICENSE.md](DATA_LICENSE.md)。他社ソルバー出力 (GTO Wizard 等) は無料公開でも**同梱禁止**。実装で強制: `SolutionMeta.license` 必須化 (`self-generated`/`original`)、取込器 `import-ranges.ts` が `--source`/`--license` 必須+既知プロプライエタリ出所を拒否、UI/コードの「FreeBetRange参考」表記を「一般理論ベースの手作り」に是正。残: **R4** で自社ソルバーのプリフロップ実解を生成し `solver_precomputed` 化。
- [ ] **L2 OSS ライセンス**: 実行時依存は react/react-dom/zustand/framer-motion (MIT) + idb (ISC) で**すべて寛容ライセンス**。AGPL の postflop-solver は不採用 (依存に無し)。配布時に `THIRD_PARTY_LICENSES` を同梱。
- [ ] **L3 フォント**: 現状 Google Fonts(Bricolage Grotesque / Hanken Grotesk / Zen Kaku Gothic New / JetBrains Mono)は OFL/Apache で商用可。セルフホスト時もライセンス維持。
- [ ] **L4 商標・ブランド**: アプリ名「GTO Lab」の商標衝突調査。「GTO Wizard」「PokerSnowie」等は他社商標 → **名称・宣伝で非提携を明確化**(「〜風」表現も慎重に)。

## S. ストア要件(スマホアプリ化)
- [ ] **S1 開発者アカウント**: Apple Developer($99/年)、Google Play($25 一回)。
- [ ] **S2 ギャンブルポリシー**: 賞金の無い**学習/シミュレーション**は通常可だが、Apple/Google とも「ギャンブル類似」審査が厳しい。実マネー無し・年齢レーティング **17+/Teen以上**・「ギャンブルではない」明記。
- [ ] **S3 プライバシー要件**: プライバシーポリシー URL 必須(ローカル保存のみでも)。Apple **Privacy Nutrition Labels** / Google **Data Safety** 申告。
- [ ] **S4 ストア素材**: アイコン、スクショ、説明文、サポート URL、レビュー対応。

## P. データ・プライバシー
- [ ] **P1 プライバシーポリシー**: 現状データは端末ローカル(localStorage/IndexedDB)のみ → その旨を明記。外部送信を始めるなら GDPR/CCPA 対応。
- [ ] **P2 同意管理**: 解析/広告を入れる場合、EU向け **同意バナー(CMP)** と iOS **App Tracking Transparency(ATT)** 必須。
- [ ] **P3 子ども対応**: 17+ 設定なら COPPA 回避。広告も成人向け設定。

## M. 収益化(広告)
- [ ] **M1 広告SDK**: AdMob 等。**ギャンブル隣接コンテンツは広告主・配信に制限**がかかりやすい点を織り込む。
- [ ] **M2 広告ポリシー順守**: 同意(P2)、子ども向け除外、不適切配置の回避。代替収益(買い切り/サブスク/レンジパック販売)も検討。

## T. 技術・運用(配信)
- [ ] **T1 モバイル化方式**: PWA(手軽)か Capacitor(ストア配信)。Phase 6 で WASM 用 **COOP/COEP** とオフライン対応。
- [ ] **T2 観測**: クラッシュレポート(Sentry 等)・解析(プライバシー配慮)・バージョン更新フロー。
- [x] **T3 git化 + CI** (2026-05-25): `git init`→ 初回コミット → private repo `github.com/one-shine/poker-gto` に push。`.github/workflows/ci.yml` で push/PR 時に **lint → build(tsc -b 型チェック込) → test → npm audit(high以上で失敗)** を Node22 で実行。**初回CI緑・脆弱性0件**。残(公開前): XSS/インジェクション・データ取り扱いの観点レビュー、actions の Node20ランタイム非推奨警告(将来 v5 等へ更新)。
- [ ] **T4 国際化(任意)**: 現状 UI は日本語のみ。英語化で市場拡大。

> 早期に決めるべき設計判断: **L1(データの出所)** と **T1(PWA か Capacitor か)**。
> これらは Phase 3.5(解データ)・Phase 6(配信)の実装方針を左右する。
