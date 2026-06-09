import type { ActionSolution, SolutionSource } from '../../types/solver'
import type { PlayerAction } from '../../types/game'

// GTO戦略から「推奨」を抽出・表示するための純TSヘルパ。
// ⚠ decisionGuidance.ts は「答え中立(頻度を出さない)」専用なので、答えを出す本ロジックは別ファイルに置く。

export const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}

// 解の戦略から最頻アクション(= ソルバー推奨。GTOと断定しない)を取り出す。
// 元 PostflopReviewPanel の recommendedAction を ActionSolution[] ベースへ一般化。
export function recommendedSolution(strategy: ActionSolution[]): ActionSolution | null {
  let best: ActionSolution | null = null
  for (const s of strategy) if (s.frequency > (best?.frequency ?? -1)) best = s
  return best
}

// 推奨アクションのラベル。raise/allin は "レイズ 3.6BB" のようにサイズ + 単位を付ける。
// check/call/fold は sizeBB を持たないので素のラベル。sizeBB が未定義/0 のときも素のラベル。
export function actionSizeLabel(s: ActionSolution): string {
  const base = ACTION_JP[s.action]
  if ((s.action === 'raise' || s.action === 'allin') && s.sizeBB != null && s.sizeBB > 0) {
    return `${base} ${s.sizeBB.toFixed(1)}BB`
  }
  return base
}

// 正直表示: approximate 系は「推奨(最頻)」、solver 系は「推奨」。"GTO最適/絶対" は使わない。
export function recommendLabel(source: SolutionSource): string {
  return source === 'approximate' || source === 'approximate_with_ev' ? '推奨(最頻)' : '推奨'
}
