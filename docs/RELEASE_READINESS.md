# 公開準備レビュー — 対応トラッカー

> Phase 4 完了時点(2026-05-23)の自己レビューで洗い出した「一般公開に必要な項目」の正典。
> 各項目を対応フェーズに割り当て済み。状態: ⬜ 未着手 / 🔄 進行中 / ✅ 完了。
> 親計画: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

## 総合判定(レビュー時点)
「完成度の高いプロトタイプ」。土台・UI・正直さ(出典明示)は高品質だが、
**「GTO学習アプリ」の看板に対し実際に学べる範囲が狭い**(ポストフロップ無言・プリフロップ10/21・近似のみ)。
下記 R1–R11 を解消して「公開水準」を満たす。

## 対応表

| ID | 指摘 | 重大度 | 対応フェーズ | 状態 |
|----|------|--------|------------|------|
| **R1** | ポストフロップのコーチが完全に不在(`getSolution` postflop=null → フロップ以降フィードバックなし) | 🔴 ブロッカー | Phase 3.5(解供給)+ Phase 5(ポストフロップドリル) | 🔄 flop/turn/river の hero=OOP(lead/被ベット)で稼働(turn/flop はエクイティ近似)。IP/レイズ応酬は未対応 |
| **R2** | プリフロップ網羅 **21/21 スポット完了✅**(2026-05-26)。①defender 4スポット(SB vs CO・BTN vs UTG/MP・CO vs UTG)②**非BB防御のライブ・コーチング配線**(`POS_VS_SPOT` + `getPreflopActionOrder` で clean fold-around 判定)③**facing-3bet 5スポット**(BTN/CO opener × SB/BB/BTN 3better、4bet/call/fold)。`preflopSpotId` を raises.length=2(open+3bet・HU限定)に拡張、スクイーズ/コールド参加は除外。RangeGrid/RangesPage の凡例を 3bet スポットで「4-Bet」表記に。すべて approximate手作り(R11 監修対象)。**プリフロップのみ配線**(postflop は deriveRiverRanges 非対応で正しくスキップ)。マルチウェイは設計ルール4でGTO精度除外=対象外 | ✅ | 完了(実解置換は R4/将来) | ✅ 21/21 |
| **R3** | 「実EV損失」が実質ドーマント(approximate は ev=0、数値は solver_* 時のみ→現状出ない) | 🔴 ブロッカー | Phase 3.5(solver_precomputed=実EV) | 🔄 river は solver_live で実EV稼働。preflop実解(R4)は別途 |
| **R4** | 本物のソルバー解が無い(全レンジ手作り近似、trainer 相手も近似ベース)。**R4-A 実装済 ✅** 2026-05-28: `src/lib/solver/heuristicPreflopEV.ts` でヒューリスティック open-raise 求解(fictitious play + postflop EV = `(equity-0.5) × 30BB`)。BTN open vs BB call の 169×169 fictitious play で per-category EV/頻度を算出。exploitability < 0.005 BB/hand。実出力: opener レンジ ~51%(AA/KK/QQ/AKs 100% raise EV +2〜3BB / 72o-32o 0% raise EV -0.35〜-0.67)、caller ~28%(3bet 無しのため実 GTO ~55% より狭い・既知の限界)。テスト 5 件(AA bullish / 72o folds / 単調性 / 収束 / raiseSize 影響)。次=R4-B(UI で `approximate_with_ev` 種別導入)。 | 🔴 ブロッカー | Phase 3.5(実解取込) | 🔄 **HU プッシュ/フォールドは厳密 GTO を自前生成 + トレーナー UI 稼働** (`scripts/solve-pushfold.ts`→`hu-pf-*.json`, `solver_precomputed`, ショーダウン=オールイン勝率=真値)。学習→ドリル→「プッシュ/フォールド」で stack/立場(SB/BB/ミックス)別に出題・**実EV表示**・厳密解判定。**スタック拡充✅**(2026-05-27): 5/8/12/25BB を追加生成し **5/8/10/12/15/20/25BB の7段階**を網羅(exploitability 0.0003〜0.0017・push頻度は 5BB 131/169→25BB 74/169 と単調に縮小=公開Nashチャート整合)。トレーナーは `PUSHFOLD_STACKS`(JSON自動発見)で自動反映。**バンドル改善**: `getSolution` の precomputed glob を eager→**spotId一致のみ遅延import**化し、push/fold JSON を gameStore チャンクから排除(223KB→41KB・旧来の +80KB 肥大も解消)。残: 100BB オープン/3bet は postflop EV 要(別軸・厳密不可) |
| **R5** | セッション統計が非永続(リロードで精度・ハンド履歴が消える) | 🟠 | **Phase 4.6**(前倒し)/ 恒久は Phase 5 IndexedDB | ✅ |
| **R6** | study モードは GTO精度が常に N=0(常時戦略=全ハンド hinted 除外)。ユーザーが戸惑う | 🟠 | **Phase 4.6**(UX調整:測定用ドリル/トグル) | ✅ |
| **R7** | study の「一時停止」が見かけだけ(エンジンは止まらず裏で進行) | 🟠 | **Phase 4.6**(実エンジン停止) | ✅ |
| **R8** | エクイティ(自分の勝率)未計算。A2 は必要勝率のみで片手落ち → **Phase 5 で解消(下表 R8 詳細参照)** | 🟠 | Phase 5(Monte Carlo worker) | ✅ |
| **R9** | Lint が7件失敗(setState-in-effect×3 / any×2 / 未使用 `_opts` / react-refresh×1) | 🟠 | **Phase 4.6**(即時・低リスク) | ✅ |
| **R10** | 勝者ハンドのハイライト・トータルポット表示・モバイル実機検証 | 🟡 | Phase 6(DESIGN バックログ B1/B3/D2 と同一) | ⬜ |
| **R11** | 近似レンジの監修(追加した UTG/MP/BB-vs-X の頻度妥当性) | 🟡 | Phase 3.5(実解置換で解消)+ 随時監修 | ⬜ |
| **R12** | (Phase 4.6 レビュー)一時停止フラグが appMode 切替(study→play)で残留しうる。`startNewHand` で解除済のため実害は次ハンドで解消 | 🟡 監視 | 緩和済 | 🔄 |
| **R13** | (Phase 3.5 レビュー)ライブ求解中に「データ準備中(評価対象外)」と誤表示 → `useSolution` に loading 状態追加、LiveStrategyPanel で「GTO解を求めています…」(スピナー)/「評価対象外」を区別 | 🟠 UX | 即時修正 | ✅ |
| **R14** | (3.5)turn/flop はエクイティ近似(以降のベッティング無視)でドロー過大評価。①**信頼度の明示**(CoachPanel に「簡易: 賭け未考慮」+「収束 X%」)で誤った権威付けを解消 ✅。②**精度の本丸=完全チャンスCFR**は専用作業として仕様化・スケジュール(docs/PHASE_3_5.md) | 🟠 精度 | ①Phase 3.5 ✅ / ②専用作業 | 🔄 |
| **R15** | (3.5→**実装済 ✅** 2026-05-28)postflop の入力レンジの精度向上。①**コンボ上限を 100→200・top-N から「重みしきい値 0.05 + 上限」へ**: 尾部の意味ある mixed 戦略(0.05〜)を保護しつつ SRP の超巨大レンジ(200-570 combos)を許容範囲に圧縮。実測 (`scripts/measure-ranges.ts`) で 90%+ カバー(従来 18%)。②**River 限定 board 強度 narrowing**: 5枚ボードの rankValue で下位20%を落とし「フロップ/ターンを peel しなかった手」を近似。`rangeNarrowing.ts` に分離(9テスト)。must=hero 必ず保持・board overlap は drop 優先。turn/flop はドロー価値必要のため R14②(完全チャンスCFR)領域として未着手。性能影響: river/turn 求解 720ms→2.8s (4×, vitest timeout を 15s に拡張)。 | 🟠 精度 | Phase 3.5 精密化 + R4(実preflop解) | ✅ R15-A/B 完了 |
| **R16** | (3.5)postflop コーチのカバレッジ拡大 → **hero=IP対応 + レイズ応酬対応✅**(2026-05-26)。`deriveRiverRanges` は bb-vs-X(OOP)+ X-open(IP)両対応。`getSolution` が `raiseSizes:[0.5]` を渡し、被ベットノードに **raise(OOP=チェックレイズ / IP=レイズ)** が加わる(`riverSolver` の `facingBet`/`raisesLeft` は元々対応・未使用だった)。被ベット時 hero は fold/call/raise で評価。ポストフロップドリルでも3択化。実機確認(BTN-open IP 被ベット=fold11%/call87%+raise)。**3bet pot postflop ✅**(2026-05-27): `deriveRiverRanges` を `potSpec()` 経由に一般化し `3bp-{hero}-vs-{villain}`(5ポット×両視点=10スポット)を追加。3betレンジ=`{3better}-vs-{opener}` raise / 対3betコールレンジ=`{opener}-vs-{3better}-3bet` call。ポストフロップドリルに「ポット種別(シングルレイズド/3betポット)」トグル+`heroRangeSpec()`。ポット≈22.5BB・残り≈89BB。実機確認(SB 3betポット vs BTN・K9s 2pair on AK9→レイズ99% +11.22BB)。**被レイズ深いノード ✅**(2026-05-27): hero が自ベット/チェックレイズをレイズし返された節([1,2]=OOP被レイズ / [0,1,2]=IP被チェックレイズ)を `SpotKey.facingRaise` + `getSolution` targetPath で対応(`riverSolver` は raiseSizes 指定時に元々生成済・到達していなかっただけ)。ポストフロップドリルに3択目「被レイズ」(fold/call のみ・hero ベット額→相手レイズ to 額を明示)を追加。実機確認(リバー被レイズ・ワンペア→フォールド94% -6.38BB)。**ライブコーチング配線 ✅**(2026-05-27): `resolveSpotKey` のポストフロップを `postflopBase()` で再構成するよう刷新。**IPオープナー postflop の長年のバグを修正**(defender のコールを limp 誤判定して null を返していた→ btn-open 等が実ゲームで稼働)。3bet ポット(open→3bet→call → `3bp-{hero}-vs-{villain}`)・被レイズ(hero ベット→villain レイズ)も実ゲームで検出。`baseHeroIsOOP()` クロスチェックで SB盲対盲の IP/OOP 反転を除外。postflop resolveSpotKey テスト +8(従来ゼロ)。実機: 配線後も study/コーチ 0 console err。残: マルチウェイ・SBコンプリート・再レイズ応酬(raisesLeft≥2) | 🟢 カバレッジ | ✅ IP+チェックレイズ+3betポット+被レイズ+ライブ配線対応 |
| **R17** | (3.5)exploitability 未計測 → best-response 計算で算出。`NodeSolution`/`CoachFeedback` に載せ、CoachPanel に「収束 X% pot」表示。収束テスト(反復↑で↓・<5%)。※CFR収束の指標でありエクイティ抽象化誤差(R14)は別 | 🟡 | Phase 3.5 | ✅ |
| **R18** | (3.5)IndexedDB 求解キャッシュに**上限/エビクション無し**。多様な postflop スポットで肥大化しうる | 🟡 | Phase 6(LRU/サイズ上限) | ⬜ |
| **R19** | (4.5レビュー)理論コンテンツ(17コンセプト + 48用語)は手書き。数値(オープン頻度 UTG15/BTN45、バリュー:ブラフ 2:1 等)は概算で、レンジ同様**監修が必要**。誤字「sui ted」を1件修正済 | 🟡 内容 | 随時監修(R11 と同枠) | 🔄 typo修正済・数値監修は継続 |
| **R20** | (4.5)`PositionStatsTable` の**推定精度**は近似: 母数=ヒーローHU判断数(コーチ未評価スポットも含む)、分子=判断数−`sessionStore.mistakes`。ヒント除外・未評価スポットを厳密に扱わず楽観寄り。「推定」表記+注記で緩和 | 🟡 精度UX | 厳密化は per-position 評価集計を持てば可(Phase 5/6) | 🔄 緩和済 |
| **R21** | (4.5→**実装済✅** 2026-05-28)レンジvsレンジに**ボード上のエクイティ分布**を追加。`lib/equity/rangeVsRange.ts`(コンボごとに相手レンジ全体へのエクイティを算出→10分位ヒストグラム・平均エクイティ=レンジ優位・ナッツ級/弱い手比率=ナッツ優位)。river=厳密・flop/turn=seeded MC(400ランナウト)。`equity.worker.ts`/`equityClient.ts` を rangeInput 系統に拡張(Worker共有)。RangesPage「レンジ比較」タブに `RangeEquityDistribution`(ボードプリセット6種+ランダムフロップ・advantageバー・2ヒストグラム)。色覚配慮(横軸=エクイティで読める・凡例マーカー)。入力レンジは手作り近似のため**参考値**と明示。検証6件(AA圧勝/avg和≒1/セットのナッツ優位/正規化/seed再現/空レンジ)。189テスト | 🟢 機能 | ✅ | ✅ |
| **R22** | (4.5)新規純関数の一部(`RangeVsRange` の combo集計・`PositionStatsTable` の aggregate)は未テスト。コンセプト被覆は専用テストで保証済(全 MistakeCategory→≥1 concept・115テスト) | 🟢 | 随時(集計をpure module化してテスト) | 🔄 被覆テスト済 |
| **R8** | エクイティ Monte Carlo worker(`monteCarlo.ts`+`equity.worker.ts`+`equityClient.ts`)実装。相手レンジ指定でシミュレートし、study(intermediate+)で「あなたの勝率」を必要勝率と並べて表示・オッズ充足判定。検証テスト4件(AAvsKK/タイ/ナッツ/空レンジ) | 🟠→✅ | Phase 5 | ✅ |
| **R23** | (5レビュー)ポストフロップドリル**実装済✅**(2026-05-26): `postflopDrill.ts`+`PostflopDrillPanel.tsx`。HU SRP(bb-vs-{btn,co}/{btn,co}-open)でランダムボード+レンジ内hero手を出題→自前CFRを**都度求解(async)**→返却アクションから選択肢を動的生成(lead=check/bet / 被ベット=call/fold)。**実EV併記**・source=`solver_live`(△ ローカル求解と正直表記)。XP 8/3。ストリート切替(flop/turn/river/mix)。ドリルタブに統合。146テスト | 🟢 機能 | ✅ | ✅ |
| **R24** | (5)エクイティの相手レンジは近似: 非BBの相手は一律「オープンレンジ」、BBは「bb-vs-hero ディフェンスレンジ」。実際のアクション系列(3bet/コール経路)は未反映。HU 限定・多人数/未対応は非表示(正直) | 🟡 精度 | アクション系列からのレンジ推定(Phase 6) | 🔄 |
| **R25** | (5→**実装済 ✅** 2026-05-28)`src/lib/storage/idbStorage.ts` で Zustand `StateStorage` 互換の IDB アダプタを実装し sessionStore を IDB に移行。**自動マイグレーション**: 旧 `localStorage` データを初回 read で IDB へコピー → localStorage 削除(一回限り)。IDB 非対応環境は localStorage にフォールバック。履歴上限を 50 → **1000** に緩和。テスト 4 件(roundtrip / 未設定キー → null / 旧 LS 移行 / IDB 無効時 fallback)。`fake-indexeddb` を dev-dep に追加。 | 🟡 永続化 | Phase 6(idb 移行・R18 と同枠) | ✅ |
| **R26** | (5)追加プリフロップ 2スポット(sb-vs-btn 3bet-or-fold / btn-vs-co 3bet+coldcall)は **approximate 手作り**(R11 と同じく監修・実解置換対象)。これで 12/必要スポット | 🟡 内容 | 監修 + 実解(R4) | 🔄 |
| **R10** | ポリッシュ: **B1 トータルポット表示✅**(現ベット込み総額 + 確定/ベット内訳)/ **B3 勝者ハイライト✅**(WINNERバッジ+発光・色覚配慮)。残: B4 チップ→ポット移動アニメ・D2 モバイル | 🟡 | Phase 6 | 🔄 B1/B3 済 |
| **R27** | (6)**ページ遅延ロード✅**(lazy/Suspense・main 471→334KB・各ページ別chunk)。**PWA✅**(manifest+sw.js runtime cache+登録+meta)。ただしアイコンは favicon.svg のみ(PNG 192/512 maskable 未整備でストア/スプラッシュ品質は限定的) | 🟡 配信 | Phase 6 仕上げ(PNGアイコン) | 🔄 |
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
