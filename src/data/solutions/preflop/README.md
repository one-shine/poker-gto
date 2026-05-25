# src/data/solutions/preflop/

取込済みのプリフロップ実ソルバー解 (`source: 'solver_precomputed'`) を `<spotId>.json` で置く。
`getSolution` がここに JSON があれば手作り近似 (`src/data/ranges/preflop.ts`) より**優先採用**する。

生成: `npx tsx scripts/import-ranges.ts <input.csv> <spotId> --source <名前> --license <ライセンス> [--raise <BB>]`

## ⚠ データライセンス方針 (L1) — `docs/DATA_LICENSE.md` が正典

**出所は「自社ソルバーのみ」**。同梱できるのは次のいずれかに限る:
- 自前 TS CFR ソルバーが生成した解 → `--license self-generated`
- 商用利用可能なライセンスが明記されたデータ → 出所のライセンス名を `--license` に記録

**他社ソルバー出力 (GTO Wizard / PioSOLVER / MonkerSolver 等) は「無料公開」でも商用再配布できないため同梱禁止。**
取込スクリプトは `--source` / `--license` を必須とし、既知のプロプライエタリ出所を拒否する。

## 取込済み (自社生成)

- `hu-pf-{S}bb-sb.json` / `hu-pf-{S}bb-bb.json` — HU プッシュ/フォールド Nash 解 (`solver_precomputed`, `license: self-generated`)。
  生成: `npx tsx scripts/solve-pushfold.ts --stacks 10,15,20`。
  ショーダウン勝敗が真値 (スタックが全て入る) のため**厳密 GTO**。勝率行列は MC で構築 (seed 固定で再現可能)。

100BB オープン/3bet レンジは postflop EV が必要なため未取込 (R4 続き)。
