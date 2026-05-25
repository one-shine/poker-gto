# Phase 3: ポーカーテーブルUI + 基本プレイ

> 親計画: [../IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)
> 進捗チェックリストは親計画の「現在の進捗」を参照。

## 目標

**検証目標**: Fish AIと6-maxのフルハンドをブラウザでプレイできる状態

## アーキテクチャ設計

### ゲームループ (React統合)

```
User clicks action
     ↓
submitHeroAction() → bus.emit('PLAYER_ACTION')
     ↓
DealerAgent.handleAction() → 内部処理
     ↓
bus.emit('ACTION_REQUIRED' | 'STREET_DEALT' | 'HAND_COMPLETE')
     ↓
gameStore listeners → set(state) → React re-render

AIPlayerAgent: ACTION_REQUIRED → setTimeout(100-400ms) → PLAYER_ACTION
```

### 状態フロー

```
gameStore.pendingHeroAction != null → ActionPanel 表示
gameStore.gameState.street == 'showdown' → HandResultOverlay 表示
```

## 実装ファイル一覧

### 新規作成 (11ファイル)

| ファイル | 役割 |
|---------|------|
| `src/stores/gameStore.ts` | AgentBusとReactをつなぐ中心ストア |
| `src/stores/settingsStore.ts` | stackBB, appMode, opponentMode, autoAdvanceSeconds, onboardingComplete |
| `src/components/game/PokerTable.tsx` | oval table、6席の絶対配置 |
| `src/components/game/PlayerSeat.tsx` | アバター、スタック、ホールカード |
| `src/components/game/CardDisplay.tsx` | カード1枚のCSS描画 |
| `src/components/game/ActionPanel.tsx` | Fold/Check/Call/Bet/Raise + スライダー + プリセット + ヒント |
| `src/components/game/GameFooter.tsx` | 「100BB / ノーレーク / キャッシュゲーム / ICM非考慮」常時表示 |
| `src/components/game/HintPanel.tsx` | studyモード用: 「GTO推奨を見る」ボタン → レンジ表示 |
| `src/components/onboarding/OnboardingFlow.tsx` | 初回起動チュートリアル (3-5画面、settingsStore.onboardingComplete で判定) |
| `src/components/layout/AppShell.tsx` | サイドバー(desktop) + ボトムタブ(mobile) |
| `src/pages/GamePage.tsx` | PokerTable + ActionPanel + GameFooter の統合 |

### 変更 (2ファイル)

| ファイル | 変更内容 |
|---------|---------|
| `src/engine/agents/AIPlayerAgent.ts` | setTimeout遅延 + ポジション別フォールド率 |
| `src/App.tsx` | ページ切り替え + 初回起動でOnboardingFlow表示 |

## 各ファイル詳細設計

### gameStore.ts (Zustand)

```typescript
interface GameStore {
  gameState: GameState | null
  pendingHeroAction: ActionRequiredPayload | null
  lastHandResults: ShowdownResult[] | null

  // Infrastructure (outside React lifecycle)
  bus: AgentBus
  dealer: DealerAgent | null

  initGame(): void        // バス・AIエージェント・DealerAgent初期化
  startNewHand(): void    // dealer.startNewHand() 呼び出し
  submitHeroAction(action: PlayerAction, amount?: number): void
}
```

設定: Hero は常に seatIndex=0、残り5席は対戦相手 Agent。
`settingsStore.opponentMode` で席に置く Agent を切り替える:
- `'exploit'` (Phase 3 既定): `fish_ai` (リーク持ち。リンプ禁止のレンジ駆動)
- `'trainer'` (Phase 4 で有効化): `gto_ai` (`GTOPlayerAgent`、ソルバー解を頻度サンプリング)

Phase 3 時点では `gto_ai` 未実装のため UI で trainer は「Phase 4 で解放」と表示し選択不可。

### AIPlayerAgent.ts 変更点 ✅ 実装済み

タイミングは**注入式スケジューラ**にした (エンジンは同期・決定的を保ち、テストが壊れない)。
UI 側 (gameStore) が `fishDelayScheduler` を渡して "間" を演出する。

```typescript
// engine/agents/AIPlayerAgent.ts (抜粋)
export type ActionScheduler = (emit: () => void) => void
export const fishDelayScheduler: ActionScheduler =
  emit => setTimeout(emit, 100 + Math.random() * 300)
// constructor 第3引数。デフォルトは同期 (テスト用)。
new AIPlayerAgent(bus, id, fishDelayScheduler)  // ← gameStore 側
```

**Fish AI のアクション分布を改訂** (現状 fold=0% + 75%リンプは非現実的かつ学習を歪める):

```typescript
// Fish AI アクション分布 (ポジション別)
// ⚠️ プリフロップ未オープン時は raise-or-fold (リンプ禁止)。
//    リンプを許すとオープンレンジ判定 (matchScenario) が成立しなくなるため。
// オープン前 (プリフロップ、誰もレイズ/リンプしていない):
//   UTG: raise 18%, fold 82%
//   MP:  raise 22%, fold 78%
//   CO:  raise 30%, fold 70%
//   BTN: raise 48%, fold 52%
//   SB:  raise 45%, fold 55%   (vs BB、リンプ無しで raise-or-fold)
// レイズ後 (コール or フォールド or 3bet):
//   fold 45%, call 47%, raise(3bet) 8%
// ポストフロップ ("フィッシュらしさ"はここで表現: コール station + たまにスピュー):
//   aggressorに対し: fold 30%, call 55%, raise 15%
//   自分が先頭: check 65%, bet 35%
```

**なぜリンプを禁止するか**: Fish が ~75% リンプすると、ヒーローのほぼ全ハンドがマルチウェイ・リンプポットになり、
`matchScenario()` のオープンレンジ (folded-around RFI 前提) と食い違う。GTO学習にはスポットの清潔さを優先する。
"フィッシュらしさ" はポストフロップのコール過多・たまの暴発で表現する。

各ポジションの raise レンジは `PREFLOP_SCENARIOS` のオープンレンジ (raise頻度≥0.5の手) を流用してよい
(別途ハードコードせず、レンジデータ駆動で抽選すると保守が楽)。

### PokerTable.tsx レイアウト

テーブルは `aspect-[16/9]` の楕円形(CSS border-radius)。
6席の座標 (left%, top% — テーブル内絶対配置):

```
Seat 3(UTG)  Seat 4(MP)   Seat 5(CO)
  12%, 22%   43%, 8%      74%, 22%

Seat 2(BB)                Seat 0(BTN/Hero)
  6%,  62%                 88%, 62%

         Seat 1(SB)
          47%, 82%
```

ボード + ポット: 中央 (44%, 40%)
Dealer Button: 対応シートの隣に表示

### PlayerSeat.tsx

各席が表示する情報:
- ポジション名バッジ (BTN, SB, BB...)
- スタック (XXX BB)
- ホールカード × 2 (AI=裏面、ショーダウン時=表)
- 最後のアクション ("raises 6BB" バッジ、2秒後フェードアウト)
- アクション中インジケーター (自分のターン: リング点滅)

### ActionPanel.tsx

```
[ Fold ]  [ Check / Call X BB ]  [ Bet / Raise ]
  プリセット: [2BB] [2.5BB] [3BB] [Pot] [All-in]
  スライダー: ━━━━●━━━━  X BB  (min-raise ~ all-in)
```

**Bet vs Raise の区別**: ラベルを状況で動的に変える
- 相手がまだベットしていない → **「Bet」**
- 相手のベット/レイズ後 → **「Raise」**

この区別はポーカーの基本用語。初心者に誤った用語を教えないよう必須。

キーボードショートカット (CLAUDE.md準拠): f/c/r + Enter

### CardDisplay.tsx

CSS純粋実装 (画像なし):
- 白背景 / 黒枠カード
- ♠♥♦♣ Unicode記号
- 赤 (hearts/diamonds) / 黒 (spades/clubs)
- 裏面: 濃紺 + パターン

### AppShell.tsx

```
desktop: 左サイドバー (幅56px) + メインコンテンツ
mobile:  下部タブバー + フルスクリーンコンテンツ

タブ: Game | Learn | Analysis | Theory | Ranges | Settings
```

### GameFooter.tsx

GamePage の最下部に常時固定表示する細い注記バー:

```
ⓘ 6-max キャッシュゲーム · 100BB · ノーレーク · ICM非考慮 · GTO近似レンジ
```

クリックで「前提条件の詳細」モーダルを開き、各項目を説明する。

### HintPanel.tsx (studyモード専用)

```
[ ヒント (H) ]  ← ActionPanel の上に小さなボタン
  ↓ 押下
┌─────────────────────────┐
│ KJs @ BTN Open          │
│ Raise: 100%             │
│ Call:    0%             │
│ Fold:    0%             │
│ ┃ ポジションアドバン... │
└─────────────────────────┘
```

- play mode では非表示
- study mode で `H` キー or ボタンクリックで開閉
- アクション前に開くと「ヒントを見たフラグ」を sessionStore に記録するが **XPは減らさない**
  (study モードは学習が目的。ヒント参照を罰すると本来促したい行動を抑制してしまう)
- ヒント参照ハンドは GTO精度の統計サンプルから**除外**する (実力測定の汚染を防ぐ)。XPは満額付与。

### OnboardingFlow.tsx

初回起動時のチュートリアル (`settingsStore.onboardingComplete = false` のとき):

```
1. ようこそ画面
   「6-maxノーリミットホールデムのGTO学習アプリです」
   [ 始める ]
2. ポジション説明 (テーブル図 + 6席の説明)
   「BTN=ボタン、最強のポジション。最後に行動できる」
3. レンジグリッドの読み方 (13×13グリッドの色 + 文字トークンを解説)
   「緑[R]=レイズ、青[C]=コール、ティール[M]=ミックス、グレー=フォールド」
   ※色だけに依存しない (CLAUDE.md ルール5)。各セルに R/C/M の文字も併記する。
4. プレイモードとスタディモードの違い
   「プレイ: フィードバック最小、スタディ: ミスでパネル表示」
5. 始め方
   「Game ページで "New Hand" を押す」
   [ プレイ開始 ]
```

完了したら `settingsStore.onboardingComplete = true` を localStorage に保存。
Settings ページから「再表示」ボタンで再実行可能。

## 実装順序

1. `AIPlayerAgent.ts` — setTimeout + ポジション別フォールド率
2. `gameStore.ts` — bus/dealer/state管理
3. `settingsStore.ts` — 設定 (onboardingComplete 含む)
4. `CardDisplay.tsx` — 単体で視覚確認可能
5. `PlayerSeat.tsx` — CardDisplay使用
6. `PokerTable.tsx` — PlayerSeat配置
7. `ActionPanel.tsx` — Bet/Raise動的切替 + スライダー + プリセット
8. `HintPanel.tsx` — studyモードのヒント表示
9. `GameFooter.tsx` — 前提条件常時表示
10. `GamePage.tsx` — 統合
11. `OnboardingFlow.tsx` — 初回チュートリアル
12. `AppShell.tsx` — ナビゲーション
13. `App.tsx` — ページ切り替え + 初回判定
14. 動作確認 (Playwright)

## 検証方法

1. `npm run type-check` — 型エラーなし
2. `npm run test` — 既存の19テスト継続通過
3. Playwright でブラウザ確認:
   - ゲームページにアクセス → テーブルUI表示
   - "New Hand" ボタン → プリフロップ開始
   - ヒーローのアクションボタン表示確認
   - Fold/Call/Raise できる
   - AIが自動でアクション (遅延あり)
   - ショーダウンまで進行
   - 勝者表示

## 注意事項

- `src/engine/` は React 非依存を維持 (importしない)
- shadcn/ui は Phase 3 では使わず純粋 Tailwind
- sessionStore / progressStore は Phase 3 ではスタブ (空実装)
- CoachAgent は Phase 4 で追加
- ポストフロップのフィードバックは Phase 4
- GamePage のどこかに「100BB / ノーレーク前提」を小さく常時表示すること
- AIのフォールドしたカードは appMode で表示/非表示を制御 (study=表示, play=非表示)
- ActionPanel のボタンラベル: ベット前=「Bet」、ベット後=「Raise」で動的切り替え
