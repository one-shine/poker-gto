# 残タスク・課題 — 一元トラッカー

> **このファイルの役割**: これから着手しうる残タスク・課題の**唯一の集約**。進捗の正典。
> Phase 1〜6 の主要スコープは完了済み(完了の経緯は [`./archive/`](./archive/))。ここには**残っているものだけ**を書く。
> 凡例: 状態 ⬜ 未着手 / 🔄 進行中 / 🧊 凍結(環境制約・別軸) ／ 担当 = 👤 ユーザー判断 / 🤖 実装作業。
> 関連: 製品仕様 [`./SPEC.md`](./SPEC.md) / 公開準備プレイブック [`./RELEASE.md`](./RELEASE.md)。

---

## 0. バグ・気になる点(プレイ検証で発見)

> 実際に触って見つかった不具合・UX の引っかかりをここに集約しトリアージする。新しく気づいたら追記。
> フォーマット: **現象 / 重大度(🔴致命 🟠中 🟡軽)/ 状態(⬜未対応 🔄対応中 ✅修正済)/ メモ(再現・原因・対応)**。
> 修正したら ✅ にして1行残す(履歴)。設計レベルの大物は A〜D の該当セクションへ移す。

| # | 現象 | 重大度 | 状態 | メモ(再現・原因/対応) |
|---|------|--------|------|----------------------|
| U1 | コーチのアドバイスがすぐ消えて読みきれない | 🟠 | ✅ | 2026-05-31: `CoachToast` 5.5→8s + ホバー中は自動消滅停止 / `CoachPanel` もホバー停止(ミスは元々「次へ」まで残る)。 |
| U2 | GTO アドバイスが「対象外」になる局面の理由が不明 | 🟡 | ✅ | 2026-05-31: 対象外メッセージに理由(マルチウェイ=3人以上 / 未収録 / 盲対盲 / 深いレイズ応酬)を明示。スキップ自体は誤評価回避のため意図的。 |
| U3 | ハンドの途中で終われない / 次へ進めない | 🟠 | ✅ | 2026-05-31: 進行中に「↻ 新しいハンド(このハンドを中断)」ボタンを常時表示(`GamePage`)。 |
| U4 | 学習ドリルの履歴が残らない | 🟠 | ✅ | 2026-06-06: 新規 `drillStore`(persist `poker-gto-drill`・IndexedDB)で試行/正誤を種別(preflop/postflop/pushfold)・bucket 別に永続化。ダッシュボードに「ドリル成績(通算)」カード、ドリルタブに種別通算+直近5件(✓/✗ 形状併用)。EV損失は postflop/pushfold のみ算出(preflop は近似=null)。XP 付与は据え置き。 |
| U5 | ハンド履歴が並ぶだけで使い道がない | 🟠 | ✅ | 2026-06-06: 各ハンドに**勝敗/純損益(BB)バッジ**(▲/▼/＝ 形状+色)と**ミス印**(⚠+件数)を表示。HandReplay で**ミス→該当理論(conceptsForMistake)/ドリル(drillCategory)へ導線**。新規 `HandSummary` 型 + `sessionStore.handSummaries`、gameStore で純損益算出。旧履歴(summary 無)は後方互換で degrade。残案: 「コーチ付き再求解」は未実装(必要なら追補)。 |
| U6 | レンジ表をもっと一目で分かる色分けに | 🟡 | ✅ | 2026-06-06: `RangeGrid` に**頻度ヒートマップ**(「レイズ頻度/コール頻度」トグル・暗→色の濃淡1色)を追加。色だけに依らずセル角に頻度%併記+グラデ凡例(0/100%)。EV は approximate で出さない規約に従い**頻度のみ**可視化(EVヒートマップは RangeCell に EV が無く規約上も不可)。残案: ポジション横断の比較ビューは未実装。 |
| U7 | ゲームのアクション履歴がスマホで場所を取り見にくい | 🟡 | ✅ | 2026-06-06: アクション履歴(`BetLine`)をモバイル(<sm)で非表示(`GamePage` を `hidden sm:block`)。卓の各シートが直近アクションを出すため情報は冗長。デスクトップ(sm+)は維持。残(完全除去/トグル)は不要と判断(卓のシート表示で足りる・モバイル非表示で解消済)。 |
| U8 | GTO戦略が事前表示で「答え」を先に見てしまう | 🟠 | ✅ | 2026-06-06: study の戦略表示を「アクション**前**の常時表示」→「アクション**後**の答え合わせ」に変更(`LiveStrategyPanel` に `revealActed`、`gameStore.lastHeroDecision` で打った決定を保持)。事前に見せないので `markHinted` せず**精度サンプルにも入る**(測定が正直に)。設定「答え合わせ表示」OFF で非表示=純粋テスト。✅ **追補(2026-06-06)**: 自分の手でハンドが終わる局面(HU リバーのコール等)でも、最後の決定の答え合わせを New Hand の上に表示。 |
| U9 | 他プレイヤーのアクションの移り変わりが速すぎる | 🟡 | ✅ | 2026-06-06: 相手の「間」を読める速さに(fish 550–1100ms / gto 650–1300ms・従来比約2倍)。設定「相手アクションの速さ」(slow/normal/fast・既定normal)を追加し倍率調整可。遅延算出は UI 層(`gameStore`)で `aiSpeed` を emit 時に読む=再初期化なしで即反映・engine は設定非依存を維持。 |
| U10 | スマホで自分のカードとアクションボタンが重なる / 全体が見えずスクロールが要る | 🟠 | ✅ | 2026-06-06: 原因はモバイル卓だけ高さ制約が無かったこと(デスクトップは `useContainSize`、モバイルは CSS `aspect-[5/6]` の幅基準で縦に溢れ、`top:90%` のヒーロー席が卓下にはみ出してボタンに重なっていた)。対応: モバイルも `useContainSize(5/6)` で**利用可能高さにフィット**(`GamePage` の測定高さ `tableH` をモバイル卓にも付与)→ 卓+アクション+フッターが1画面に収まる。ヒーロー席 top 90→86・ヒーローカード md→sm(compact)・上席 top 8→13・左右席を分離。Playwright で 360×640〜430×739/390×844 を実測し no-scroll・札↔ボタン gap 5–21px・上端見切れ解消を確認。デスクトップ回帰なし。**残(360幅の側席近接)は 6-max を最小幅に収める制約上の許容範囲(軽微・札↔ボタンは全幅で解消済)**。 |
| U11 | 学習履歴が端末内のみで、別端末への引き継ぎ・バックアップができない | 🟡 | ✅ | 2026-06-06: 設定に**JSON エクスポート/インポート**を実装(`src/lib/storage/dataTransfer.ts`・3つの persist 先を束ねて移送・完全ローカル/外部送信ゼロ・version 検証/部分インポート)。読み込み後はリロードで反映。以下は当初メモ。**優先度低**。仕様(バグではない): 履歴・進捗は端末内のみ(`sessionStore`=IndexedDB `poker-gto`/キー `poker-gto-session`、`progressStore`/`settingsStore`=localStorage)。第三者送信ゼロの設計ゆえ、端末/ブラウザを変えると引き継げず、サイトデータ削除や PWA アンインストールで消える。→ 案①(推奨): **JSON エクスポート/インポート**(設定ページに「データ書き出し/読み込み」。完全ローカルで実装でき「第三者送信ゼロ」を維持・手動バックアップ/機種変に対応)。案②クラウド同期はアカウント+バックエンドが要りプライバシー前提が崩れるため、やるなら明示同意の別設計。まず①で十分。 |
| U12 | レンジ表のシナリオ選択がピルボタンの羅列で壁になっている(パターン過多) | 🟡 | ✅ | 2026-06-06: **種別(オープン/vsオープン/対3Bet)×シナリオの2段選択**にコンパクト化。RangeVsRange の select も種別 optgroup に整理。分類は `preflop.ts` の `scenarioKind/scenariosOfKind`(id規則ベース)。以下は当初メモ。現状 `RangesPage` の `SingleRange` が `PREFLOP_SCENARIOS`(**現27件・今後 R4 等で増える**)を全部ピルボタンで横並び展開 → スポット増で壁状になり選びにくい。→ **リスト/ドロップダウン選択でコンパクト化**。案: ①セレクト(コンボボックス)1つで選ぶのが最小実装、②`type`(オープン / vsオープン=ディフェンス・3bet)×`position` の2段選択で絞る(ラベル "BTN Open"/"BB vs BTN" は type×position に分解可能)、③検索/フィルタ付きリスト。`RangeGrid` 本体・データ構造は不変、選択UIのみ差し替え。`RangeVsRange` タブの選択UIも同様の課題があれば併せて。 |
| U13 | スマホで下端まで scroll が届かない/ゲームで操作までスクロールが要る(卓に余白があるのに) | 🟠 | ✅ | 2026-06-06: 原因は AppShell ルートの `h-screen`(=100vh)。**iOS Safari の 100vh は URL バー込みの大きい高さ**で、下端のボトムナビ・操作ボタンが可視領域外に出て「引っ張ると見える」状態。→ `h-dvh`(動的ビューポート=実可視領域)へ。`#root` も `min-height:100dvh`(100vh フォールバック付)、ErrorBoundary は `min-h-dvh`。内部の `overflow-auto` 構造は不変。レンジ等の全ページ + ゲームの両方を一括解消。 |
| U14 | UTG/MP Open で A8s/A7s/A6s を飛ばして A5s/A4s が入っているのが変 | 🟡 | ✅ | 2026-06-06: 手作り近似レンジの非単調アーティファクト。utgOpen に A8s:0.5/A7s:0.4/A6s:0.4、mpOpen に A7s:0.5/A6s:0.5 を補完し中抜けを解消(ウィール A5s は近傍以上を維持)。ドリフトガード(`preflop.test`)の widthPct を更新(utg 0.134 / mp 0.176)。本格精密化は R4(実ソルバー解で一括置換)方針は不変=本件はアーティファクト是正のみ。 |
| U16 | GTO解を待つ間にゲームが進み答え合わせが消える / 対象外のとき正誤の判断材料が無い | 🟠 | ✅ | 2026-06-06: ①**study + 答え合わせON では自分が打った後に一時停止**(`gameStore` の gate を `submitHeroAction` で起動・`isPaused` を store にミラー)。解の求解(非同期)中もゲームを保留し、答え合わせを確実に読める。`GamePage` に「次へ →」ボタン(`dismissFeedback` で再開)。ミス時は CoachPanel の「次へ」が担う。②**対象外のときオッズ基準のガイド**(`LiveStrategyPanel`):コールに直面していれば 必要勝率 vs 実勝率 で「コール有利/フォールド寄り」を提示(**GTO頻度ではない・含意オッズ/レイズ選択肢は未考慮**と明示)。`useEquity` を call 直面時にも有効化。Playwright で ポーズ→次へ→再開(ポット進行)を実測。テスト+1(study ポーズ)。 |
| U15 | ゲームで「GTO解の対象外」と出る局面でも、レンジは存在するので解を出せるのでは | 🟡 | ✅ | 2026-06-06: **設計ルール4どおりにマルチウェイで「参考値」を表示**するよう実装(従来は対象外メッセージのみ=ルール4より保守的だった)。`resolveSpotKey(state, hero, { multiwayReference })` を追加し、**表示経路(`useSolution`→`LiveStrategyPanel`)のみ** cold-call ありの defense でも収録 HU レンジを `multiway:true` で解決→`getSolution` が `multiwayReference` を付与→パネルに「**マルチウェイ=参考値**」バッジ + 注記、EV は非表示。**精度計算・AI 経路(`CoachAgent`/`GTOPlayerAgent`)はオプション無しで従来どおり null=除外**を維持(ルール4の精度除外は不変)。RFI の背後ブラインドは multiway 扱いしない。残る対象外は ②未収録ディフェンス(MP vs UTG 等・レンジ自体が無い→R4で拡充)③盲対盲・4bet応酬・3betマルチウェイ(squeeze)。偽の厳密解は出さない(ルール1)。テスト+3(resolveSpotKey/getSolution/LiveStrategyPanel)。 |
| U17 | フォールド後に相手同士のプレイを見続ける必要がない | 🟡 | ✅ | 2026-06-06: フォールド後は残りの AI 送出を**遅延0で即決着**(`gameStore` にモジュールフラグ `heroFoldedThisHand`、`submitHeroAction(fold)` で立て `HAND_START`/`resetGame` でリセット、`delayScheduler` が遅延0に分岐)。結果(勝者)を表示して**手動で New Hand**(自動では進めない)。study+答え合わせ時は U16 のポーズで自分のフォールド判断の答え合わせを先に見せ、「次へ」で再開→瞬時決着。テスト+1。 |
| U19 | オッズに関する学習(練習)が無い | 🟡 | ✅ | 2026-06-06: **オッズドリル**をドリルタブに追加(新規 `lib/drill/oddsDrill.ts` 純計算・`OddsDrillPanel`)。3種=①必要勝率の暗算(B/(P+2B)・half25/⅔29/pot33)②コール/フォールド判断(勝率 vs 必要勝率)③アウツ→勝率(×2/×4)。種別 seg(ミックス+3種)・正誤+計算解説・`TermChips`+`ConceptLink('pot-odds')`で理論へ導線。成績は `drillStore`(`DrillKind` に `'odds'` 追加)→ダッシュボード/通算に記録(U4)。ゲームの答え合わせの `OddsGuide`(U18)にも pot-odds 理論リンク+用語チップを追加。ルール1: 「オッズ算術の練習・GTO頻度とは別」と明示。テスト+7。Playwright で ドリル→正解→解説→関連理論(pot-odds)遷移・成績記録を実測。 |
| U18 | GTO戦略だけでなくオッズ基準の望ましいプレイも常に出したい | 🟡 | ✅ | 2026-06-06: `LiveStrategyPanel` に共通 `OddsGuide` を導入し**常時併記**(GTO バーの下=副表示、対象外では主表示)。コール直面=`ポットオッズ/必要勝率/勝率→✓コール有利/✗フォールド寄り`、チェック/ベット先頭=`勝率→強い/中庸/弱い`(大まかなエクイティ目安)。**ルール1**: 「GTO頻度ではありません」と明示し、注意書きは**1行に簡潔化**(ユーザー要望)。`useEquity` 常時有効化、`showPotOdds` prop 廃止。**ミス時は CoachPanel が GTO答え+EVを出すため reveal(OddsGuide)は出さない**(残: ミス時にもオッズ併記したい場合は CoachPanel 側に追加)。テスト更新+2。 |

---

## A. GTO 精度(本丸の残・主に環境制約)

| ID | 課題 | 状態 | 担当 | なぜ残るか / 方針 |
|----|------|------|------|------------------|
| **R4** | 100BB の open/3bet を真 Nash 解(`solver_precomputed`)へ | 🧊 | 🤖 別軸 | 現状はプリフロップ全27スポットを `approximate_with_ev`(概算EV)で公開水準に到達。真 Nash は **postflop EV モデルを伴う厳密解=サーバ事前計算級で in-browser 不可**。push/fold(≤25BB)のみ厳密解済み。手作りレンジの再調整はせず、実データ生成で一括置換する方針(L1=自社ソルバー生成)。出典: `archive/RELEASE_READINESS.md` R4 / `archive/PHASE_3_5.md`。 |
| **flop 完全チャンス CFR** | flop を river ベッティングまで含む厳密 CFR で求解 | 🧊 | 🤖 別軸 | エンジン(`flopSolver.ts` / `chanceCfr.ts`)は実装済みだが、実レンジでの exploitability が **~13% で頭打ち**(反復ではなくアブストラクションの構造的下限)。13% を「GTOソルバー解」と称するのはルール1違反 → flop は引き続きエクイティ近似(「簡易: 賭け未考慮」)で正直表示。前提: サーバ/オフライン事前計算 or カードアブストラクション(スート同型+コンボバケッティング)。turn は完全チャンス CFR 済み(exploit 4〜5%)。出典: `archive/PHASE_3_5.md`「flop 完全チャンス CFR」。 |
| **R16 残ノード** | 再々レイズ(raisesLeft≥2)/ SB コンプリート(リンプドポット)の postflop コーチ | 🧊 | 🤖 defer | ①ツリーが構造的に「レイズ深さ1」で頭打ち(改修3層 + 実戦頻度低=費用対効果低)。②SBコンプリート/BB-vs-complete レンジが未整備で**新規手作り近似が必要**=入力レンジ品質が精度の鎖の根 → **R4(実データ)後**に回すのが効率的。マルチウェイは設計ルール4で意図的に除外。出典: `archive/RELEASE_READINESS.md` R16。 |
| **事前計算 postflop ライブラリ** | 代表ボードの解を JSON 同梱し live solve 依存を減らす | ✅ | 🤖 | **2026-06-06 実装(代表ボードドリル)**: 教科書的な代表テクスチャ(ターン4枚×4 / リバー5枚×4)× SRP4スポット × phase(lead/facing)を自前 CFR で**オフライン事前計算**し、hero レンジ全コンボの戦略テーブルを `src/data/solutions/postflop/*.json`(`source: solver_precomputed`・license `self-generated`)に同梱。`scripts/precompute-postflop.ts` 生成(turn=完全チャンスCFR・iters160/cap64で **exploit 1〜2%台**=ライブturnの8%超を大幅改善 / river=厳密 <1%)。`getSolution` がポストフロップで盤面完全一致時に live solve 前へ最優先で配給(**any mode で動く=モバイル/オフライン可**・pot/stack/betFrac不一致はライブにフォールバック)。ポストフロップドリルに「代表ボード」トグルを追加し、盤面=代表集合・hero=事前計算と同一コンボ集合から抽選(**ヒット率100%**)で即時・厳密採点。<br>**設計判断**: ゲームもドリルもランダム盤面なので完全一致事前計算はランダム盤面にヒットしない(カバーにはテクスチャ近似=ルール1抵触)→ 正直に価値が出る「こちらが盤面を選ぶ」代表ボードに限定。flop は ~13% 下限のため対象外(従来通りライブ/近似)。被レイズ(facingRaise)も v1 対象外。残(任意): 3betポット代表盤面・flop カードアブストラクション。出典: `archive/PHASE_3_5.md` / `archive/PHASE_6.md`。 |

> 監修(随時): 近似レンジ・理論数値は現代 GTO 一般理論と突合済み(R11/R19)。**ソルバー水準の精密化は R4 の領域**で、手作りの再調整はしない方針。既知の近似乖離(bb-vs-btn 3bet が理論より薄い等)も R4 で実解化。

---

## B. 機能の残(Phase 6 系・UI ポリッシュ)

✅ **全項目実装済み**(2026-05-31・dynamic workflow で 4 並列実装 + 統合検証・**338テスト緑・型0・lint0・build緑**):

- **B2** アクション履歴 / ベットライン — `src/components/game/BetLine.tsx`(+test)。ストリート別(プリフロップ/フロップ/ターン/リバー/ショーダウン)にアクション列を色覚配慮アイコン+BB額で表示。GamePage の卓下に常時表示(空履歴は null=非表示)。
- **B5** 手番タイマー — `PlayerSeat.tsx`。手番リングに**控えめな brass スイープ弧**(装飾のみ・非懲罰的=自動フォールド/カウントダウン圧なし・study トレーナー方針)。`prefers-reduced-motion` 尊重。
- **B6** ホール/相手カードの配布アニメ — `PlayerSeat.tsx` + `PokerTable.tsx`(`dealKey={handId}`)。ボード配布と一貫した opacity+y+rotateY の stagger、毎ハンド再生。CardDisplay の role/aria は不変。
- **D1** ベットサイズ presets 総額併記 — `ActionPanel.tsx`。ポストフロップ%プリセットに絶対 BB を2行表示(aria-label 契約は維持)。
- **D3** サウンド / ハプティクス — `src/lib/sound/sound.ts`(Web Audio 合成・外部アセット無し)+ `src/hooks/useSoundEffects.ts`(store 購読で deal/action/win を発火)。**既定 OFF**・SettingsPage にトグル。

> B1/B3/B4/D2/R27/R30 も実装済み(詳細は `archive/RELEASE_READINESS.md` / `archive/PHASE_6.md`)。
> ⇒ **Phase 6 系の UI ポリッシュは完了**。残るは A(GTO精度・主に環境制約)と C(公開準備・主にユーザー判断)。

---

## C. 公開準備(商用B・主にユーザー判断/実務)

> 製品品質(A)は学習アプリとして公開水準に到達済み。以下は配信・ストア・法務の実務。
> 手順・文言・調査根拠の詳細は [`./RELEASE.md`](./RELEASE.md)。最短ルート = PWA 無償公開。

| 項目 | 状態 | 担当 | メモ |
|------|------|------|------|
| L4 アプリ名「GTO Lab」の商標調査 | 🔄 | 👤 | 各国商標 DB 検索は外部作業(本ツール不可)。"GTO Wizard"/"PokerSnowie" は他社商標=非提携を明示済み。 |
| Web フォントのセルフホスト | ✅ | 🤖 | 完了(D 節)。`@fontsource` 化で Google Fonts CDN 排除 → 真のオフライン + 第三者送信ゼロ(Playwright 実測: 外部リクエスト0)。 |
| `manifest.screenshots` 追加 | ✅ | 🤖 | 完了(D 節)。mobile 390×844 / desktop 1280×800 を登録。 |
| 静的ホスティング(HTTPS)へデプロイ | ✅ | 🤖 | **GitHub Pages 稼働中(2026-06-06)** <https://one-shine.github.io/poker-gto/>。下記「Web アプリ化 = GitHub Pages 公開」参照。 |
| PRIVACY_POLICY の確定 + 公開 URL 化 | 🔄 | 👤 | 事業者名・連絡先・施行日を確定([`./PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) はドラフト)。 |
| 本番 Sentry DSN 配線 | ⬜ | 👤 任意 | エラー境界+クラッシュレポート基盤は実装済み(既定 OFF・`VITE_SENTRY_DSN` 設定時のみ)。 |
| Capacitor で店舗配信 | ⬜ | 👤 任意・後日 | 同じ `dist/` を WebView でラップ(~3-5日)。Apple Developer($99/年)+ Google Play($25)。年齢区分申告(Apple 17+ / Google Teen)+ ストア素材。手順は [`./RELEASE.md`](./RELEASE.md) §1/§2/§5。 |
| 国際化(英語化) | ⬜ | 👤 任意 | 現状 UI は日本語のみ。市場拡大用。 |

> 収益化(広告)を入れる場合は同意管理(CMP/ATT)・子ども向け除外・ギャンブル隣接の配信制限が発生する。当面は無償・広告なしが店舗摩擦最小([`./RELEASE.md`](./RELEASE.md) D3 推奨)。

### Web アプリ化 = GitHub Pages 公開 ✅ 稼働中(2026-06-06)

> **公開URL(稼働中・HTTP 200 検証済)**: <https://one-shine.github.io/poker-gto/> — noindex で検索除外・PWA インストール可(Mac/Win=Chrome/Edge「インストール」, iPhone=Safari「ホーム画面に追加」)。
>
> **決定の経緯**: 「自分だけ非公開」は GitHub Pages(Free)では不可と確認(`422 your current plan does not support GitHub Pages for this repository` = private repo 非対応 → public 化必須)。代替の Cloudflare Pages(private 維持可)も提示したうえで、ユーザー判断で **GitHub Pages 公開 + 検索除外(noindex)** を採用。Mac/Win ネイティブ(Tauri)は不要化し **PWA 一本化**(`src-tauri/` はコードのみ温存・ビルド対象から外す)。
>
> - **公開URL**: `https://one-shine.github.io/poker-gto/`(プロジェクトサイト = サブパス配信)。ルーター不使用なので SPA フォールバック不要・バックエンド無し・`SharedArrayBuffer` 不使用で COOP/COEP 不要。
> - **検索除外**: robots.txt は**ホスト単位**でしか効かず、配置できるのは `…/poker-gto/` 配下のみ=無効 → `index.html` に `<meta name="robots" content="noindex,nofollow">`。**URL を知る人はアクセス可・検索には出ない**(完全な非公開ではない)。
> - **代償**: **ソースコードが public 化**(誰でも閲覧/clone 可)。データライセンスは L1=`self-generated`/`original` のみ・第三者ソルバー出力非同梱のため公開可([`./DATA_LICENSE.md`](./DATA_LICENSE.md))。
>
> **実装タスク(🤖)** — 全完了(commit `556bbf8`):
> - [x] `vite.config.ts` `base='/poker-gto/'`(サブパス配信。custom domain にするなら `/` に戻すだけ)
> - [x] サブパス耐性: `index.html` 公開資産を `%BASE_URL%` 化 / `manifest.json` 相対URL化(start_url/scope/icons/screenshots)/ `sw.js` SHELL を相対パス化 / `inject-sw-precache.mjs` を `./assets/` / `main.tsx` SW 登録を `import.meta.env.BASE_URL` 基準
> - [x] `index.html` に noindex メタ追加
> - [x] `.github/workflows/deploy-pages.yml`(main push → build → Pages 自動デプロイ・upload-pages-artifact@v3/deploy-pages@v4)
> - [x] repo public 化 + Pages 有効化(Source: GitHub Actions・`build_type=workflow`)
> - [x] 検証: 並列ワークフローで build+dist パス確認・338テスト緑・lint0、初回デプロイ成功・本番URL HTTP 200 + 資産/manifest/sw すべて 200 を実測。
>
> **残ノート**: deploy-pages.yml も既存 ci.yml と同様 actions が Node20(@v4)で deprecation 警告(2026-06-16 以降 Node24 強制)。E節「CI ハードニング(@v4→@v5)」で deploy-pages.yml も対象に含める。
>
> **将来オプション**: (a) ~~再デプロイ時の SW stale 対策~~ **✅ 実装済(2026-06-06)**: `main.tsx` の SW 登録に `updateViaCache:'none'`(sw.js を常にネット取得)+ `controllerchange` で新 SW 制御時に一度だけ自動リロード(初回インストールは除外)+ 復帰/可視化時の `reg.update()`。これで新版デプロイが**手動リロード無しで端末に反映**される(※この更新ロジック自体を含む版を一度取り込むまでは、旧 SW の都合で手動ハードリロード/再インストールが1回だけ必要)。/ (b) URL ルーティング(現状 `App.tsx` の `page` 状態で戻る/共有リンク不可・必要なら hash 同期の小改修)/ (c) クラウド同期(認証+バックエンド DB=新規プロジェクト規模)。

---

## D. 配布(Mac ローカル / iPhone / Windows)

> **✅ 現行配信は C節のとおり PWA一本化で GitHub Pages 公開済(2026-06-06)** <https://one-shine.github.io/poker-gto/>。本節の Tauri デスクトップ/Capacitor は**歴史的経緯・将来オプション**として保持(現行の配布対象ではない)。Mac/Win ネイティブは見送り(`src-tauri/` はコードのみ温存)。
>
> 現状はクライアント完結の Vite SPA(PWA 足場・manifest・sw.js・アイコン・自前ソルバー・オフライン可)。
> `dist/` を共通成果物として「包み方」を変えるだけ。
> **方針(2026-05-31 決定)**: **iPhone は PWA で行く**(Safari「ホーム画面に追加」)。ネイティブ iOS(Capacitor / Tauri iOS = App Store)は当面**見送り**。公開は iPhone 個人確認後。
> iPhone PWA に必要なのは **HTTPS 配信**のみ: 個人確認 = `cloudflared` 等の HTTPS トンネル経由で Safari → ホーム画面に追加 / 恒久 = 静的ホスティング(E② / C節)。共通土台(フォント/オフライン/screenshots)は完了済み。

### 共通土台(PWA を実質完成)— ✅ 完了(2026-05-31・dynamic workflow + Playwright 検証)
- **Web フォントのセルフホスト** ✅ — `@fontsource-variable/{hanken-grotesk,bricolage-grotesque,jetbrains-mono}` + `@fontsource/zen-kaku-gothic-new`(japanese/latin 400/500/700)を `src/main.tsx` で import、`index.html` の Google Fonts CDN(preconnect+stylesheet)を削除、`index.css` の @theme family 名を可変フォントの **" Variable" サフィックス**に整合(=最大の落とし穴を回避)。**Playwright 実測: 外部フォントリクエスト 0 件・4フォント全て同一オリジンから適用**。woff2 計 3.1MB(和文 ~2.9MB が支配的)。
- **オフライン動作** ✅ — `public/sw.js` をビルド後フック `scripts/inject-sw-precache.mjs` で dist の woff2 17件をプリキャッシュ注入(完全オフライン保証)。`build` = `tsc -b && vite build && node scripts/inject-sw-precache.mjs`。dist に Google Fonts 参照ゼロを確認。
- **`manifest.screenshots`** ✅ — `public/screenshots/{mobile-1(390×844),desktop-1(1280×800)}.png` を Playwright で撮影し manifest に narrow/wide で登録。
- **GTO戦略パネルのアイコン是正** ✅ — `LiveStrategyPanel` の `📊` 絵文字を lucide 風インライン SVG(バーチャート・`navItems` と同書式)に置換。
- 検証: **338テスト緑・型0・lint0・build緑**。

> ✅ **完了(2026-06-06)**: 静的ホスティング(HTTPS)= GitHub Pages 公開済。iPhone は公開 URL を Safari で開き「ホーム画面に追加」。

### 配布パス(土台の後・必要になったら選定)
| パス | 対象 | アカウント/$ | 別OS機 | 主作業 |
|------|------|------------|--------|--------|
| **① PWA**(最有力・個人/ローカル) | Mac/Win=Edge/Chrome「インストール」, iPhone=Safari「ホーム画面に追加」 | 不要・$0 | 不要 | HTTPS 配信 or localhost。共通土台で実質完成 |
| **② Tauri デスクトップ** ✅Mac | Mac(.dmg/.app)=**実装済** / Windows(.msi)=未 | 署名時 Apple ID $99 / Win 証明書(任意) | **Win は要 Windows/CI** | `src-tauri/` 追加済・`npm run tauri:build`。下記「実装」参照 |
| ③ Capacitor / Tauri iOS(ネイティブ)🧊 見送り | iPhone(App Store) | **Apple $99 必須** | **要 Mac + Xcode** | **当面見送り(2026-05-31)= iPhone は PWA 方針**。将来 App Store 配布が必要になれば: wrapper + 署名 + 審査(simulated gambling=17+ 申告)。手順は [`./RELEASE.md`](./RELEASE.md) §1/§2/§5。`capacitor://`/`tauri://` で sw.js 無効化要。 |

> Electron は Tauri の代替(楽だが ~100MB+)。Android は Capacitor で iOS と同時に出せる(Google Play $25・要 screenshots)。

### Tauri デスクトップ実装 ✅ Mac(2026-05-31)
- `src-tauri/`(Tauri v2)を追加。**`npm run tauri:dev`**(開発・ホットリロード)/ **`npm run tauri:build`**(配布物生成)。
- 成果物: `src-tauri/target/release/bundle/macos/GTO Lab.app`(16MB)+ `.../dmg/GTO Lab_0.1.0_aarch64.dmg`(**約11MB の単一ファイル = 「1ファDLで実行」**)。Rust コンパイル ~57s。
- `tauri.conf.json`: frontendDist=`../dist` / beforeBuildCommand=`npm run build` / window 1200×820(min 900×600)/ CSP=null(起動優先・後で厳格化可)/ identifier `com.gtolab.app`(商標 L4 は後で変更可)。
- `src/main.tsx`: Tauri 配下(`__TAURI_INTERNALS__` 検出)では SW を登録しない(資産バイナリ同梱で不要・stale 回避)。**Web/PWA 経路は不変**(ブラウザでは従来どおり SW 登録)。
- 前提: Rust(rustup)導入済・Xcode あり・Apple Silicon。`src-tauri/target` `gen` は gitignore。検証: 338テスト緑・lint0・build緑・bundle 生成確認。
- 残(任意): **Apple Developer ID 署名 + notarize**(未署名は初回起動で「未確認の開発元」警告 → 右クリック→開く で回避)/ **Windows ビルド**(要 Windows マシン or CI・同手順)/ CSP 厳格化。

---

## E. CI/CD・リリース運用

> 現状 CI(GitHub Actions・`.github/workflows/ci.yml`): push/PR で lint → build(tsc -b)→ test → `npm audit`。緑で稼働中。**CD(自動デプロイ/配布)は未整備**。
> 「うまく回す」の具体像は要決定(下記候補)。

| 項目 | 状態 | 担当 | メモ |
|------|------|------|------|
| CI ハードニング | 🔄 | 🤖 | ✅ **Node20 actions 非推奨警告の解消(2026-06-06)**: `ci.yml`・`deploy-pages.yml` の `actions/checkout`@v6・`setup-node`@v6・`upload-pages-artifact`@v5・`deploy-pages`@v5 へ更新(当初メモの @v5 は古く、最新メジャーへ。2026-06-16 の Node24 強制に先んじて解消)。npm キャッシュは `setup-node` の `cache: npm` で有効済・cargo は Tauri 見送りで対象外。重い CFR テスト安定化(testTimeout 45s)済。**2026-06-06: 実 CI(lint/build/test/audit)・Pages デプロイともに緑を確認済**(commit `0ea891c`)。 |
| CD: PWA 自動デプロイ | ✅ | 🤖 | **稼働中(2026-06-06)**。main push → `deploy-pages.yml` で build → Pages 自動公開(初回デプロイ成功確認)。下記 C節「Web アプリ化 = GitHub Pages 公開」が正典。 |
| CI: npm audit 失敗(vitest 脆弱性) | ✅ | 🤖 | **2026-06-06 解消**: `vitest`/`@vitest/ui` を `^3.2.4 → ^4.1.8` に semver-major 更新し GHSA-5xrq-8626-4rwp(critical 2件)を解消。`npm audit --audit-level=high` が 0 件・CI Audit ステップ緑。全372テスト緑・build緑。vitest4 が node 型を transitive 供給しなくなった影響で、scripts/.cache を読む 2 つの solver test に `/// <reference types="node" />` をファイル局所付与(app 全体の types へは node を足さない=本番 src へ process/Buffer を漏らさない)。commit `0ea891c`。 |
| CD: Mac+Windows 配布物の自動ビルド(Tauri) | 🧊 見送り | 🤖 | **2026-06-06 降格**: 配布は PWA一本化(C節・GitHub Pages 公開済)に決定 → Tauri ネイティブ配布は見送り・本項目は保留(再開時は以下の旧計画)。<br>旧計画(2026-05-31): `v*` タグ push をトリガに GitHub Actions の**マトリクス**で自動ビルド → GitHub Releases に自動添付。<br>・`macos-latest` → `.dmg`/`.app`(aarch64)<br>・`windows-latest` → `.msi`/`.exe`(NSIS)。Windows は WebView2 標準搭載で追加不要<br>・新規 `.github/workflows/release.yml`。`tauri-apps/tauri-action` で build+Release 添付を一括(各 runner で `npm run tauri:build`)<br>・署名は別途・未署名でも動作(Mac=Gatekeeper / Win=SmartScreen 警告のみ)。Intel Mac も配るなら x86_64/universal を追加<br>・既存 `ci.yml`(lint/build/test)はそのまま、本ワークフローは tag 時のみ起動 |
| リリースのバージョニング | ⬜ | 🤖 | `package.json` / `tauri.conf.json` の version 統一 + tag → Release のフロー化。 |

> **方向決定済(2026-05-31)**: ③ **tag → Mac `.dmg` + Windows `.msi` を CI マトリクスで自動ビルド → GitHub Releases**(上記「✅採用」行)。これで Mac だけで Windows 版まで配れる。
> ①CI ハードニング・②PWA 自動デプロイは未判断(別途)。実装は別タスクで着手予定。

---

## 対象外(判断済み・やらない)

- **WASM / COOP-COEP / SharedArrayBuffer**: 自前 TS ソルバーで非依存のため不要(R29)。`archive/` の WASM 関連項目(postflop-solver 配線等)は採用しない。
- **マルチウェイポットの GTO 精度**: 設計ルール4で意図的に除外(「参考値」と表示)。
- **プリフロップの 4bet/5bet・スクイーズ・ミニレイズ戦略**: スコープ外。
- **可変スタック深さ**: 100BB 固定が前提(push/fold ドリルのみ 5〜25BB を別途提供)。
