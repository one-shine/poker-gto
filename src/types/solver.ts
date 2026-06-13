import type { Card, PlayerAction, Street } from './game'

// 解の出典。信頼度: solver_precomputed > solver_live > approximate_with_ev > approximate
export type SolutionSource =
  | 'solver_precomputed'   // 同梱ソルバー解 (信頼度最高)
  | 'solver_live'          // ブラウザ内WASM求解 (簡易アブストラクション)
  | 'approximate_with_ev'  // 手作り戦略 + 概算EV (R4-A / Phase B)。戦略は手作り近似のまま。
                           // EV は被覆スポット=フロップサブゲームモデル解 (E_w[V]−cPre)、
                           // 未被覆/4bet枝=ヒューリスティック (equity-0.5)×F。詳細は meta.sourceName。
                           // evLoss 計算可 (UI は「概算EV」と明示する)
  | 'approximate'          // 手作り近似 (EV 無し・未カバースポットの暫定フォールバック)

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
  exploitability?: number // 到達 exploitability。postflop solver_live は pot比 / push-fold solver_precomputed は BB/hand (Nash 品質の検証用)
  // R14②: turn を完全チャンスノード CFR で解いた解 (river ベッティング考慮済み)。
  // turn の solver_live でも「簡易: 賭け未考慮」ではなく「賭け考慮済」と表示するためのフラグ。
  bettingAware?: boolean
  runoutN?: number // chance-CFR の river ランナウトサンプル数 (UI 表示用)
  // 設計ルール4: マルチウェイ(3人以上)では HU レンジを「参考値」として表示する(厳密解ではない)。
  // true のとき UI は「マルチウェイ=参考値」を明示。精度計算には入れない(評価経路では別途 null で除外)。
  multiwayReference?: boolean
  meta: SolutionMeta
}

// EV損失 = 最良アクションのEV − 選択アクションのEV (BB)。学習信号の核。
export function evLoss(solutions: ActionSolution[], chosen: ActionSolution): number {
  const best = Math.max(...solutions.map(s => s.ev))
  return +(best - chosen.ev).toFixed(3)
}

// 事前計算ポストフロップ「代表ボード」解のテーブル (src/data/solutions/postflop/*.json)。
// 1 ファイル = (spot, board, phase) のノードで、hero レンジ全コンボの戦略を持つ。
// getSolution が要求コンボの行を取り出して NodeSolution を組み立てる (どのコンボでもヒットする)。
// 設計ルール1: turn/river のみ (flop は厳密と称せないため対象外)。license は self-generated。
export interface PrecomputedPostflopTable {
  spotId: string            // baseSpotId (例 'bb-vs-btn')
  street: 'flop' | 'turn' | 'river'
  board: Card[]
  phase: 'lead' | 'facing'  // hero ノード種別
  potBB: number
  effStackBB: number
  betFrac: number           // facing 節で hero が直面したベットのポット比 (lead は基準サイズ)
  source: 'solver_precomputed'
  exploitability: number
  bettingAware: boolean     // flop/turn=true (turn+river ベッティング織り込み済)
  iters?: number            // 求解に使用した CFR 反復数 (正直表示の素材)
  fullEnumeration?: boolean // turn/river runout を完全列挙したか (サンプリングとの区別)
  runoutN?: number
  strategy: Record<string, ActionSolution[]> // 具体コンボ "AsKs" → 戦略
  meta: SolutionMeta
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
  // 設計ルール4: マルチウェイ(3人以上)の参考値スポット。表示経路のみ解決し、精度計算では使わない。
  multiway?: boolean
}
