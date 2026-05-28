import type { Card, PlayerAction, Street } from './game'

// 解の出典。信頼度: solver_precomputed > solver_live > approximate
export type SolutionSource =
  | 'solver_precomputed' // 同梱ソルバー解 (信頼度最高)
  | 'solver_live'        // ブラウザ内WASM求解 (簡易アブストラクション)
  | 'approximate'        // 手作り近似 (未カバースポットの暫定フォールバック)

export interface ActionSolution {
  action: PlayerAction
  sizeBB?: number   // raise/bet の to-amount (BB)
  frequency: number // 0..1 GTO戦略での採用頻度
  ev: number        // このアクションのEV (BB単位)
}

// 解データの使用許諾。商用公開の根幹 (docs/DATA_LICENSE.md L1)。
// 'self-generated' (自前ソルバー生成) / 'original' (手作りオリジナル) は自社所有=商用安全。
// 取込データは出所のライセンス名 (例 'CC-BY-4.0') を必ず記録する。
// ⚠ 他社ソルバー出力 (GTO Wizard 等) の商用再配布は規約・著作権違反の恐れ → 同梱禁止。
export type DataLicense = 'self-generated' | 'original' | (string & {})

export interface SolutionMeta {
  sourceName: string // 例: 'self CFR (river)' / 'hand-built'
  license: DataLicense // 使用許諾 (商用公開の根幹)
  sourceUrl?: string // 取込データの出所URL (あれば)
  version: string
  solvedAt?: number  // solver_live のとき求解時刻 (epoch ms)
}

// 1ノード(あるストリート・ボード・アクション履歴の到達点)のGTO戦略。
export interface NodeSolution {
  street: Street
  spotId: string // 'btn-open' / 'bbvsbtn-flop-K72r' など
  board?: Card[]
  // キー: ハンドカテゴリ(プリフロップ "AKs") or 具体コンボ(ポストフロップ "AsKs")
  strategy: Record<string, ActionSolution[]>
  potBB: number
  source: SolutionSource
  exploitability?: number // solver_live が到達した exploitability (% pot)
  meta: SolutionMeta
}

// EV損失 = 最良アクションのEV − 選択アクションのEV (BB)。学習信号の核。
export function evLoss(solutions: ActionSolution[], chosen: ActionSolution): number {
  const best = Math.max(...solutions.map(s => s.ev))
  return +(best - chosen.ev).toFixed(3)
}

export interface SpotKey {
  baseSpotId: string // プリフロップシナリオID (例: 'bb-vs-btn')
  street: Street
  board?: Card[]
  // ポストフロップ求解の文脈 (river の自前ソルバー用)。preflop では未使用。
  heroCards?: [Card, Card]
  potBB?: number       // ストリート開始時のポット (この街のベット前)
  effStackBB?: number
  riverBetBB?: number  // hero が直面しているベット額 (>0 = 被ベット節, 未設定/0 = 先頭/チェック後)
  // hero が自らのベット/チェックレイズに対し相手のレイズに直面しているノード (R16 深いノード)。
  // true のとき riverBetBB は hero 自身のリードベット額 (betFrac 算出用)。fold/call のみ。
  facingRaise?: boolean
  heroIsOOP?: boolean  // hero が OOP (defender) か IP (opener) か
}
