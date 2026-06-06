# GTO Lab — 説明資料(ソルバー・アピールポイント・開発概要)

> PPT 化を前提にした説明資料。**各 `##` 見出し = 1 スライド**を想定。数値は実測(2026-05-31 時点)。
> 関連: 製品仕様 [`SPEC.md`](SPEC.md) / 利用マニュアル [`USER_GUIDE.md`](USER_GUIDE.md) / 残課題 [`BACKLOG.md`](BACKLOG.md)。

---

## 1. 一言で

**「解の確からしさを、ごまかさずに教えてくれる」ローカル動作のポーカー GTO 学習アプリ。**
6-max ノーリミットホールデムを AI 相手にプレイし、各局面の GTO 推奨・EV 損失・「なぜ」をコーチが解説する。
React 19 + TypeScript の SPA、完全オフライン、アカウント不要、無料。

---

## 2. 課題 — なぜ作ったか

- 既存の GTO 学習ツールは **高価・要クラウド・要アカウント**。学習の敷居が高い。
- 多くのツールは「これが GTO」と**断定**するが、実際には近似・抽象化が混ざる。**どこまで厳密かが見えない**。
- ローカルで動く軽量ツールは、解が**ヒューリスティクスなのに GTO を名乗る**ものが多い。

→ **「正直な信頼度表示」+「完全ローカル」+「学習導線」** を兼ねた学習ツールを自作した。

---

## 3. アピールポイント(差別化)

1. **解の信頼度を 4 段階で正直に表示** — `solver_precomputed`(厳密)/ `solver_live`(ローカル求解)/ `approximate_with_ev`(近似+概算EV)/ `approximate`(近似)。コードと UI の両方に明示。"GTO最適" の断定をしない。← **最大の差別化**
2. **完全ローカル / オフライン / プライバシー** — 全データ端末内(localStorage / IndexedDB)、第三者送信ゼロ(フォントもセルフホスト)、広告・トラッキングなし、無料。アプリ自体はユーザーデータを送信しない(GitHub Pages 公開版でも、ホスト側に通常の Web アクセスログ(IP 等)が残るのみ・HTTPS 強制)。
3. **外部依存ゼロの自前 CFR ソルバー** — Rust/WASM の既製ソルバー(AGPL)を使わず TypeScript で実装。商用配布安全・`SharedArrayBuffer` 非依存でどのブラウザでも動く。
4. **EV 損失ベースのコーチング** — 「-1.8BB のミス」を数値で提示 + ミス分類 + 概念ラベル + 関連理論への deep-link。
5. **学習ループ** — 実戦 → コーチ → 弱点分析 → 理論 → ドリル → 反復、が 1 アプリで完結。
6. **アクセシビリティ & デザイン** — 色のみ非依存(形状/アイコン併用)、44px タップ域、キーボード操作。落ち着いた "Felt & Brass" の分析端末風 UI。

---

## 4. ソルバーの仕組み① — 全体像

- **GTO(ゲーム理論的最適)** = 相手にどう付け込まれても損しない均衡戦略。CFR(Counterfactual Regret Minimization)で近づける。
- **統一窓口** `getSolution(spot) → NodeSolution` がすべての供給元。コーチ・対戦 AI・可視化はここだけを見る。
- `NodeSolution` は **戦略頻度 + 各アクションの EV + 出典(`source`)+ exploitability** を持つ。
- 重い求解は **Web Worker** で非ブロッキング、結果は **IndexedDB に LRU キャッシュ**(2 回目以降は即時)。

```
コーチ / 対戦AI / 可視化  →  getSolution()  →  NodeSolution{ strategy, ev, source, exploitability }
                                   ├─ 事前計算 JSON(push/fold 厳密解)
                                   ├─ ローカル CFR 求解(postflop・Worker)
                                   └─ 近似レンジ + 概算 EV(preflop 100BB)
```

---

## 5. ソルバーの仕組み② — プッシュ/フォールド = 厳密 Nash

- スタック ≤25BB の HU プッシュ/フォールドは **オールイン=ショーダウン勝率が真値**のため、**ポストフロップ近似が不要 → 厳密 GTO** が解ける。
- `pushFold.ts`(カテゴリ別 fictitious play で Nash)+ `preflopEquity.ts`(169 カテゴリ間オールイン勝率を seeded Monte Carlo で構築・再現可能)。
- **5 / 8 / 10 / 12 / 15 / 20 / 25BB の 7 段階**を事前計算(JSON 同梱)。**exploitability 0.0003〜0.0017 BB/hand ≒ Nash**(劣化検知の CI ガードテスト付き)。
- これがアプリ唯一の `solver_precomputed`(信頼度最高)。プッシュ/フォールド・ドリルで実 EV 付きで出題。

---

## 6. ソルバーの仕組み③ — ポストフロップ = 自前 vector CFR

- `riverSolver.ts`: river を **vector CFR(CFR+)** で厳密求解。HandEvaluator で 2 値ショーダウン(カードリムーバル込み)。river は小さく速い。
- `turnSolver.ts` + `chanceCfr.ts`: turn を **完全チャンスノード CFR** で求解 — 「turn ベッティング → チャンス(river 札を**全 48 列挙**)→ river ベッティング → 厳密ショーダウン」の 2 街 CFR。**exploitability 4〜5%**、「賭け考慮済」と表示。
- `flopSolver.ts`: flop の 3 街・2 チャンス層 CFR も実装済み。ただし実レンジでは **exploitability ~13% で頭打ち**(アブストラクションの構造的下限)。
  → **13% を「ソルバー解」と称さない**。flop はエクイティ近似(「簡易: 賭け未考慮」)で**正直に**配給。エンジンはサーバ事前計算/カードアブストラクション導入時の将来用に保持。
- exploitability は best-response で計測し UI に表示(収束度の可視化)。

---

## 7. ソルバーの仕組み④ — プリフロップ 100BB と「正直さ」

- 100BB のオープン/3bet の真 Nash は**全ストリートのゲーム木の求解 = サーバ事前計算級**で、ブラウザ内では不可。
- 現状は **`approximate_with_ev`**(手作り近似レンジ + 概算 EV)。**27 スポット**(オープン/ディフェンス/対3bet)をカバーし、EV 損失を `~` 付きで提示。
- **設計の根幹(正直さ)**: どの局面がどの `source` かを `NodeSolution.source` とUIバッジの両方に必ず出す。フォールバックのヒューリスティクスには `// heuristic: not GTO-exact` を明記。
- 自社生成データのみ同梱(他社ソルバー出力は商用再配布不可のため**同梱禁止**)。

> 結論: 本アプリは「**GTO 学習ツール**」であり「全局面が GTO 品質のアプリ」ではない。**正直な信頼度表示が強み**。

---

## 8. 精度の保証マトリクス

| `source` | 意味 | 対象 | 厳密度 |
|----------|------|------|--------|
| `solver_precomputed` | 同梱の厳密解 | push/fold ≤25BB(7 段階) | ◎ Nash (exploit ≤0.0017) |
| `solver_live` | ブラウザ内 CFR | river=厳密 / turn=賭け考慮(exploit 4–5%) | ○ |
| `solver_live`(簡易) | エクイティ近似 | flop(賭け未考慮) | △ 正直に近似表記 |
| `approximate_with_ev` | 近似 + 概算 EV | preflop 27 スポット | △ |
| `approximate` | 近似(EV なし) | 未取込スポット | △ |

---

## 9. アーキテクチャ

- **エージェントバス**(型付き EventEmitter): Dealer / AIPlayer / Coach が pub/sub で疎結合連携。
- **依存方向を一方向に固定**: `engine`(純 TypeScript・React 非依存)← `solver`(解供給層)← `stores / UI`。コアを単体テスト可能に保つ。
- **重い計算のオフロード**: モンテカルロ(エクイティ)+ CFR ソルバーを Web Worker で実行。
- **6 ページ固定**: ゲーム / 学習 / 分析 / 理論 / レンジ / 設定。
- **PWA**: manifest + Service Worker(フォント・解 JSON をプリキャッシュ)で完全オフライン。

---

## 10. 技術スタック

| 用途 | 採用 |
|------|------|
| UI | React 19 + Vite |
| 型 | TypeScript 5.8(strict) |
| スタイル | Tailwind CSS 4 + shadcn/ui(ダーク既定) |
| アニメーション | Framer Motion 12 |
| 状態管理 | Zustand 5 |
| 重計算 | Web Workers(モンテカルロ + 自前 CFR ソルバー) |
| 永続化 | IndexedDB(`idb`) |
| フォント | @fontsource セルフホスト(OFL) |
| テスト | Vitest + Testing Library |

実行時依存はすべて寛容ライセンス(MIT / ISC)。AGPL の postflop-solver は不採用。

---

## 11. 開発規模(実測・2026-05-31)

| 指標 | 値 |
|------|----|
| 開発期間 | 2026-05-25 〜 05-31(約 1 週間)/ 29 コミット |
| 実装コード | **約 12,600 行**(TypeScript・テスト除く) |
| テストコード | 約 4,215 行 |
| ファイル数 | 157 (.ts/.tsx) — うちテスト 47 |
| UI コンポーネント | 34 / ゲームエンジン 15 / ソルバー 15 モジュール |
| 自動テスト | **338 件**(47 スイート・全緑) |
| 同梱解データ | 解 JSON 41 件(push/fold 14 + プリフロップ EV 等) |
| 学習コンテンツ | 概念 約 25 / 用語 約 56 |
| 配信サイズ | メインバンドル gzip 約 110KB(フォント woff2 約 3.1MB は遅延・別 chunk) |

開発は**フェーズ制(Phase 1〜6)**で進行: エンジン → レンジ/グリッド → テーブル UI → ソルバー基盤 → コーチ/分析 → 学習/ドリル → ポリッシュ/PWA。

---

## 12. 品質保証

- **CI(GitHub Actions)**: push/PR で lint → 型チェック(tsc -b)→ test → `npm audit`(high 以上で失敗)を自動実行。
- **脆弱性 0 件**(寛容ライセンス依存のみ)。
- ソルバーの **exploitability を CI ガードテスト**で監視(push/fold が Nash から劣化したら落ちる)。
- ロジックは UI/LLM 非依存で単体テスト可能(engine は Node 環境で完結)。

---

## 13. 制約と今後

- **スコープ**: 6-max / 100BB 固定 / ノーレーク / ICM 非考慮 / GTO 精度は HU のみ(マルチウェイは参考値)。
- **精度の本丸(R4)**: 100BB の真 Nash 解はサーバ/オフライン事前計算 + カードアブストラクションが前提(別軸の大規模作業)。現状は概算 EV で公開水準。
- **配布**: **PWA 一本化**で GitHub Pages に**公開済み** → <https://one-shine.github.io/poker-gto/>(URL を知る人がアクセス可・`noindex` で検索除外)。Mac/Win は Chrome/Edge の「インストール」、iPhone は Safari「ホーム画面に追加」で、初回ロード後はオフライン動作。Tauri デスクトップ(.dmg/.msi)は見送り(コードは保持)([`BACKLOG.md`](BACKLOG.md) C 節)。

---

## 14. まとめ

- **正直さ × ローカル完結 × 学習導線** を 1 アプリに。
- ポーカー AI の難所(ソルバー)を**外部依存ゼロの自前実装**で実現し、**厳密に解ける所は厳密に・近似の所は近似と明示**する。
- 約 1 週間・1.3 万行・338 テストで、学習アプリとして公開水準に到達。
