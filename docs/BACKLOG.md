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
| U7 | ゲームのアクション履歴が場所を取り見にくい | 🟡 | ✅ | 2026-06-06: アクション履歴(`BetLine`)をモバイル(<sm)で非表示。**2026-06-07: PC(デスクトップ)でも場所を取るため完全廃止**(`BetLine.tsx`/`BetLine.test.tsx` 削除・`GamePage` から除去)。卓の各シートが直近アクションを出すため情報は冗長=全環境で不要と判断。 |
| U8 | GTO戦略が事前表示で「答え」を先に見てしまう | 🟠 | ✅ | 2026-06-06: study の戦略表示を「アクション**前**の常時表示」→「アクション**後**の答え合わせ」に変更(`LiveStrategyPanel` に `revealActed`、`gameStore.lastHeroDecision` で打った決定を保持)。事前に見せないので `markHinted` せず**精度サンプルにも入る**(測定が正直に)。設定「答え合わせ表示」OFF で非表示=純粋テスト。✅ **追補(2026-06-06)**: 自分の手でハンドが終わる局面(HU リバーのコール等)でも、最後の決定の答え合わせを New Hand の上に表示。 |
| U9 | 他プレイヤーのアクションの移り変わりが速すぎる | 🟡 | ✅ | 2026-06-06: 相手の「間」を読める速さに(fish 550–1100ms / gto 650–1300ms・従来比約2倍)。設定「相手アクションの速さ」(slow/normal/fast・既定normal)を追加し倍率調整可。遅延算出は UI 層(`gameStore`)で `aiSpeed` を emit 時に読む=再初期化なしで即反映・engine は設定非依存を維持。 |
| U10 | スマホで自分のカードとアクションボタンが重なる / 全体が見えずスクロールが要る | 🟠 | ✅ | 2026-06-06: 原因はモバイル卓だけ高さ制約が無かったこと(デスクトップは `useContainSize`、モバイルは CSS `aspect-[5/6]` の幅基準で縦に溢れ、`top:90%` のヒーロー席が卓下にはみ出してボタンに重なっていた)。対応: モバイルも `useContainSize(5/6)` で**利用可能高さにフィット**(`GamePage` の測定高さ `tableH` をモバイル卓にも付与)→ 卓+アクション+フッターが1画面に収まる。ヒーロー席 top 90→86・ヒーローカード md→sm(compact)・上席 top 8→13・左右席を分離。Playwright で 360×640〜430×739/390×844 を実測し no-scroll・札↔ボタン gap 5–21px・上端見切れ解消を確認。デスクトップ回帰なし。**残(360幅の側席近接)は 6-max を最小幅に収める制約上の許容範囲(軽微・札↔ボタンは全幅で解消済)** → **U26 で卓ごと比例縮小により構造的に解消(2026-06-07)**。 |
| U11 | 学習履歴が端末内のみで、別端末への引き継ぎ・バックアップができない | 🟡 | ✅ | 2026-06-06: 設定に**JSON エクスポート/インポート**を実装(`src/lib/storage/dataTransfer.ts`・3つの persist 先を束ねて移送・完全ローカル/外部送信ゼロ・version 検証/部分インポート)。読み込み後はリロードで反映。以下は当初メモ。**優先度低**。仕様(バグではない): 履歴・進捗は端末内のみ(`sessionStore`=IndexedDB `poker-gto`/キー `poker-gto-session`、`progressStore`/`settingsStore`=localStorage)。第三者送信ゼロの設計ゆえ、端末/ブラウザを変えると引き継げず、サイトデータ削除や PWA アンインストールで消える。→ 案①(推奨): **JSON エクスポート/インポート**(設定ページに「データ書き出し/読み込み」。完全ローカルで実装でき「第三者送信ゼロ」を維持・手動バックアップ/機種変に対応)。案②クラウド同期はアカウント+バックエンドが要りプライバシー前提が崩れるため、やるなら明示同意の別設計。まず①で十分。 |
| U12 | レンジ表のシナリオ選択がピルボタンの羅列で壁になっている(パターン過多) | 🟡 | ✅ | 2026-06-06: **種別(オープン/vsオープン/対3Bet)×シナリオの2段選択**にコンパクト化。RangeVsRange の select も種別 optgroup に整理。分類は `preflop.ts` の `scenarioKind/scenariosOfKind`(id規則ベース)。以下は当初メモ。現状 `RangesPage` の `SingleRange` が `PREFLOP_SCENARIOS`(**現27件・今後 R4 等で増える**)を全部ピルボタンで横並び展開 → スポット増で壁状になり選びにくい。→ **リスト/ドロップダウン選択でコンパクト化**。案: ①セレクト(コンボボックス)1つで選ぶのが最小実装、②`type`(オープン / vsオープン=ディフェンス・3bet)×`position` の2段選択で絞る(ラベル "BTN Open"/"BB vs BTN" は type×position に分解可能)、③検索/フィルタ付きリスト。`RangeGrid` 本体・データ構造は不変、選択UIのみ差し替え。`RangeVsRange` タブの選択UIも同様の課題があれば併せて。 |
| U13 | スマホで下端まで scroll が届かない/ゲームで操作までスクロールが要る(卓に余白があるのに) | 🟠 | ✅ | 2026-06-06: 原因は AppShell ルートの `h-screen`(=100vh)。**iOS Safari の 100vh は URL バー込みの大きい高さ**で、下端のボトムナビ・操作ボタンが可視領域外に出て「引っ張ると見える」状態。→ `h-dvh`(動的ビューポート=実可視領域)へ。`#root` も `min-height:100dvh`(100vh フォールバック付)、ErrorBoundary は `min-h-dvh`。内部の `overflow-auto` 構造は不変。レンジ等の全ページ + ゲームの両方を一括解消。 |
| U14 | UTG/MP Open で A8s/A7s/A6s を飛ばして A5s/A4s が入っているのが変 | 🟡 | ✅ | 2026-06-06: 手作り近似レンジの非単調アーティファクト。utgOpen に A8s:0.5/A7s:0.4/A6s:0.4、mpOpen に A7s:0.5/A6s:0.5 を補完し中抜けを解消(ウィール A5s は近傍以上を維持)。ドリフトガード(`preflop.test`)の widthPct を更新(utg 0.134 / mp 0.176)。本格精密化は R4(実ソルバー解で一括置換)方針は不変=本件はアーティファクト是正のみ。 |
| U16 | GTO解を待つ間にゲームが進み答え合わせが消える / 対象外のとき正誤の判断材料が無い | 🟠 | ✅ | 2026-06-06: ①**study + 答え合わせON では自分が打った後に一時停止**(`gameStore` の gate を `submitHeroAction` で起動・`isPaused` を store にミラー)。解の求解(非同期)中もゲームを保留し、答え合わせを確実に読める。`GamePage` に「次へ →」ボタン(`dismissFeedback` で再開)。ミス時は CoachPanel の「次へ」が担う。②**対象外のときオッズ基準のガイド**(`LiveStrategyPanel`):コールに直面していれば 必要勝率 vs 実勝率 で「コール有利/フォールド寄り」を提示(**GTO頻度ではない・含意オッズ/レイズ選択肢は未考慮**と明示)。`useEquity` を call 直面時にも有効化。Playwright で ポーズ→次へ→再開(ポット進行)を実測。テスト+1(study ポーズ)。 |
| U15 | ゲームで「GTO解の対象外」と出る局面でも、レンジは存在するので解を出せるのでは | 🟡 | ✅ | 2026-06-06: **設計ルール4どおりにマルチウェイで「参考値」を表示**するよう実装(従来は対象外メッセージのみ=ルール4より保守的だった)。`resolveSpotKey(state, hero, { multiwayReference })` を追加し、**表示経路(`useSolution`→`LiveStrategyPanel`)のみ** cold-call ありの defense でも収録 HU レンジを `multiway:true` で解決→`getSolution` が `multiwayReference` を付与→パネルに「**マルチウェイ=参考値**」バッジ + 注記、EV は非表示。**精度計算・AI 経路(`CoachAgent`/`GTOPlayerAgent`)はオプション無しで従来どおり null=除外**を維持(ルール4の精度除外は不変)。RFI の背後ブラインドは multiway 扱いしない。残る対象外は ②~~未収録ディフェンス(MP vs UTG 等)~~ **→ U22 で単独オープン HU 防御を全対カバー済(2026-06-07)** ③盲対盲・4bet応酬・3betマルチウェイ(squeeze)。偽の厳密解は出さない(ルール1)。テスト+3(resolveSpotKey/getSolution/LiveStrategyPanel)。 |
| U17 | フォールド後に相手同士のプレイを見続ける必要がない | 🟡 | ✅ | 2026-06-06: フォールド後は残りの AI 送出を**遅延0で即決着**(`gameStore` にモジュールフラグ `heroFoldedThisHand`、`submitHeroAction(fold)` で立て `HAND_START`/`resetGame` でリセット、`delayScheduler` が遅延0に分岐)。結果(勝者)を表示して**手動で New Hand**(自動では進めない)。study+答え合わせ時は U16 のポーズで自分のフォールド判断の答え合わせを先に見せ、「次へ」で再開→瞬時決着。テスト+1。 |
| U19 | オッズに関する学習(練習)が無い | 🟡 | ✅ | 2026-06-06: **オッズドリル**をドリルタブに追加(新規 `lib/drill/oddsDrill.ts` 純計算・`OddsDrillPanel`)。3種=①必要勝率の暗算(B/(P+2B)・half25/⅔29/pot33)②コール/フォールド判断(勝率 vs 必要勝率)③アウツ→勝率(×2/×4)。種別 seg(ミックス+3種)・正誤+計算解説・`TermChips`+`ConceptLink('pot-odds')`で理論へ導線。成績は `drillStore`(`DrillKind` に `'odds'` 追加)→ダッシュボード/通算に記録(U4)。ゲームの答え合わせの `OddsGuide`(U18)にも pot-odds 理論リンク+用語チップを追加。ルール1: 「オッズ算術の練習・GTO頻度とは別」と明示。テスト+7。Playwright で ドリル→正解→解説→関連理論(pot-odds)遷移・成績記録を実測。 |
| U18 | GTO戦略だけでなくオッズ基準の望ましいプレイも常に出したい | 🟡 | ✅ | 2026-06-06: `LiveStrategyPanel` に共通 `OddsGuide` を導入し**常時併記**(GTO バーの下=副表示、対象外では主表示)。コール直面=`ポットオッズ/必要勝率/勝率→✓コール有利/✗フォールド寄り`、チェック/ベット先頭=`勝率→強い/中庸/弱い`(大まかなエクイティ目安)。**ルール1**: 「GTO頻度ではありません」と明示し、注意書きは**1行に簡潔化**(ユーザー要望)。`useEquity` 常時有効化、`showPotOdds` prop 廃止。**ミス時は CoachPanel が GTO答え+EVを出すため reveal(OddsGuide)は出さない**(残: ミス時にもオッズ併記したい場合は CoachPanel 側に追加)。テスト更新+2。 |
| U20 | ゲーム開始時のポットが 3BB(ブラインドの2倍)になっている | 🟠 | ✅ | 2026-06-06: **ブラインドの二重計上バグ**。`GameState` が `mainPotBB:1.5`(確定ポット)と `currentBetBB`(場の前ベット)の両方にブラインドを入れていた → チップ保存則破れ(600→601.5)、表示ポット2倍、`collectBetsIntoPot` が街ごとに膨らんだ mainPot へ加算しポストフロップ確定ポット・配当・`spotKey` の postflop 求解ポットまで +1.5 過大。修正: `mainPotBB:0`(ブラインドは currentBetBB のみ)+ `record.potBB`=実ポット。`potAccounting.test.ts`(初期実ポット1.5・保存則600・20ハンド)。commit `608420d`。 |
| U21 | 3bet 以降の最小レイズ額が過大 | 🟠 | ✅ | 2026-06-06: **全方位レビューで検出**。`getMinRaiseToAmount` が `ActionRecord.amountBB`(to-amount)をレイズ幅扱い → open 2.5 への最小3betが 5.0(正:4.0)等。レイズ幅=今回 to − 直前到達水準 に修正。`BettingEngine.test.ts` 回帰5件。commit `43a9454`。 |
| U22 | 単独オープンへの応答で「対象外」が出る局面があり、答え(頻度)が見られない | 🟡 | ✅ | 2026-06-07: 原因は配線バグではなく**そのポジション対の手作りレンジ自体が不在**(MP vs UTG / CO vs MP / SB vs UTG / SB vs MP の4対=唯一の未収録)。既存6対の vs-open レンジをアンカーに**4対の近似レンジを新規作成**(`preflop.ts`・combo比 mp-vs-utg7.3/co-vs-mp11.8/sb-vs-utg4.4/sb-vs-mp5.2%・SBはOOP 3bet-or-fold)し `POS_VS_SPOT`(`spotKey.ts`)へ配線→**フォールドで回ってきた単独オープン応答を全対カバー**。表示は「参考: GTO近似」(頻度のみ)。EVは付けない判断: 対応する facing-3bet レンジが無く 3bet EV=0 になると「EVあり防御は全て実3bet EVを持つ」不変条件が崩れ、バリューハンドで頻度とEVが矛盾するため(`DEFENDER_TO_OPENER` に注記)。**4並列の敵対的GTOレビュー**実施→アンカー整合で取捨(採用: sb-vs-utg に A2s 追加で単調性是正 / co-vs-mp のフラットを中庸に拡張 10.3→11.8%[btn-vs-mp14.6 未満を維持]。却下: AKs/AKo「逆転」=既存全アンカーが意図的に AKo≥AKs / co-vs-mp 22% 案=btn-vs-mp と内部矛盾 / sb-vs-mp 拡張案=オープナー強度が逆[MP<CO なので狭いが正])。順序検証: SB utg4.4<mp5.2<co5.7、CO/BTN とも UTG→MP で +3.1/+3.6 と一貫。`PREFLOP_SCENARIOS` 27→31。ドリフトガード/分類/解決テスト更新。**419テスト緑・型0・lint0・license OK**。アクション履歴(BetLine)も全環境で廃止(U7)。 |
| U23 | ショーダウンで勝者が2人表示される(弱い手が high_card 等で「勝つ」) | 🔴 | ✅ | 2026-06-07: **スクショ報告(BTN two_pair +212 / SB high_card +51 の2勝者)を再現し確証**。原因は `applyAction` の `raise` 分岐に**持ち分上限が無い**こと。`raise` 到達額が `currentBetBB + stackBB` を超えても `currentBetBB = target` を設定→相手がコールできない超過分が**幽霊チップ化**し、`collectBetsIntoPot` で**単独 eligible のサイドポット**になり、ショーダウンで負け手が「+XXBB」を勝つ+**チップ保存則違反**。トリガー: AI が `raise` を `minRaiseToAmount`(残スタック超になりうる)で発行。修正: `target = Math.min(requested, currentBetBB + stackBB)`(超過指定は実質オールイン)。`BettingEngine.test.ts` 回帰+2(キャップ/保存則・単独勝者)。`call`/`allin` 分岐は元から上限あり=不変。**421テスト緑・型0・lint0**。 |
| U24 | 「あなたの勝率」が出ない場合がある | 🟠 | ✅ | 2026-06-07: 正直表示は維持しつつ「出せるはずの局面」を直し「出せない局面」は理由を明示。①**バグ修正**: `monteCarlo.ts` のリジェクションサンプリング(30回上限)がマルチウェイで枯渇→`samples=0`→null になっていた → **衝突しないコンボを先に filter→一様抽選**に変更(割当が在る限り取りこぼさない)。②**ミラー同期**: `opponentRange.ts` の `POS_VS_SPOT` に U22 の4スポットを反映(相手が当該防御者でも勝率が出る)。③**理由表示**: `useEquity` に `reason`(`limped`/`fourbet_plus`/`uncovered_line`/`no_opponent`/`sampling_failed`)を追加し、`OddsGuide` が「—」の代わりに『相手レンジ不明(リンプ/4bet以上/未収録)のため勝率は出せません』等を1行表示。捏造(vsランダム)はしない(ルール1)。テスト+(reason/samples/新スポット解決)。 |
| U25 | 各局面で「考え方・考えるべきこと」の解説がほしい | 🟡 | ✅ | 2026-06-07: アクション**前**に**答え中立の「この局面の考え方」ガイド**を追加(U8『答えは打った後』を維持=GTO頻度は出さない)。新規 `lib/coach/decisionGuidance.ts`(純TS・`handTier`/`boardTexture`/`isHeroIP` 再利用)が観点(位置IP/OOP・ハンドクラス・ポットオッズ/必要勝率・相手レンジの定性・ボードテクスチャ)+関連理論リンクを生成。`ReasoningGuide.tsx`(折りたたみ・`TermChips`/`ConceptLink`)を `GamePage` の hero 手番に表示。`settingsStore.showReasoningGuide`(既定ON・SettingsPageトグル)。答えは打った後の `LiveStrategyPanel`(答え合わせ)+CoachPanel が担う(役割分担)。`decisionGuidance.test.ts`(RFI/vsオープン/postflop IP・OOP/equity理由・conceptId実在を検証)。**UX修正(2026-06-07・実機Playwright検証)**: ①既定を**折りたたみ**化(手番到来時に勝手にヒントを見せない)②理論リンクを概念タイトルで区別+最大3件(同一「理論 ▶」羅列の解消)③展開部を**絶対配置オーバーレイ**にして卓の高さを奪わない(6-max座席の重なり=ヒーローカード不可視を解消)。**統合(2026-06-07)**: 考え方/答え合わせ/オッズ目安の重複を解消し**`SpotPanel`に1本化**(`ReasoningGuide`/`LiveStrategyPanel` 廃止・`OddsGuide` を独立部品化)。`phase='decision'`(手番前・既定折りたたみ・観点+オッズ1回+「GTOの答えを見る」で頻度+EV表示し markHinted=精度除外)/ `phase='review'`(打った後・自動展開で答え合わせ+オッズ1回)。オッズはパネル内1回のみ。`studyShowStrategy=false` は答え欄を出さない。プリフロップの**レンジ外の手は「フォールド100%」**表示(従来は「対象外」と誤表示)。テスト `SpotPanel.test.tsx`(10件)へ移植・435テスト緑。**スペース最適化(2026-06-07)**: 答え合わせ(review)パネルが背高で卓を圧迫し座席が重なる + 理論/用語リンクが場所を取りすぎる指摘 → **「関連理論・用語」を既定折りたたみ**(大ボタン+チップで縦に伸びていた主因)+ review パネルに `max-h-[48vh] overflow-auto`(伸びても卓高を奪わない防御)。**追補(2026-06-07)**: ①「上が見切れて戻れない」= コンテナの `justify-center`+`overflow` で上端クリップ → `justify-start` に是正(上端までスクロール可)+ decision 展開部を**固定ボトムシート**化(上方向 absolute の祖先 overflow クリップを回避)。②「必要勝率が2つ」= 考え方観点の「オッズ」行と `OddsGuide` の二重 → 観点からオッズ行を削除し **必要勝率/勝率は `OddsGuide` の1回のみ**(数値の単一ソース化)。**追補2(2026-06-07)**: ①`OddsGuide` 内の理論/用語リンク(「オッズの理論」+用語チップ)を撤去し**「関連理論・用語」へ集約**(pot-odds + ポットオッズ/必要勝率/エクイティ を統合側に常時内包・リンクの散在解消)②**プレイ後(review)でも「この局面の考え方(観点)」を折りたたみで閲覧可**に(打った後に位置/ハンド/相手/ボードを振り返れる・既定は答え主体でコンパクト)。 |
| U27 | レンジ表(RangesPage)の頻度内訳が hover 依存でスマホで見られない 他モバイル/タッチ UX 仕上げ | 🟡 | ✅ | 2026-06-07 完了(全方位レビュー由来・4フェーズ): **A(モバイル/タッチUX)** ①`RangeGrid` のセル内訳(Raise/Call/Fold%)が `title=`(hover)依存=タッチで出ない → **タップで内訳ポップオーバー**(`TermChips` の Portal+fixed+外側クリック/Esc+画面端クランプを再利用・単一 state)②`TermChip` タップ領域 36→44px ③landscape 短画面の `SpotPanel` 見切れ検証。**C(perf/整理)** GamePage の `useGameStore()` セレクタ化 / `RangeGrid` セル memo / PREFLOP_SCENARIOS 遅延化(要評価) / `src/CLAUDE.md` 早見表の削除済みコンポーネント記述の整合。**B(テスト=QR1)** hooks(`useSolution`/`useEquity`)・`gameStore` pause/resume・`getSolution` プリフロップ3分岐。**Phase0 ✅(2026-06-07)** 読み込み時 console を切り分け: ①**2 errors = dev 限定**の Vite `%BASE_URL%` 二重展開(`/poker-gto/poker-gto/manifest.json` 等)。**本番は正常**(`/poker-gto/manifest.json` HTTP200・有効JSON を実測)=ユーザー影響なし・`%BASE_URL%` は custom-domain 可搬性のため温存し記録のみ。②**1 warning = `apple-mobile-web-app-capable` 非推奨**(本番にも存在)→ `index.html` に標準 `<meta name="mobile-web-app-capable" content="yes">` を追加して解消(実測 0 warnings)。**A 実装 ✅(2026-06-07)**: ①`RangeGrid` セルを `<button>` 化し**タップで頻度内訳ポップオーバー**(Portal+fixed・画面端クランプ・同手再タップ/外側/Esc/scenario・heatmap切替で閉)。Playwright 実機(390)で open/clamp/toggle/auto-close を実測。②`TermChip` `min-h-9→min-h-11`(44px・ConceptLink と統一)。③landscape(844×390=desktop layout)検証=decision ボトムシートは内部スクロールで到達可・見切れなし→**修正不要**。`RangesPage` 説明文を「タップ(PCはカーソル)」に更新。**C 実装 ✅/判断**: C2=`RangeGrid` セルを `React.memo`(ポップオーバー開閉で169セル再描画しない)。C4=`src/CLAUDE.md` 早見表の sessionStore/progressStore/drillStore を実装済みへ更新。**C1=見送り**(GamePage は選択フィールドが毎アクション変化、唯一の非選択 `handCount` も単独変化しないため selector 化の再レンダー削減効果は実質ゼロ=churn 回避)。**C3=defer**(PREFLOP_SCENARIOS は `getSolution` が同期参照、分割コスト>効果)。**B 実装 ✅**: hooks(`useSolution`/`useEquity`)・`getSolution` プリフロップ分岐の新規テスト + `gameStore` の `lastHeroDecision` 捕捉追補(詳細は F 節 QR1)。**450テスト緑・型0・lint0・build緑・license/version OK**。 |
| U26 | モバイルで答え合わせ表示時に席カード・ベットチップ・中央ポットが左上で団子状に重なる(実機 iPhone スクショ) | 🟠 | ✅ | 2026-06-07: **構造的原因** = 答え合わせ(`SpotPanel` review)が背高だと `GamePage` の `tableH`(=利用可能高−操作領域高)が縮み → `PokerTable` が `useContainSize(5/6)` で卓を小さく描画するが、**席ボックス/ポット/チップは固定サイズ**で配置だけ `left%/top%` のため、卓が小さいほど中身が相対的に巨大化し隣接席・ポットと重なる(U10/U25 で緩和しつつ残存)。**対応(ユーザー選択=卓ごと比例縮小・スクロール不要)**: `PokerTable` で卓の描画幅 `size.w` から `seatScale = clamp(size.w/REF_W, 0.35, 1)`(REF_W=mobile360/desktop760)を算出し、**席(+Dボタン)・ポット/ボード・ベットチップを内側ラッパで一括 `transform: scale()`**。`-translate-x/y-1/2` のアンカー(席=`left%/top%`・ポット=中央)は transform がレイアウト寸法を変えないため不変→重なりを構造的に解消。`scale=size.w/REF_W` は定義上「常に収まる」ため下限は暴走防止の安全弁(0.35)のみ=極小画面でも重なり0。`SEAT_POS`座標は不変、scale=1 時は transform 無し(通常プレイ・デスクトップは現状維持)。**実機相当 Playwright 検証**: 390×844(報告端末・review/通常操作)/360×640(最小Android・最悪squeeze)/1280×800(desktop) で席同士・席×ポットの矩形重なり**全て0**・上端クリップ解消・通常操作とデスクトップは scale=1 で回帰なしを実測。436テスト緑・型0・build緑。 |
| U28 | アクション前「この局面の考え方」を開くと全面に広がり見にくい | 🟡 | ✅ | 2026-06-09完了(`kind-pondering-alpaca` C-FIX1): SpotPanel decision の全幅ボトムシート(80vh+黒幕 `bg-black/50`)→ **コンパクト中央カード**(`fixed inset-0 grid place-items-center bg-black/30 p-4` + `max-w-md max-h-[70vh] overflow-auto`・カードに stopPropagation)。卓が透ける。Escape/内部スクロール/上端見切れ回帰なしを確認。review分岐は不変。 |
| U29 | 答え合わせで GTO「推奨アクション」が分かりにくい(「あなた:◯◯」のみ) | 🟡 | ✅ | 2026-06-09完了(C0/C-FIX2): 共有util `lib/coach/recommendation.ts`(最頻=推奨)新設(`PostflopReviewPanel` の recommendedAction を一般化・集約)。SpotPanel review に「★ 推奨: …」バッジ。StrategyBars に **opt-in** 「推奨」ピル(H3: `showRecommended` 既定OFF=行動前に答えを漏らさない・U8 遵守)。honest: `approximate*` は「推奨(最頻)」。 |
| U30 | 推奨ベットサイズが分からない | 🟡 | ✅ | 2026-06-09完了(C-FIX3): StrategyBars のサイズ表記を `actionSizeLabel`(「レイズ 3.6BB」・単位付与)に置換、推奨バッジにサイズ内包。check/call/fold は素ラベル。ラベル幅 w-16→w-20。 |
| U31 | 関連理論/代表ボード/履歴の本アイコンが絵文字(📚/📖)で既定 `BookIcon` と不一致 | 🟡 | ✅ | 2026-06-09完了(C-FIX4): 3箇所(`SpotPanel.tsx:152`・`PostflopDrillPanel.tsx:203`・`HandReplay.tsx:76`)を `<BookIcon/>` に置換。「関連理論・用語」の余分な「・」は**見間違い=対応不要**。 |
| U32 | コーチの推奨文でベットサイズが浮動小数点アーティファクト表示(例「レイズ 7.8100000000000005BB」) | 🟡 | ✅ | 2026-06-12: 原因は `CoachAgent.ts` の `recommendText` が `sizeBB`(EV計算用の生float)を丸めず `${s.sizeBB}BB` で展開していたこと(バーは別経路 `actionSizeLabel` の `toFixed(1)` で正常だった)。表示専用ヘルパ `fmtBB = String(Math.round(n*10)/10)` を追加しバーと同じ小数1桁へ丸め(末尾0は省く: 7.8/2.5/3/コール1BB)。`recommendText` を export し回帰テスト追加(`CoachAgent.test.ts` 11件緑・型0)。他の生BB展開は無し(`GameFooter`=整数スタック・`PlayerSeat:152`=React key で表示文字列でない)。 |
| U33 | Phase B 後も UI が概算EVを「ヒューリスティック(equity近似)」と説明=モデル解由来になった大半のスポットで不正直(ルール1違反) | 🟠 | ✅ | 2026-06-13: **Phase B 公開準備レビュー(workflow `whugvwxha`・敵対的検証付き)で検出**。`approximate_with_ev` は被覆スポット=フロップサブゲームモデル解(`E_w[V]−cPre`)/未被覆・4bet枝=ヒューリスティックの混成だが、3つのUI面が「equity近似のヒューリスティック」固定表示だった。修正: `StrategyBars.tsx:51`(EV列ツールチップ)/`StrategyDetail.tsx:19`(バッジtitle)/`GameFooter.tsx:15`(SOURCE_INFOラベル)を混成実態どおりに書換、`types/solver.ts` の型コメントも更新。source ティアは `approximate_with_ev` 据置が正しい(戦略は手作りのまま)・methodology 詳細は `meta.sourceName`。type-check/lint/コンポーネント40テスト緑。同レビューで license L1・support gate は「問題なし」確認済。 |

---

## A. GTO 精度(本丸の残・主に環境制約)

| ID | 課題 | 状態 | 担当 | なぜ残るか / 方針 |
|----|------|------|------|------------------|
| **R4** | 100BB の open/3bet を真 Nash 解へ | 🔄 | 🤖 | push/fold(≤25BB)のみ厳密解済み。**Phase B ✅ 2026-06-13 完了**: `(equity−0.5)×F` ヒューリスティックをサブゲーム解 EV で置換。10 ポット構成×N=60 層化サンプル×約 5 時間(600 ジョブ・6 worker)・全 27 スポット相関 ≥ 0.7(support ゲート後)・AA EV ≈ 3.6BB アンカー確認。id 配線バグ(敵対的レビュー検出)と尾手ノイズ(相関ゲート検出)の 2 バグを修正済み。source は `approximate_with_ev`(戦略は手作りのまま=正直表示)。569 テスト緑・type-check/lint/license 全緑。詳細 `docs/SOLVER.md` § 5。**Phase C 🛑 中止(2026-06-13)**: モデル内 Nash の FP は exploit ≤0.0012 に収束したが、**HU 縮約(opener vs BB)が opener-BB 間のプレイヤーを無視するため早い位置の open が構造的に過広**(UTG 63.5% vs アンカー 13-17% / BTN 57.8% vs 40-50%)。位置依存のオープン幅は HU 縮約では原理的に再現不能で、被覆拡大(外側反復)では直らない → 中止基準を適用しレンジ採用は見送り。真 6-max Nash は multiway 必須で 16GB 不可(本欄当初評価と一致)。求解器コード(`preflopModelGame.ts`/`solve-preflop-nash.ts`)は将来の multiway 化用に保持。`solver_model` ティアは予約のまま未使用。詳細 `docs/SOLVER.md` § 6。<br>**Phase C2-1 ✅ 2026-06-13**: Phase C の構造的限界を「背後プレイヤーを1つのアクション順ゲーム木に入れる」で解決。新規 `preflopMultiwayGame.ts`(6-max 木 + CFR+ + 終端 EV: foldout 厳密 / allin=N-way 厳密 / seen-flop=エクイティ×IP/OOP 非対称実現率・multiway は粗 proxy)+ `preflopEquity.nWayEquity` + `scripts/solve-preflop-multiway.ts`。**木ノード数が C2-0 スパイクと厳密一致**(33,969 決定/5.74M info-set)。致命バグ(終端の reach 正規化で到達確率重みが消失→退化均衡)を `prodOthers` 非正規化重み付けで修正。**結果(600 反復): UTG15.7/MP19.1/CO25.0/BTN41.7 = 4/5 アンカー命中・Phase C の UTG 63.5% → 15.7% = 位置依存オープン幅を構造から回復**・安定性 Δ≤0.4。SB のみ外(no-limp/OOP 実現率の緊張)。全577テスト緑。<br>**Phase C2-2 ✅ 2026-06-13**: ①3bet/4bet サイズを Phase B pot に整合(11/24)②HU seen-flop を Phase B V 行列で評価(UTG/MP/CO/BTN SRP + BTN/CO 3bet・`huSeenFlopEV` 解決器)。**結果(600反復): UTG15.5/MP18.3/CO24.1/BTN40.7 = 4/5 アンカー命中・安定性 Δ≤0.6**。**知見: Phase B V は flat 実現率と差 ≤0.4pt = 較正済 flat が解値をよく近似・open 幅は seen-flop EV 精度に頑健**(「BTN/CO 圧縮=flat 律速」は誤りと実証訂正)。SB のみ据え置き(29.1 vs 35-58 = no-limp 抽象 + OOP 実現率の構造的境界・srp-sb-bb は size/ラベル不整合で未配線=正直表示)。残=**リンプ抽象**(SB 本丸・木拡張)/ 5bet-allin 本求解 / **採用ゲート C-2a(解 JSON 配給)/C-2b(フル置換)= product/正直表示判断・明示承認後**。候補レンジは `scripts/out/`(未採用・gitignore)。詳細 `docs/SOLVER.md §6.5-4/5`。 |
| **flop 完全チャンス CFR** | flop を river ベッティングまで含む厳密 CFR で求解 | ✅ | 🤖 | **2026-06-13 解決(Phase 0+A・`docs/SOLVER.md` 参照)**: 「~13%頭打ち」は実測ログの再診断で **30×30コンボ・6×6ランナウトサブサンプルの近似下限**(CFRの限界ではない)と判明 → オフライン全列挙+カーネル最適化で突破。①intカード化/Float64Array/eq行列25倍dedup(flop 9.8倍)+fastEval7(eq構築46倍)②スート同型ランナウト縮約(monotone 3.4倍・on/off で解は厳密一致)③DCFR(α1.5/β0/γ2)+線形平均 opt-in ④Node worker_threads 並列(`scripts/precompute-flop.ts`・再開可能・**exploit>5%は書き出さないハードゲート**)。**代表フロップ10枚×10スポット(SRP4+3bet6)×lead/facing=200テーブルを量産済**(M5・4ワーカー・4.6時間・**exploitability 中央値0.02%・最大0.06%**=商用ソルバー典型水準0.1〜0.5%超え・+2.2MB)。`getSolution`/ソルバータブ/代表ボードドリルに `solver_precomputed`(賭け考慮済)で配給、Playwright実機検証済。ランダム盤面のflopは従来どおりエクイティ近似で正直表示。541→543テスト緑。 |
| **R16 残ノード** | 再々レイズ(raisesLeft≥2)/ SB コンプリート(リンプドポット)の postflop コーチ | 🧊 | 🤖 defer | ①ツリーが構造的に「レイズ深さ1」で頭打ち(改修3層 + 実戦頻度低=費用対効果低)。②SBコンプリート/BB-vs-complete レンジが未整備で**新規手作り近似が必要**=入力レンジ品質が精度の鎖の根 → **R4(実データ)後**に回すのが効率的。マルチウェイは設計ルール4で意図的に除外。出典: `archive/RELEASE_READINESS.md` R16。 |
| **事前計算 postflop ライブラリ** | 代表ボードの解を JSON 同梱し live solve 依存を減らす | ✅ | 🤖 | **2026-06-06 実装(代表ボードドリル)**: 教科書的な代表テクスチャ(ターン4枚×4 / リバー5枚×4)× SRP4スポット × phase(lead/facing)を自前 CFR で**オフライン事前計算**し、hero レンジ全コンボの戦略テーブルを `src/data/solutions/postflop/*.json`(`source: solver_precomputed`・license `self-generated`)に同梱。`scripts/precompute-postflop.ts` 生成(turn=完全チャンスCFR・iters160/cap64で **exploit 1〜2%台**=ライブturnの8%超を大幅改善 / river=厳密 <1%)。`getSolution` がポストフロップで盤面完全一致時に live solve 前へ最優先で配給(**any mode で動く=モバイル/オフライン可**・pot/stack/betFrac不一致はライブにフォールバック)。ポストフロップドリルに「代表ボード」トグルを追加し、盤面=代表集合・hero=事前計算と同一コンボ集合から抽選(**ヒット率100%**)で即時・厳密採点。<br>**設計判断**: ゲームもドリルもランダム盤面なので完全一致事前計算はランダム盤面にヒットしない(カバーにはテクスチャ近似=ルール1抵触)→ 正直に価値が出る「こちらが盤面を選ぶ」代表ボードに限定。flop は ~13% 下限のため対象外(従来通りライブ/近似)。被レイズ(facingRaise)も v1 対象外。**2026-06-06 追補: 3betポット代表盤面を追加**(`REPRESENTATIVE_SPOT_SETS` で pot 種別を一般化し、3bet 6スポット[BB/SB 3bet vs BTN/CO の 3better OOP×caller IP]× 代表8 × phase2 = 96ファイル・pot22.5/stack89・exploit 1%台)。`precompute-postflop.ts` を pot 横断化、ドリル代表モードに SRP/3bet トグル。**計160ファイル**。残(任意): flop カードアブストラクション・facingRaise。出典: `archive/PHASE_3_5.md` / `archive/PHASE_6.md`。 |

> **規模感(2026-06-13 実測ベースに全面改訂)**: 旧見積もり(flopカードアブストラクション=L 3–6週 / R4=XL 1–数ヶ月)は **Phase 0+A の実測で無効化**。flop 完全CFRは並列実装+アルゴリズム改良で**1日で解決**(上行✅)。残る依存鎖は **Phase B(postflop EVモデル・開発4–6日+計算一晩)→ Phase C(プリフロップのモデル内Nash・開発5–10日+計算一晩×1–2)**。R16再々レイズ=S(独立・ROI低)/ R16 SBコンプリート=S–M(Phase C 後が筋)。push/fold だけが真Nashなのは「全入り=ショーダウン勝率がそのままEV」だから(Phase C は postflop をモデル化したモデル内Nash=`solver_model` 表示予定で、この差はルール1で明示する)。

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
> ⇒ Phase 6 系の UI ポリッシュは完了。下記 B7/B8 は **2026-06-09 追加の新規機能**(ユーザー要望・`kind-pondering-alpaca` プラン)。

### 新規機能(2026-06-09 計画・順次実装 — プラン `kind-pondering-alpaca`)

> 設計3並行 + 敵対的批判パス(ultracode)で検証済み。ビルド順: **C(U28-U31)→ B7 → B8**。各ステップ完了で type-check + 関連テストを緑にし状態を更新。

- **B7 キャッシュ式スタック(持ち越し)** ✅ 🤖 (2026-06-09 完了・466テスト緑) — 毎ハンド固定100BBリセット → **持ち越し(cash)**。⚠️ 設計判断「100BBリセットは意図的・修正しない」を**明示上書き**。旧挙動は `stackMode:'reset'`(**既定**)で保持し GTO評価クリーンを維持。実装: `settingsStore`(`StackMode`/`buyInBB` + persist `version`/`migrate`)・`gameStore`(`carryStacks`・真の終了スタック=`stackBB + Σ amountWonBB[winnerId]`・自動リバイ `<1BB`・netBB を可変開始に)・`DealerAgent.setConfigs`(engine純粋性維持)・SettingsPage(モード切替)・GameFooter(実効スタック drift caveat=honest-display)。注意: **M1**(initGame は settings 単一真実源・GamePage call site/dep 同時更新)/**M2**(`heroHandStartStackBB` 捕捉は startNewHand で1回)/**M3**(1BB→BB 端ケース)/**チップ保存則テスト**必須。
- **B8 ポストフロップ13x13ソルバータブ(GTO Wizard風)** ⬜ 🤖 — RangesPage に新**タブ**「ソルバー解析」(6ページ固定遵守)。スポット+ボード指定で**レンジ全体の戦略を13x13表示**。実装: `lib/solver/fullBoardStrategy.ts`(全コンボ抽出→handClass集約・専用キャッシュ)・`BoardSolverPanel`+`BoardPicker`。**着手前に確定**: **H1**(集約ウェイト=`expandRange` で comboKey→weight 再構成・precomputed/live で表示一致・cap で0コンボのクラスは「抽出外」)/**H2**(lead は check/bet 専用レンダラ・facing は `RangeGrid` 再利用)。**M4**(v1スコープ): 代表/precomputed ボード=即時 + river-live、任意ボード live と turn-live は明示ボタン裏、**flop はブロック**。honest-display: live=「簡易アブストラクション」明示・"GTO最適" 不使用。<br>⚠ **設計レビューで判明(2026-06-10)**: 既存事前計算テーブルは cap/narrow で縮約済=13x13 の大半(turn ~16/169・river ~45/169)が空セル → 「レンジ全体」をそのまま謳えない。着手するなら ①正直リスコープ(被覆率明示・空=抽出外≠fold)か ②cap撤廃テーブル再生成(スコープ拡大)を先に選ぶ。**ユーザーは B8 ではなく下記 B9(1ハンド相談)を優先採用**。
- **B9 ソルバー(RangesPage「ソルバー」タブ・旧称ハンド相談)** ✅ 🤖 (2026-06-10 完了・488テスト緑) — B8(レンジ全体13x13)とは**別物・併存**。盤面+自分の2枚+状況(位置/ストリート/相手アクション/ポット/スタック)を手動設定 → **その1ハンドのおすすめプレイ(頻度)+ 勝率 + ポットオッズ**を表示。ゲームの「場面→おすすめ+正直 source」経路を流用。実装: `lib/solver/manualSpot.ts`(`buildManualSpotKey`=GameState非依存で SpotKey 構築・有効ペア列挙・**SB の SRP は `POSTFLOP_OPENERS` で明示的に弾く**=`baseHeroIsOOP` では通る穴を塞ぐ)・`lib/equity/manualEquity.ts`(potSpec 由来の相手レンジで `computeEquityAsync`・`villainRangeSpec` を riverRanges に追加)・`hooks/useManualAdvice.ts`(`getSolution` 直叩き/レース防止)・`components/ranges/ManualAdvisorPanel.tsx`。**正直表示(ルール1)**: preflop=GTO近似(+概算EV)/ river=ソルバー解(代表盤=厳密・任意盤=live簡易)/ turn=live(明示・数秒)/ **flop=GTO頻度を出さず勝率・ポットオッズのみ**(賭け未考慮の明示)/ 任意ベット額=当該サイズで live 求解/ 未対応(SB-SRP・3betペア外・マルチウェイ)=理由付き「対象外」。キーは preflop=`handCategory`・postflop=`comboKey` で切替。Playwright で preflop/river-lead/river-vsbet/flop の4経路を実機検証。**共有基盤(`getSolution`・`BoardPicker`)は B8 と再利用可**。

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
| リリースのバージョニング | ✅ | 🤖 | **2026-06-06 実装**: `package.json` を version の正(`0.0.0→0.1.0`)とし `src-tauri/tauri.conf.json`(0.1.0)と統一。`scripts/check-version.mjs`(両者一致を検証・tag 引数で tag とも照合)+ `npm run version:check` を **CI に追加**(push/PR ごとに不一致で失敗=ドリフト防止)。新規 `.github/workflows/release.yml`: `v*` タグ push で ①タグ形式(`vX.Y.Z`)検証 ②`tag==package.json==tauri.conf.json` 保証 ③build → `dist/` を zip 添付 ④`gh release create --generate-notes` で Release 自動生成。配信は PWA 一本化(Pages 自動デプロイ)が本線で、Release は履歴の節目+固定版アーカイブ。手順は [`./RELEASE.md`](./RELEASE.md) §8。ネイティブ配布物のマトリクスビルドは見送り(下行)。 |

> **方向決定済(2026-05-31)**: ③ **tag → Mac `.dmg` + Windows `.msi` を CI マトリクスで自動ビルド → GitHub Releases**(上記「✅採用」行)。これで Mac だけで Windows 版まで配れる。
> ①CI ハードニング・②PWA 自動デプロイは未判断(別途)。実装は別タスクで着手予定。

---

## F. 品質ハードニング(2026-06-06 全方位レビュー由来)

> 64エージェントの全方位レビュー(find→敵対的verify→synthesis・確証42件)で、低リスク高価値分は即反映済
> (commit `608420d` ポット二重計上 / `43a9454` 最小レイズ / `c412528` ラベル·コメント·重複·dead-code·タップ44px)。
> 誤検出は却下済(isHeroIP の button 相対性・useEquity の cancelled ガード)。以下は妥当だが優先度中以下で保留したもの。

| ID | 項目 | 種別 | 状態 | メモ |
|----|------|------|------|------|
| QR1 | テスト網羅の拡充 | テスト | ✅ 主要 | **2026-06-06**: `Showdown.test`(単独勝ち/上位ペア/分割/サイドポット)・`PositionManager.test`(`isHeroIP` を全 button 回転で検証=ルール3、T007 の誤検出を反証)・`monteCarlo.test` にマルチウェイ(N相手・相手増で勝率減)+12件。最小レイズ(`BettingEngine.test`)・ポット会計(`potAccounting.test`)も追加済。残(低優先): `GameStateMachine` 街遷移・`CoachAgent` マルチウェイ除外の専用ユニット。**2026-06-07 実装済(U27 Phase B)**: hooks `useSolution.test.ts`(loading遷移・state=null・multiwayReference伝播・unmountキャンセル)/ `useEquity.test.ts`(無効/HU解決/マルチウェイ参考値/未解決reason/samples=0)を新規(RTL `renderHook`)。`getSolutionPreflop.test.ts`(approximate_with_ev>approximate フォールバック・multiwayReference でHU共有元を非汚染・未収録null)。`gameStore.test.ts` に `lastHeroDecision` 捕捉を追補。pause/resume は既存 U16 テストでカバー済。**450テスト緑(+14)**。 |
| QR2 | a11y: 色のみ強調の是正(ルール5) | a11y | ✅ | **2026-06-06**: 検証の結果ほとんどは**誤検出**(`WeaknessCard`=ランク#/回数/-BB の符号で text 伝達、`RangesPage`=「3-Bet:」「コール:」ラベル併記、`RangeGrid`=%/トークン角併記で色覚配慮済)。真の不足だった `ActionPanel` プリセット選択に `aria-pressed` を付与(視覚は明度差で可)。 |
| QR3 | a11y: ホバー一時停止のキーボード対応 | a11y | ✅ | **2026-06-06**: `CoachToast`/`CoachPanel` に `onFocus`/`onBlur` を追加(キーボード/タッチでも自動消滅を停止・WCAG 2.2.1)。`TermChips` のツールチップに `id`+`aria-controls`/`aria-describedby` を付与しボタンと関連付け。`GameFooter` モーダルは既に `aria-label` 済(対応済)。 |
| QR4 | データライセンスのビルド時強制(L1) | security | ✅ | **2026-06-06**: `scripts/check-data-license.mjs`(`src/data/solutions/**` の `meta.license` が `self-generated`/`original` か検証=201件全件OK)+ `npm run license:check` を **CI に追加**。他社ソルバー出力の誤混入をビルドで防止。 |
| QR5 | multiway equity のサンプル下限警告 | 精度 | ⬜ 任意 | rejection sampling で `samples` が大きく減った場合に信頼度を下げる/注記(参考値ゆえ低優先)。実測ではサンプル効率は高く、当面保留。 |

---

## 対象外(判断済み・やらない)

- **WASM / COOP-COEP / SharedArrayBuffer**: 自前 TS ソルバーで非依存のため不要(R29)。`archive/` の WASM 関連項目(postflop-solver 配線等)は採用しない。
- **マルチウェイポットの GTO 精度**: 設計ルール4で意図的に除外(「参考値」と表示)。
- **プリフロップの 4bet/5bet・スクイーズ・ミニレイズ戦略**: スコープ外。
- **可変スタック深さ**: 100BB 固定が前提(push/fold ドリルのみ 5〜25BB を別途提供)。
