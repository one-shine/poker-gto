# Phase 4: コーチ + ミス分析 + 用語システム

> 親計画: [../IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)

## 進捗 (2026-05 更新)

- [x] 型 `MistakeSeverity` / `MistakeRecord` (types/stats.ts)
- [x] プリフロップシナリオ5件追加 (utg-open, mp-open, bb-vs-utg, bb-vs-mp, bb-vs-co)
- [x] `CoachAgent.ts` — matchScenario(resolveSpotKey流用) + evaluateAction(EV損失/ミックス閾値/severity, approximateは頻度ベース) + bus配線。単体6 + 統合3テスト
- [x] `sessionStore` (精度=正解/評価数, ミス記録, ヒント除外) + `progressStore` (XP/レベル/UIComplexity, localStorage)
- [x] `gameStore` に CoachAgent 配線 + FEEDBACK_READY→session/progress(XP・精度・ミス)橋渡し
- [x] `CoachPanel` + `StrategyBars` — 重大度バッジ(◆▲●色+形状)+ 理由文 + 頻度バー + EV。study=correct以外/play=critical。実機確認済(◆ブランダー表示)
- [x] A1 常時ストラテジー(`LiveStrategyPanel`, study常時表示・markHintedで精度除外) / A2 ポットオッズ・必要勝率(showPotOdds時) / play critical トースト(`CoachToast`)。HintPanel は LiveStrategyPanel に置換・削除。実機確認(A1/A2表示・playは戦略非表示)
- [x] `GTOPlayerAgent` (trainerモード) — NodeSolution頻度サンプリング(sampleStrategyAction)+ 有効アクション写像(mapToValid)+ 未カバーは fishHeuristic フォールバック。ヒューリスティクスを `fishHeuristic.ts` に抽出し AIPlayerAgent と共有。gameStoreがopponentModeで配置。実機(trainer)確認・6テスト
- [x] `SettingsPage`(appMode/opponentMode/stackBB/autoAdvance/オンボード再表示/進捗リセット、game-affecting変更で resetGame)、`SampleSizeBadge`(N<20 ⚠)、`LearnPage`(XPバー+レベル+GTO精度+ミス傾向TOP3 / ハンド履歴タブ)、`HandReplay`(ストリート別+ポジション付きステップ実行)。App routing(learn/settings)。`ActionRecord.actorPosition` 追加。実機全確認・スモークテスト追加
- [x] **コンポーネント分割の是正 (2026-05-24)**: 当初 `CoachPanel`/`GamePage` に畳み込んでいた仕様3ファイルを正規化:
  - `MistakeCard.tsx`(ミス専用)/ `MomentLesson.tsx`(正解・ミックスの学習機会。ミックス時に「なぜ複数が正解か」の教育補足を追加)へ分割。`CoachPanel` は枠/自動再開/「次へ」のみ担うディスパッチャに。共有の戦略+信頼度バッジは `StrategyDetail.tsx`、枠色は `feedbackFrame.ts` に抽出。
  - `HandResultOverlay.tsx` を新設し `GamePage` のインライン勝者表示を置換。
  - 簡略化の明示: フィードバックは **1ハンド1件のシンプルモデル**(doc記載の「最大3件/優先度 MistakeCard>MomentLesson>TermOfSession」の多カード方式は未採用)。**TermOfSession(用語カード)は Phase 4.5(用語集)へ送り**、現状未実装。
- ✅ **Phase 4 完了**: 全112テスト通過・lint 0・build成功・study/play/trainer 実機確認済。仕様の新規ファイルは全12件実在(分割是正済)。

## 目標

GTOから外れた判断でコーチフィードバック表示。LearnPage完成。**実EV損失(BB)でプリフロップ/ポストフロップを評価**。

**前提**: 評価は Phase 3.5 の `getSolution()` が返す `NodeSolution` (実ソルバー解) を基準にする。
固定チャート突合ではなく **EV損失 = max(ev) − ev(選択)** を一次信号とする (GTO Wizard / Snowie 同様)。

**前倒し**: 最頻出プリフロップシナリオ5件 (UTG/MP open + BB vs UTG/MP/CO) の解を追加。
**`gto_ai` 対戦相手を実装** (trainer モード) — `NodeSolution` を頻度サンプリングして打つ。

**Phase 4 開始前に shadcn/ui を一括セットアップ:**
```bash
npx shadcn@latest add slider tabs dialog badge sonner
```
※ shadcn の `toast` は廃止され `sonner` に統合済み。トースト通知は `sonner` を使う。

## 既存型定義の活用

`types/stats.ts` の `MistakeCategory`, `PlayerStats`, `PlayerProgress`, `UIComplexity`, `XP_THRESHOLDS` を直接利用。
`types/memory.ts` の `ShortTermMemory`, `LongTermMemory`, `ReflectionReport` を直接利用。
`types/solver.ts` の `NodeSolution`, `ActionSolution`, `evLoss()`, `SpotKey` を直接利用 (Phase 3.5)。

## 実装ファイル一覧

### 新規作成 (12ファイル)

| ファイル | 役割 |
|---------|------|
| `src/engine/agents/CoachAgent.ts` | EV損失判定・ミス記録・フィードバック発行 (getSolution駆動) |
| `src/engine/agents/GTOPlayerAgent.ts` | trainerモードの対戦相手。NodeSolutionを頻度サンプリングして打つ |
| `src/stores/sessionStore.ts` | セッション統計 (ShortTermMemory) + ミス記録 + ハンド履歴詳細 |
| `src/stores/progressStore.ts` | XP・レベル・長期統計 (PlayerProgress) |
| `src/components/coach/CoachPanel.tsx` | study mode: スライドイン フィードバックパネル |
| `src/components/coach/MistakeCard.tsx` | 重大度ラベル付きフィードバックカード |
| `src/components/coach/MomentLesson.tsx` | GTOティーチングモーメントカード (ミックス戦略含む) |
| `src/components/game/HandResultOverlay.tsx` | ハンド終了オーバーレイ (結果 + フィードバック) |
| `src/components/history/HandReplay.tsx` | ストリート別ステップ実行リプレイ |
| `src/components/stats/SampleSizeBadge.tsx` | N表示と信頼度バッジ (N<20 で警告) |
| `src/pages/LearnPage.tsx` | ダッシュボード + ドリル + ハンド履歴(タブ) + ポジション(タブ) |
| `src/pages/SettingsPage.tsx` | appMode, stackBB, autoAdvanceSeconds, オンボード再表示 |

### 変更 (3ファイル)

| ファイル | 変更内容 |
|---------|---------|
| `src/stores/gameStore.ts` | CoachAgent 初期化を initGame() に追加 |
| `src/App.tsx` | LearnPage, SettingsPage へのルーティング追加 |
| `src/stores/settingsStore.ts` | appMode ('play'/'study') のロジック追加 |
| `src/data/ranges/preflop.ts` | 最頻出シナリオ5件追加: `utg-open`, `mp-open`, `bb-vs-utg`, `bb-vs-mp`, `bb-vs-co` |

## CoachAgent 設計

```typescript
// src/engine/agents/CoachAgent.ts
class CoachAgent {
  constructor(bus: AgentBus, heroId: string, allowLiveSolve: boolean)
  // 購読: PLAYER_ACTION (heroのみ), HAND_COMPLETE
  // 発行: FEEDBACK_READY, MISTAKE_RECORDED
  //
  // フロー (各ヒーローアクション):
  //   1. resolveSpotKey(state, heroId) → SpotKey | null  (下記マッチング)
  //   2. getSolution(spotKey, { allowLiveSolve }) → NodeSolution | null
  //   3. null なら スキップ (フィードバックなし)
  //   4. evaluateAction(node, handKey, action, sizeBB) → EvaluationResult
  //   5. FEEDBACK_READY / MISTAKE_RECORDED を発行
  // allowLiveSolve = (settings.appMode==='study'). play/trainer は precomputed のみで即応。
}
```

### スポット解決ロジック (resolveSpotKey)

プリフロップは下記でシナリオIDを決め `SpotKey` を組む。ポストフロップは「基底プリフロップspotId +
street + board」で `SpotKey` を組み、`getSolution` が事前計算 or live solve で `NodeSolution` を返す。

**HU前提**: シナリオは「ヒーロー以外のプレイヤーが1人のみアクティブ」状況でのみ有効。
マルチウェイ (アクティブ3人以上) の場合は null を返す (CLAUDE.md準拠)。

```typescript
function matchScenario(state: GameState, heroId: string): RangeScenario | null {
  const hero = state.players.find(p => p.id === heroId)!
  const heroPos = hero.position
  const prevActions = state.actionHistory.filter(a => a.street === 'preflop')
  const hasRaiseBefore = prevActions.some(a => a.action === 'raise' && a.playerId !== heroId)
  // リンプ = 未オープン状況での call。Fish は raise-or-fold だが、人間/将来AI/SBコンプリート
  // 等でリンプが混ざる可能性があるため安全網として検出する。
  const hasLimpBefore = !hasRaiseBefore &&
    prevActions.some(a => a.action === 'call' && a.playerId !== heroId)

  // ヒーローが行動する時点でのアクティブプレイヤー数を計算
  // (フォールドしていない and ヒーローを除く)
  const activeOpponents = state.players.filter(
    p => p.id !== heroId && !p.isFolded,
  ).length
  // HU前提でないシナリオ評価は誤った教育を生むのでスキップ
  if (activeOpponents > 1 && hasRaiseBefore) return null

  if (!hasRaiseBefore) {
    // リンパーがいる = RFI(folded-around)前提が崩れる → スキップ (誤判定回避)
    if (hasLimpBefore) return null
    if (heroPos === 'UTG') return PREFLOP_SCENARIOS.find(s => s.id === 'utg-open')!
    if (heroPos === 'MP')  return PREFLOP_SCENARIOS.find(s => s.id === 'mp-open')!
    if (heroPos === 'CO')  return PREFLOP_SCENARIOS.find(s => s.id === 'co-open')!
    if (heroPos === 'BTN') return PREFLOP_SCENARIOS.find(s => s.id === 'btn-open')!
    if (heroPos === 'SB')  return PREFLOP_SCENARIOS.find(s => s.id === 'sb-open')!
    return null
  }

  if (heroPos === 'BB' && hasRaiseBefore) {
    // 単独レイザーへのディフェンスのみ対応 (3bet/スクイーズはスキップ)
    const raises = prevActions.filter(a => a.action === 'raise')
    if (raises.length !== 1) return null
    const raiserPos = state.players.find(p => p.id === raises[0].playerId)?.position
    const byRaiser: Record<string, string> = {
      UTG: 'bb-vs-utg', MP: 'bb-vs-mp', CO: 'bb-vs-co',
      BTN: 'bb-vs-btn', SB: 'bb-vs-sb',
    }
    const id = raiserPos ? byRaiser[raiserPos] : undefined
    return id ? PREFLOP_SCENARIOS.find(s => s.id === id)! : null
  }

  return null  // 3bet/4betシナリオ等: データなし → スキップ
}
```

### レイズサイズ不一致の妥協ルール

シナリオは固定サイズ前提 (BTN 2.5x, SB 3x 等)。ユーザー/AIが異なるサイズでレイズした場合:
- **シナリオマッチング自体はサイズに関係なく成立**させる (実装簡略化)
- ただし、ヒーローのレイズサイズが標準から ±50% 以上ずれている場合は
  `preflop_sizing` ミスとしてフィードバック (例: BTN open で 5BB は too large)
- 正確な「サイズ別レンジ」は将来課題

### EV損失判定ロジック (ソルバー解ベース·プリフロップ/ポストフロップ共通)

固定チャート分岐は廃止。`NodeSolution.strategy[handKey]` の `ActionSolution[]` に対し
**EV損失で評価する単一ロジック**にした (プリフロップ/ポストフロップ共通)。

```typescript
import { evLoss } from '../../types/solver'

type EvaluationResult =
  | { kind: 'correct'; evLoss: 0 }
  | { kind: 'mixed_strategy'; chosen: ActionSolution; alts: ActionSolution[] }
  | { kind: 'mistake'; category: MistakeCategory; severity: MistakeSeverity; evLoss: number }

const MIXED_THRESHOLD = 0.10       // 頻度10%以上は正解扱い
const T_INACCURACY = 0.5           // BB。settingsで調整可
const T_MISTAKE = 2.0              // BB

function evaluateAction(
  node: NodeSolution,
  handKey: string,
  action: PlayerAction,
  sizeBB?: number,
): EvaluationResult | null {
  const sols = node.strategy[handKey]
  if (!sols || sols.length === 0) return null   // 解にこのハンドが無い → スキップ

  const chosen = pickClosest(sols, action, sizeBB) // action一致、raiseはサイズ最近傍
  if (!chosen) {
    // 解に存在しないアクション(例: 解がfoldを含まない手をfold) → 最良との差で評価
    const worst = Math.min(...sols.map(s => s.ev))
    const loss = Math.max(...sols.map(s => s.ev)) - worst
    return { kind: 'mistake', category: categoryFor(node, action), severity: severityOf(loss), evLoss: +loss.toFixed(2) }
  }

  // ミックス戦略の許容内 = 正解 (頻度10%以上)
  if (chosen.frequency >= MIXED_THRESHOLD) {
    const alts = sols.filter(s => s !== chosen && s.frequency >= MIXED_THRESHOLD)
    return alts.length > 0
      ? { kind: 'mixed_strategy', chosen, alts }
      : { kind: 'correct', evLoss: 0 }
  }

  const loss = evLoss(sols, chosen)
  if (loss <= 0) return { kind: 'correct', evLoss: 0 }
  return { kind: 'mistake', category: categoryFor(node, action), severity: severityOf(loss), evLoss: loss }
}

// EV損失 → Snowie流3段階 (既存 MistakeSeverity にマッピング)
function severityOf(evLoss: number): MistakeSeverity {
  if (evLoss > T_MISTAKE) return 'critical'    // blunder
  if (evLoss > T_INACCURACY) return 'major'    // mistake
  return 'minor'                               // inaccuracy
}
```

- `categoryFor(node, action)` は `street` / position / action から `MistakeCategory` を導く
  (プリフロップ: too_tight/too_wide/passive/sizing、ポストフロップ: missed_cbet_ip/oop_donk_bet 等)。
  **カテゴリは「弱点集計のラベル」用途**で、重大度判定には使わない (重大度は evLoss が決める)
- `source: 'approximate'` の node では evLoss を信頼せず、カテゴリ+理由文のみ提示 (数値非表示)
- ポストフロップで `getSolution` が null (未カバー·求解失敗) ならスキップ。study modeでは
  「このスポットを解く」ボタンで live solve を促す

### ミックス戦略の UI 表示

ミックス戦略の手では「ミス」ではなく**学習機会**として表示:

```
💡 ミックス戦略
JJ は BB vs BTN で:
  3-bet  40%
  call   60%
あなたの選択 (call) は正解です。
レベルが上がると両方を使い分ける必要があります。
```

XP: ミックス戦略の手は `+10 XP` (どちらでも正解扱い)。

### EV損失表示 — 数値 + Snowie流ラベル

ソルバーEVに基づくため **EV損失(BB)を数値表示する**。重大度は `severityOf(evLoss)` で決まる。

```
// 表示 (source が solver_* のとき):
// critical(blunder)   → 🔴 ◆ "-3.2BB  AAをBTNからフォールド。100%レイズが最大EV"
// major(mistake)      → 🟠 ▲ "-1.1BB  KJoはここではフォールド推奨"
// minor(inaccuracy)   → 🟡 ● "-0.3BB  ミックス: レイズ70%/コール30%。許容内"
// ※ 色だけに依存しない (◆▲● 形状を併記、CLAUDE.md ルール5)

// source が approximate のとき: EV数値は出さず「参考(GTO非準拠)」バッジ + 理由文のみ

// play/trainer mode: critical のみトースト (sonner)
// study mode: major 以上で CoachPanel スライドイン
```

**Coach フィードバックは「EV損失 + 理由文」を必ず併記**:
- 悪い例: "preflop_too_tight"
- 良い例: "-1.8BB。KJsはBTN openで100%レイズが最大EVです。ポジションと高エクイティを活かせます。"

### XP報酬体系 (EV損失ベース)

```typescript
// 正解 (evLoss≈0 / ミックス許容内): +10 XP
// inaccuracy (minor): +5 XP
// mistake (major):    +2 XP (参加ボーナス)
// blunder (critical): +1 XP
// 解未供給 (getSolution=null): XP付与なし (評価していないため)
// ハンド完了 (勝敗問わず): +5 XP   ※結果ではなく判断にXPを与える方針
// ドリル正解: +5 XP、誤答: +2 XP
// ヒント参照ハンド: XP満額だが GTO精度の統計サンプルからは除外 (docs/PHASE_3.md)
```

## GTOPlayerAgent 設計 (trainerモードの相手)

GTO Wizard 流の「GTO相手にプレイ」を実現する。`fish_ai` と差し替え可能。

```typescript
// src/engine/agents/GTOPlayerAgent.ts
class GTOPlayerAgent {
  constructor(bus, playerId, getSolutionSync, schedule?)
  // ACTION_REQUIRED → resolveSpotKey(自分視点) → getSolutionSync(precomputed優先)
  //   命中: strategy[handKey] を frequency で重み付け抽選してアクション
  //   非命中(未カバー/解なし): AIPlayerAgent と同じ heuristic にフォールバック
  // ※ リアルタイム性のため live solve は使わない (precomputed/メモリ常駐のみ)
  // ※ schedule は AIPlayerAgent と同じ注入式 (gto_ai は 300-800ms でやや思考的に)
}
```

- `gameStore` が `settings.appMode` (trainer/exploit) に応じて席に配置する Agent を選ぶ
- `gto_ai` が打った実アクションは sessionStore に通常通り記録 (相手レンジ推定にも使える)

## sessionStore 設計

```typescript
interface SessionStore {
  handHistory: ActionRecord[][]
  mistakesThisSession: MistakeRecord[]
  currentStats: Partial<PlayerStats>
  sessionHandCount: number

  recordAction(record: ActionRecord): void
  recordMistake(category: MistakeCategory, evLoss: number): void
  computeStats(): PlayerStats
  clearSession(): void
}
```

## progressStore 設計

```typescript
// Zustand + localStorage 永続化 (Phase 5でidbへ移行)
interface ProgressStore {
  progress: PlayerProgress
  uiComplexity: UIComplexity

  addXP(amount: number): void
  recordMistake(category: MistakeCategory): void
  getUIComplexity(): UIComplexity
}

function computeUIComplexity(level: SkillLevel): UIComplexity {
  return {
    showPotOdds:        level !== 'beginner',
    showBoardAnalysis:  level !== 'beginner',
    showRangeAdvantage: level === 'advanced' || level === 'pro',
    showMixedStrategies: level === 'pro',
  }
}
```

## LearnPage 構成

```
LearnPage
  ├── [ダッシュボード] XPバー, GTO精度%, ミス傾向TOP3, 各統計にSampleSizeBadge
  ├── [ハンド履歴 tab] 直近20ハンドのリスト + クリックで HandReplay 開く
  └── [ポジション tab] PositionStatsTable (Phase 4.5で AnalysisPage に移動)
```

### HandReplay.tsx 設計

```
┌────────────────────────────────────────┐
│ Hand #142  (BB vs BTN)                 │
├────────────────────────────────────────┤
│  [ Preflop ] [ Flop ] [ Turn ] [ Riv ] │  ← ストリート選択タブ
│  ──────────────                        │
│  Pot: 1.5BB                            │
│  Board: -                              │
│  Hero: K♠Q♥ (BB)                       │
│                                        │
│  BTN raises 2.5BB                      │
│  Hero calls 1.5BB                      │
│                                        │
│  [ ⏮ 前へ ]  [ ⏯ ステップ実行 ]  [ ⏭ ]  │
│                                        │
│  💬 このスポットのGTO推奨:              │
│     KQs は 80% call / 20% 3bet         │
└────────────────────────────────────────┘
```

- ストリート別タブで切り替え
- ステップ実行ボタンで1アクションずつ進める
- 各時点で「もし別の選択をしたら?」のWhat-Ifボタン (将来課題)

### SampleSizeBadge.tsx

統計値表示時に必ず付ける小さなバッジ:
```
GTO精度: 78% [N=156 ✓]   ← 信頼できる (N≥20)
GTO精度: 60% [N=8 ⚠]     ← サンプル不足
```
- `N < MIN_SAMPLE_SIZE (20)` → 黄色 ⚠ アイコン + 「データ不足」ツールチップ
- `N ≥ 20` → 緑 ✓ アイコン

## UI改善(参考: GTO Wizard / Snowie) — `docs/DESIGN.md` バックログより

本フェーズで取り込む UI 項目(詳細は `docs/DESIGN.md`「UI改善バックログ」):
- [ ] **A1 常時ストラテジー表示**: study モードでアクション直下に各手の GTO頻度バー + EV を常時表示(`NodeSolution.strategy` 流用)。HintPanel の隠れた表示を、学習の主役として前面化。
- [ ] **A2 ポットオッズ / エクイティ / 必要勝率**: `UIComplexity.showPotOdds`(intermediate+)で開示。コール判断の学習補助。
- [ ] **A3 EV損失フィードバック**: アクション後に `evLoss(BB)` を即提示(Snowie/Wizard 流)。CoachPanel と統合。
- [ ] **B7 有効スタック(effective stack)表示**: ヒーロー vs 相手のエフェクティブを明示。

## 検証方法

1. `npm run type-check` — 型エラーなし
2. `npm run test` — 19テスト継続通過
3. Playwright: study modeでGTOミス → CoachPanel表示確認
4. XP加算・レベルアップが正常動作することを確認
5. study モードで常時ストラテジー(頻度+EV)・ポットオッズが表示されることを確認
