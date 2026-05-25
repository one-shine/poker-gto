# Phase 5: 学習システム + リフレクション

> 親計画: [../IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

## 進捗 (2026-05-24) 🔄 主要スコープ完了・一部 Phase 6 送り

- [x] **R8 エクイティ Monte Carlo**: `lib/equity/monteCarlo.ts`(相手レンジ指定シミュレート・タイ/分割対応)+ `workers/equity.worker.ts` + `equityClient.ts`(Worker委譲・インラインfallback)+ `useEquity` フック + `opponentRange.ts`(相手レンジ推定)。study(intermediate+)で「あなたの勝率」を必要勝率と並べ、オッズ充足(✓/✗)を表示。検証4件(AAvsKK 0.82/タイ/ナッツ/空)。
- [x] **プリフロップドリル**: `lib/drill/preflopDrill.ts`(出題生成・頻度10%判定・カテゴリ絞り込み・testable)+ `DrillQuestion`/`DrillPanel` + LearnPage「ドリル」タブ。XP(正解+5/挑戦+2)。テスト5件。実機確認(96o vs UTG → fold 正解)。
- [x] **Theory↔Practice ループ完成**: 弱点カード/理論記事の「🎯 ドリルで練習」を `navStore.drillCategory` 経由でドリルタブに接続(Phase 4.5 の「近日」を実機能化)。
- [x] **ReflectionModal**: 100ハンドごと自動(>0ガード・節目一度)+ SettingsPage「セッションを振り返る」(≥20ハンド)。精度/EV損失/最大リーク + ドリル/分析への導線。`navStore` に reflection フラグ。
- [x] **+2 プリフロップシナリオ**: `sb-vs-btn`(3bet-or-fold)/`btn-vs-co`(3bet+coldcall)。計12スポット。approximate(R26)。
- **Phase 6 送り**: **ポストフロップドリル(R23)** はソルバー解ベースの async 統合が必要なため専用作業。**IndexedDB 恒久移行(R25)** は localStorage(履歴上限50)で実用充足のため Phase 6(R18 と同枠)。**B2 ベットライン**も Phase 6。
- 検証: lint0 / build成功 / **124テスト**(equity4 + drill5 追加)。

## 目標

100ハンド後にセッション振り返り表示。プリフロップドリル実装。IndexedDB永続化。プリフロップシナリオ2件追加 (ポジション付き対レイズ対応)。

## 実装ファイル一覧

### 新規作成 (5ファイル)

| ファイル | 役割 |
|---------|------|
| `src/components/reflection/ReflectionModal.tsx` | セッション振り返りモーダル |
| `src/components/drill/DrillPanel.tsx` | プリフロップ範囲クイズ |
| `src/components/drill/DrillQuestion.tsx` | 1問分の表示 + 正誤フィードバック |
| `src/lib/db.ts` | IndexedDB操作 (idb ライブラリラッパー) |
| `src/workers/equity.worker.ts` | Web Worker: モンテカルロエクイティ計算 |

### 変更 (4ファイル)

| ファイル | 変更内容 |
|---------|---------|
| `src/stores/sessionStore.ts` | IndexedDB永続化追加 |
| `src/stores/progressStore.ts` | IndexedDB永続化追加 (localStorage → idb) |
| `src/pages/LearnPage.tsx` | ドリルタブ追加 + 100ハンドトリガー |
| `src/data/ranges/preflop.ts` | `sb-vs-btn` (3bet-or-fold) + `btn-vs-co` (cold-call/3bet) を追加。※UTG/MP open + BB vs UTG/MP/CO は Phase 4 で追加済み |

## IndexedDB スキーマ (idb)

```typescript
interface PokerGTODB {
  handHistory: {
    key: string
    value: { handId: string; actions: ActionRecord[]; results: ShowdownResult[]; timestamp: number }
    indexes: { 'by-timestamp': number }
  }
  progress: {
    key: 'singleton'
    value: PlayerProgress
  }
  weeklySnapshots: {
    key: number
    value: WeeklySnapshot
  }
}
```

## リフレクションモーダル トリガー

```typescript
// トリガー条件 (OR):
// 1. 100ハンドごと (sessionHandCount > 0 && sessionHandCount % 100 === 0)
//    ※ > 0 ガード必須。0ハンド時に発火させない
// 2. SettingsPage で "セッション終了" ボタン押下 (≥20ハンド)
```

## DrillPanel — プリフロップ + ポストフロップクイズ

```typescript
// プリフロップ:
//   ⚠️ スーツではなくカテゴリ (KJs / KJo) を表示すること
//   設問例: "BTN Open: KJs → Raise / Fold?"
// ポストフロップ (ソルバー解ベース):
//   設問例: "BB vs BTN, flop K72r, あなた KQ: Check / Bet 33% / Bet 75%?"
//   出題は事前計算ライブラリのスポットから生成 (即時·正解にEVあり)
// 共通の正解判定: NodeSolution.strategy[handKey] で frequency≥0.10 の行動 = 正解
//   準正解判定: evLoss ≤ T_INACCURACY(0.5BB) も「おしい(正解扱いだが最良提示)」
// XP報酬: 正解 +5XP, 誤答 +2XP。誤答時は EV損失 + 最良アクション + 理由を提示
// 弱点カテゴリ (AnalysisPage) でフィルタ出題 → Theory↔Practice ループに接続
```

## Web Worker (モンテカルロ)

```typescript
// 入力: { holeCards: Card[], boardCards: Card[], opponentRanges: string[][], iterations: number }
//   opponentRanges: 各アクティブ相手の「想定レンジ」(ハンドカテゴリ配列)。
//                   ランダム2枚ではなくレンジ指定でシミュレートする。
// 出力: { equity: number }  (10,000 回シミュレーション)
// Vite Worker import: import EquityWorker from './workers/equity.worker?worker'
```

### 相手レンジの決定 (エクイティ計算の前提)
"vs ランダム2枚" は無意味なので、相手の**プリフロップアクションと整合するレンジ**を使う:
- 相手がオープンレイザー → そのポジションの `PREFLOP_SCENARIOS` open レンジ (raise頻度≥0.5の手)
- 相手がコールのみ → open レンジから 3bet 頻度の高い手を除いた「コールレンジ」
- マルチウェイ → 各相手にレンジを割当てて多人数シミュレート (重い場合は iterations を 5,000 に)
- 該当シナリオ無し (UTG/MP以外の未定義スポット等) → エクイティ表示を**出さない**
  (Fish AI は raise-or-fold + データ駆動抽選のため、ほとんどのスポットでレンジが定まる)

## エクイティ表示の位置 (重要)

`equity.worker.ts` で計算したエクイティを以下の3箇所に表示:

| 表示場所 | 内容 | 表示条件 |
|---------|------|---------|
| GamePage の HintPanel | "あなたのハンドのvs相手レンジエクイティ: 62%" | studyモード + Hキー押下時 |
| HandResultOverlay | "ショーダウンエクイティ: 62%" | ハンド終了時 (常に) |
| AnalysisPage > ハンド履歴 | 各ハンドのエクイティ列 | UIComplexity.showRangeAdvantage が true (advanced+) |

## C-bet サイジング設計 (ポストフロップ)

Phase 5 では postflop ヒューリスティクス強化。Fish AI と HintPanel に以下を実装:

### Fish AI の C-bet サイズ分布
```typescript
// AggressorがCbetする場合のサイズ (ボードテクスチャ別)
// Dry board (例: K72 rainbow):   33% pot 70%, 50% pot 30%
// Wet board (例: T98 two-tone):  50% pot 50%, 75% pot 50%
// Monotone:                       75% pot 60%, 100% pot 40%
```

### ヒーロー用プリセット
ポストフロップ ActionPanel のプリセット:
```
[ Bet ▼ ]
  プリセット: [33%] [50%] [66%] [75%] [Pot] [Overbet 150%]
```

プリフロップとは異なるプリセット (BB単位ではなくポット%)。
ActionPanel は street で動的に切り替え。

### CoachAgent のサイジング判定 (ソルバー解ベース)
Coach のポストフロップ評価は **`NodeSolution` の EV損失**で行う (Phase 4 の `evaluateAction`)。
サイズ選択も解の `ActionSolution.sizeBB` と頻度で評価するため、下記ヒューリスティクスは
**ソルバー未カバースポット (`source: 'approximate'`) のフォールバック専用**:
```typescript
// heuristic: not GTO-exact (未カバー時のみ。EV数値は出さず参考バッジ)
// IPでC-bet: 33-50%が標準 (dry board は小さく、wet board は大きく)
// OOPでC-bet: より大きめ (50-75%)
// オーバーベット: ポット以上は限定的な状況のみ (ナッツに近いハンド + 極端なレンジ優位)
```
※ Fish AI の C-bet サイズ分布は「フィッシュらしさ」演出なので heuristic のままでよい (相手の挙動であり評価基準ではない)。

## 公開準備レビュー対応 — [RELEASE_READINESS.md](RELEASE_READINESS.md)
- [ ] **R8 エクイティ計算**: Monte Carlo worker で自分の実エクイティを算出し、A2 の「必要勝率」と並べて表示(現状は必要勝率のみで片手落ち)。
- [ ] **R2(一部) プリフロップ追加シナリオ**: SB vs BTN(3betかfold)、BTN vs CO(coldcallか3bet)を追加(本フェーズ既定スコープ)。残りは Phase 6。
- [ ] **R1(一部) ポストフロップドリル**: Phase 3.5 のソルバー解ベースでポストフロップのドリル/評価を提供(本フェーズ既定スコープ)。
- [ ] **R5(恒久) 永続化の IndexedDB 移行**: Phase 4.6 の localStorage 暫定から idb へ移行(本フェーズ既定スコープ)。

## UI改善(参考: GTO Wizard) — `docs/DESIGN.md` バックログより

- [ ] **B2 アクション履歴 / ベットライン**: ハンド内のアクション列(`UTG raise → MP call → …`)を表示。ハンド履歴/リプレイヤー基盤と合流させる(現状は各席の直近アクションのみ)。

## 検証方法

1. 100ハンドプレイ → リフレクションモーダル自動表示
2. ドリルで問題に答える → XP加算確認
3. ブラウザ再起動後も進捗が保持されている (IndexedDB確認)
4. DevTools > Application > IndexedDB で `poker-gto` DBを確認
5. ハンド内のアクション列(ベットライン)が表示・リプレイできることを確認
