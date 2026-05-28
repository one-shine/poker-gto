# ポーカーGTO学習アプリ — Claude Code 規約

## プロジェクト概要

PokerSnowie / GTO Wizard ライクなローカル動作のポーカーGTO学習アプリ。React 19 + TypeScript + Vite SPA。UIは日本語。

## コマンド

```bash
npm run dev        # 開発サーバー起動 (http://localhost:5173)
npm run build      # プロダクションビルド
npm run test       # Vitestテスト実行 (全テスト)
npm run type-check # 型チェックのみ (tsc --noEmit)
```

`package.json` に `type-check` スクリプトがない場合は `npx tsc --noEmit` を使う。

## 技術スタック

| 用途 | ライブラリ |
|------|-----------|
| UI | React 19 + Vite 8 |
| 型 | TypeScript 5.8 (strict) |
| スタイル | Tailwind CSS 4 + shadcn/ui (ダークモードデフォルト) |
| アニメーション | Framer Motion 12 |
| 状態管理 | Zustand 5 |
| 重計算 | Web Workers: モンテカルロ(エクイティ) + WASM CFR ソルバー(postflop-solver) |
| 永続化 | IndexedDB via `idb` |
| テスト | Vitest + Testing Library |

## 設計上の絶対ルール

### 1. GTO精度の正直な表示 (最重要)

Phase 3.5 で**本物のソルバー解**を供給する (`src/lib/solver/getSolution()` → `NodeSolution`)。
表示は解の `source` に厳密に従う:
- `solver_precomputed` → "**GTOソルバー解**" (事前計算·信頼度最高)
- `solver_live` → "GTOソルバー解 (ローカル求解·簡易アブストラクション)"
- `approximate` → "GTO近似レンジ (一般理論ベースの手作り)" / ポストフロップは "参考: GTO非準拠(ヒューリスティクス)"
- **未取込/未カバースポットのみ** `approximate`。"GTO最適" という断定表現は使わない
- `source` 種別をコード(`NodeSolution.source`)とUIの両方に必ず明示する

### 2. GTO精度の計算ルール

- `MIXED_STRATEGY_THRESHOLD = 0.10` — 10%以上の頻度があれば正解 (ミックス戦略対応)
- `MIN_SAMPLE_SIZE = 20` — 未満のシナリオは AnalysisPage で "データ不足" バッジを表示

### 3. IP/OOP判定はシートインデックスで行う

フォールドしたプレイヤーを除外したアクティブプレイヤーのシートで判定。ポストフロップで最後に行動できる = IP。`PositionManager.ts` の `isHeroIP()` を使う。ポジション名では判定しない。

### 4. マルチウェイポットのGTO精度を除外

3人以上のハンドはGTO精度計算から除外し、UIに「マルチウェイでは参考値」と表示。

### 5. アクセシビリティ

赤/緑だけに依存しない。形状・アイコンを色と必ず併用する (カラーブラインド対応)。

## ページ構成 (6ページ固定)

```
GamePage.tsx      ← ライブポーカーテーブル
LearnPage.tsx     ← ダッシュボード + ドリル + ハンド履歴(タブ) + ポジション(タブ)
AnalysisPage.tsx  ← 弱点/得意分析 + ポジション統計(タブ)
TheoryPage.tsx    ← 戦略理論ライブラリ + 用語集(タブ)
RangesPage.tsx    ← 全GTOレンジ閲覧
SettingsPage.tsx  ← ゲーム設定
```

HistoryPage / PositionPage / GlossaryPage は独立ページとして作らない (タブに統合済み)。

## アーキテクチャ

### エージェントバス通信

```
AgentBus (typed EventEmitter)
  ├── DealerAgent    発行: HAND_START, STREET_DEALT, ACTION_REQUIRED, HAND_COMPLETE
  │                  購読: PLAYER_ACTION, NEW_HAND_REQUEST
  ├── AIPlayerAgent  発行: PLAYER_ACTION (自分のターン)
  │                  購読: ACTION_REQUIRED (自分のplayerIdでフィルタ)
  └── CoachAgent     発行: FEEDBACK_READY, MISTAKE_RECORDED
                     購読: PLAYER_ACTION (ヒーローのみ), HAND_COMPLETE
```

### Zustand ストア構成

```
gameStore.ts      ← ライブゲーム状態 (GameState)
sessionStore.ts   ← セッション統計・ミス記録
progressStore.ts  ← レベル・XP・ミス履歴
settingsStore.ts  ← スタック・appMode・opponentMode(trainer/exploit)・UIComplexity・autoAdvanceSeconds
```

stores間の整合性のため単一rootストアから派生させる設計。`src/engine/` は React 依存なし (純粋 TypeScript のみ)。
ソルバー供給層 `src/lib/solver/` は engine に依存しない (依存方向: engine ← solver ← stores/UI)。

## スキルレベルとXP

| レベル | 必要XP | GTO精度目標 |
|--------|--------|------------|
| beginner | 0 | — |
| intermediate | 500 | 65% |
| advanced | 2000 | 75% |
| pro | 8000 | 85% |

## 実装フェーズ

| Phase | 内容 | 状態 |
|-------|------|------|
| 1 | ゲームエンジン (engine/) | ✅ 完了 (19テスト通過) |
| 2 | GTOレンジデータ + 13x13グリッドUI | ✅ 完了 (5シナリオ + グリッドUI動作確認) |
| 3 | ポーカーテーブルUI + 基本プレイ | 🔄 Step 1完了 (AIPlayerAgent ノーリンプ化) |
| 3.5 | GTOソルバー基盤 (事前計算 + WASM CFR) | 本物のソルバー解を供給。Coach/対戦相手/可視化の土台 |
| 4 | コーチ(実EV損失) + ミス分析 + gto_ai対戦 | EV損失でフィードバック。trainerモード |
| 4.5 | 理論 + 弱点分析 + レンジvsレンジ可視化 | AnalysisPage弱点TOP3 + RangesPageにレンジ優位/エクイティ分布 |
| 5 | 学習 + ポストフロップドリル + リフレクション | 100ハンド後に振り返り。ソルバー解ベースのドリル |
| 6 | ポリッシュ・最適化 + 事前計算ライブラリ拡充 | PWA/COOP-COEP/WASM遅延ロード |

## 実装計画

詳細な全フェーズ計画・進捗チェックリスト・設計上の注意事項は **`docs/IMPLEMENTATION_PLAN.md`** を参照。
セッション開始時は必ず同ファイルの「現在の進捗」セクションを確認してから作業を開始すること。

## コーディング規約

- コメントは「なぜ」が非自明な場合のみ1行で書く。何をしているかは書かない。
- フォールバック専用のヒューリスティクス関数には `// heuristic: not GTO-exact` コメントを必ず入れる (本筋はソルバー解)。
- `src/engine/` のテストはVitest (jsdom不要、Node環境で動く)。
- `HandEvaluator.ts` の変更後は必ず `npx vitest run src/engine/cards/HandEvaluator.test.ts` で確認。
- プリフロップシナリオ: Phase 2で5件、Phase 4で+5件 (UTG/MP open + BB vs UTG/MP/CO)、Phase 5で+2件 (SB vs BTN, BTN vs CO)、Phase 6で残り。Phase 3.5以降は手作りレンジを実ソルバー解(`data/solutions/`)へ順次置換。
