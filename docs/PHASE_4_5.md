# Phase 4.5: 理論ライブラリ + 弱点分析UI

> 親計画: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

## 進捗 (2026-05-24) ✅ 実装完了

- [x] `data/theory/concepts.ts`(17コンセプト・全 MistakeCategory を被覆)+ `data/theory/glossary.ts`(48用語)。
- [x] `pages/TheoryPage.tsx` — 戦略理論(カテゴリ絞り込み + 記事ビュー)+ 用語集(検索)タブ。
- [x] `pages/AnalysisPage.tsx` — 弱点分析(`sessionStore.mistakes` 駆動の TOP3 `WeaknessCard`)+ ポジション統計(`PositionStatsTable`)タブ。
- [x] `components/analysis/WeaknessCard.tsx`(関連理論への導線)/ `PositionStatsTable.tsx`(handHistory+mistakes から VPIP/PFR/推定精度/EV損失、マルチウェイ除外・データ不足バッジ)。
- [x] **C1 レンジのセル内スプリット塗り** — `RangeGrid` を頻度比のスタック塗り(下から R→C→F)に刷新。R/C/M トークン併記維持。
- [x] `components/ranges/RangeVsRange.tsx` + RangesPage「レンジ比較」タブ — 2レンジの幅・構成(ペア/スーテッド/オフスート)をコンボ数基準で比較。
- [x] `stores/navStore.ts` — ページ遷移 + 弱点→理論ディープリンク。`data/mistakeLabels.ts` で CATEGORY_JP を共有(LearnPage と重複解消)。`App.tsx` ルーティング更新。
- [x] **Theory↔Practice ループ**(弱点カード→関連理論記事)を配線・実機確認。検証: lint0 / build成功 / 112テスト / 全ページ実機スクショ確認。
- **Phase 5 送り(R8 依存)**: ボード上の**エクイティ分布カーブ**(`EquityDistribution`)とレンジvsレンジの**エクイティ/ナッツ優位**は Monte Carlo エクイティ計算が前提のため Phase 5。現状は構成比較まで。
- **Phase 5 送り**: ドリル(`/learn/drill?category=`)未実装のため、記事/弱点の「🎯 ドリルで練習」は「近日」表示。多カード優先度フィードバック方式は未採用(1ハンド1件)。C2 レンジメタ情報(ホバー頻度内訳)は未実装。

## 目標

AnalysisPageに弱点TOP3・重点学習ポイント表示。TheoryPage + 用語集tab完成。
**レンジvsレンジ可視化** (GTO Wizard 流: レンジ優位・エクイティ分布) を RangesPage に追加。

## 実装ファイル一覧

### 新規作成 (8ファイル)

| ファイル | 役割 |
|---------|------|
| `src/data/theory/concepts.ts` | 理論コンテンツ静的データ (30+ コンセプト) |
| `src/data/theory/glossary.ts` | 用語集データ (50+ 用語) |
| `src/pages/TheoryPage.tsx` | 戦略理論ライブラリ + 用語集(tab) |
| `src/pages/AnalysisPage.tsx` | 弱点/強み分析 + ポジション統計(tab) |
| `src/components/analysis/WeaknessCard.tsx` | 弱点カード (カテゴリ + 改善ドリルへのリンク) |
| `src/components/analysis/PositionStatsTable.tsx` | ポジション別統計テーブル |
| `src/components/ranges/RangeVsRange.tsx` | 2レンジのレンジ優位/ナッツ優位を並列グリッド+指標で表示 |
| `src/components/ranges/EquityDistribution.tsx` | ボード上のエクイティ分布カーブ (両者レンジ、equity bucket) |

### 変更 (1ファイル)

| ファイル | 変更内容 |
|---------|---------|
| `src/App.tsx` | TheoryPage, AnalysisPage へのルーティング追加 |

## Theory コンテンツ構造

```typescript
interface TheoryConcept {
  id: string
  title: string
  category: 'preflop' | 'postflop' | 'mental' | 'math'
  skillLevel: SkillLevel
  summary: string        // 1-2文
  body: string           // Markdown
  relatedMistakes: MistakeCategory[]
}

interface GlossaryEntry {
  term: string
  definition: string
  relatedTerms: string[]
}
```

## AnalysisPage 構成

```
AnalysisPage
  ├── [弱点分析 tab] 弱点TOP3 WeaknessCard + 改善提案 + 重点学習リンク
  └── [ポジション統計 tab] PositionStatsTable (全6ポジション)
       - VPIP / PFR / 3Bet / GTO精度 / EV損失
       - MIN_SAMPLE_SIZE (20) 未満: "データ不足" バッジ
       - マルチウェイハンド: "参考値" 注記
```

## 弱点分析ロジック

```typescript
function getTop3Weaknesses(progress: PlayerProgress): WeaknessItem[] {
  return Object.entries(progress.mistakesByCategory)
    .filter(([, count]) => count >= MIN_SAMPLE_SIZE / 10)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([category]) => ({
      category: category as MistakeCategory,
      relatedConcepts: concepts.filter(c => c.relatedMistakes.includes(category)),
    }))
}
```

## レンジvsレンジ可視化 (RangesPage 拡張)

GTO Wizard の「解かなくても概念を理解させる」価値を取り込む。`getSolution()` のレンジ + `equity.worker` を使う。

```
RangeVsRange.tsx
  - 入力: 2つのレンジ (例: BTN open レンジ vs BB defend レンジ) + 任意ボード
  - 表示: 各レンジの 13×13 グリッドを左右に + 下記指標
      ・ レンジ全体エクイティ (例: 54% / 46%)
      ・ レンジ優位 (equity) と ナッツ優位 (top of range の比率) を区別して表示
EquityDistribution.tsx
  - 指定ボードで両レンジのエクイティ分布カーブ (equity bucket ヒストグラム)
  - "誰が強い手を多く持つか" を視覚化 → c-bet 戦略の直感を養う
```

- ボード入力時は `equity.worker` (Phase 5) でレンジ×レンジのエクイティを算出
- ソルバー解がある局面では `NodeSolution` の頻度も重ねて表示できる (発展)
- 色のみ依存を避け、グリッドは R/C/M 文字トークン併記 (CLAUDE.md ルール5)

## Theory ↔ Practice 循環UIフロー (重要)

学習が「読んで終わり」「ドリルだけ」にならないよう、双方向リンクを徹底:

```
[AnalysisPage 弱点カード]
    ↓ クリック (関連理論)
[TheoryPage コンセプト記事]
    ↓ 記事下の「このコンセプトをドリルで練習」ボタン
[LearnPage ドリル (該当カテゴリにフィルタ)]
    ↓ ドリル正解/誤答
[フィードバック 「もう一度理論を見る」ボタン]
    → TheoryPage に戻る
```

### 実装ポイント

- `WeaknessCard` に「📚 関連理論を読む」「🎯 ドリルで練習」の2ボタン
- `TheoryConcept` 記事ページに「🎯 このコンセプトのドリル」ボタン (該当 `MistakeCategory` でフィルタ)
- `DrillQuestion` のフィードバックに「📚 関連理論を読む」ボタン
- ルーティング: `/theory/concept/{id}`, `/learn/drill?category={MistakeCategory}` のクエリパラメータで状態を渡す

## UI改善(参考: GTO Wizard) — `docs/DESIGN.md` バックログより

本フェーズで取り込む UI 項目(詳細は `docs/DESIGN.md`「UI改善バックログ」):
- [ ] **C1 レンジのセル内スプリット塗り**: `RangeGrid` の単色セルを、混合戦略の頻度比で分割塗り(例: レイズ60%/コール40% を縦帯で表現)。GTO Wizard の代名詞で、混合戦略の可読性が大きく向上。R/C/M トークンは併用維持。
- [ ] **C2 レンジのメタ情報**: VPIP / コンボ数 / レンジ% を表示、ホバー時に頻度内訳をインライン表示(現状は title 属性のみ)。
- [ ] **C3 レンジ vs レンジ / エクイティ分布**: 本フェーズ既定スコープ(レンジ優位・エクイティ分布)に含む。

## 検証方法

1. 数手プレイ後 AnalysisPage を開く → ポジション統計更新確認
2. ミスを複数回犯す → 弱点TOP3 表示確認
3. 用語集で検索 → フィルタリング動作確認
4. RangeGrid のセルが混合戦略を頻度比のスプリット塗りで表示することを確認
