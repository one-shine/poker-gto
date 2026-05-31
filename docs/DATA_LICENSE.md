# データライセンス方針 (L1) — 正典

> 商用公開 (Web / スマホアプリ / 広告収益化) の**法的根幹**。
> `docs/RELEASE_READINESS.md` の L1 はこのファイルへのポインタ。方針変更時はここを更新する。

## 決定 (2026-05-25)

**ソルバー/レンジデータの出所は「自社ソルバーのみ」とする。**

本アプリが同梱・配布するすべての GTO 解データは、次のいずれかに限定する:

1. **自前 TS CFR ソルバーが生成した解** (`license: 'self-generated'`) — 完全自社所有
2. **一般的な GTO 理論に基づき手作りしたオリジナルレンジ** (`license: 'original'`) — 完全自社所有

**他社ソルバー出力 (GTO Wizard / PioSOLVER / MonkerSolver / Simple Postflop 等) の解・レンジは、たとえ「無料公開」されていても商用再配布しない。** 利用規約・著作権・データベース権の侵害になる恐れがあるため。

将来、高精度化のために外部データを使う場合は、**商用利用可能なライセンスが明記されたデータのみ**を取り込み、出所とライセンスを `meta` に必ず記録する。その判断は本ファイルを更新してから行う。

## なぜこの方針か

- アプリは Phase 3.5 で **AGPL 系の postflop-solver (Rust/WASM) を捨て、商用安全な自前 TS ソルバーに切替済み**。データ面も同じ原則 (自社所有) で揃えるのが一貫している。
- 自社所有なら**ライセンスコスト 0・契約管理不要・再配布自由**。広告/サブスクいずれのモデルでも制約が出ない。
- 代償は「プリフロップの実ソルバー解を自前生成する必要がある」点 (= R4)。現状はオリジナル手作り近似 (`approximate`) でローンチ可能な品質を確保し、自社ソルバー生成解 (`solver_precomputed`) へ順次置換する。

## データの現状と権利 (棚卸し)

| データ | 場所 | `source` | `license` | 権利 |
|--------|------|----------|-----------|------|
| プリフロップ近似レンジ 12スポット | `src/data/ranges/preflop.ts` | `approximate` | `original` | 自社 (一般理論ベース手作り) |
| ライブ求解 (river/turn/flop HU) | `src/lib/solver/getSolution.ts` | `solver_live` | `self-generated` | 自社 |
| HU プッシュ/フォールド Nash 解 | `src/data/solutions/preflop/hu-pf-*.json` | `solver_precomputed` | `self-generated` | 自社 (R4: 自前ソルバー生成) |
| その他の事前計算解 | `src/data/solutions/**` | `solver_precomputed` | (取込時に明記) | 100BBオープン等は未取込 (R4続き) |
| 理論記事・用語集 | `src/data/theory/` | — | `original` | 自社 (オリジナル執筆。監修要 = R19) |

> ⚠ かつて計画段階で言及していた「FreeBetRange 参考」「GTO Wizard 無料レンジ取込」という表現は**撤回済み**。
> 手作りレンジは特定製品のコピーではなく、一般的な GTO 理論に基づくオリジナルである旨を UI・コードの `meta` に明記する。

## 仕組みによる強制 (うっかり違反の防止)

- **`SolutionMeta.license` を必須化** (`src/types/solver.ts`)。すべての解は出所の使用許諾を保持する。
- **取込スクリプトのガード** (`scripts/import-ranges.ts`): `--source` / `--license` を必須とし、既知のプロプライエタリ出所 (gto wizard / piosolver / monker / simple postflop) を**部分一致で拒否**する。デフォルトの仮ラベルは廃止。
- **`src/data/solutions/preflop/README.md`** に同方針を明記。

## 関連項目 (RELEASE_READINESS の他ライセンス論点)

- **L2 OSS ライセンス**: 実行時依存は `react` / `react-dom` / `zustand` / `framer-motion` (いずれも MIT)、`idb` (ISC) と**すべて寛容ライセンス**でコピーレフト無し。配布時に `THIRD_PARTY_LICENSES` を同梱する。AGPL の postflop-solver は不採用 (依存に無し)。
- **L3 フォント**: Bricolage Grotesque / Hanken Grotesk / Zen Kaku Gothic New / JetBrains Mono を **@fontsource でセルフホスト化済み** (Google Fonts CDN 依存を撤去、完全オフライン)。いずれも OFL-1.1 (JetBrains Mono も OFL) で商用同梱可。OFL は配布時のライセンス同梱が条件のため、配布物の `THIRD_PARTY_LICENSES` に各 @fontsource パッケージ同梱の `LICENSE` (例: Zen Kaku Gothic New = "Copyright The Zen Project Authors") を含めること。

## 残作業 (この方針に基づく)

- **R4 (一部完了)**: HU プッシュ/フォールド Nash を自前ソルバーで生成済み (`scripts/solve-pushfold.ts` → `hu-pf-*.json`, `solver_precomputed`)。**ショーダウン勝敗が真値のため厳密 GTO**。残: 100BB オープン/3bet は postflop EV が必要で別途検討、生成解を消費するプッシュ/フォールド・トレーナー UI。
- 配布物に `THIRD_PARTY_LICENSES` (L2) と フォントライセンス表記 (L3) を同梱。
