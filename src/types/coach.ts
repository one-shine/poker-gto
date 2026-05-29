import type { ActionSolution, SolutionSource } from './solver'
import type { MistakeCategory, MistakeSeverity } from './stats'
import type { PlayerAction, Street } from './game'

export type EvaluationKind = 'correct' | 'mixed' | 'mistake'

// CoachAgent が 1アクションを評価した結果。UI(CoachPanel/トースト)と stores が消費する。
export interface CoachFeedback {
  handKey: string          // "AKs" など
  spotId: string           // "btn-open" など
  street: Street           // 信頼度判定用 (turn/flop の solver_live はエクイティ近似=簡易)
  source: SolutionSource
  kind: EvaluationKind
  chosen: PlayerAction
  severity?: MistakeSeverity // kind === 'mistake' のみ
  category?: MistakeCategory // kind === 'mistake' のみ
  evLoss: number             // BB。source が approximate のときは 0 (数値非提示)
  showEv: boolean            // source が solver_* のとき true (EV数値を表示してよい)
  strategy: ActionSolution[] // この手の GTO 推奨 (頻度バー表示用)
  message: string            // 理由文 (日本語)
  exploitability?: number    // solver_live の収束度 (均衡からのズレ, 0..1 = %pot/100)
  // R14②: turn を完全チャンスノード CFR で解いた=river ベッティング考慮済み(「簡易: 賭け未考慮」でない)。
  bettingAware?: boolean
  runoutN?: number
}
