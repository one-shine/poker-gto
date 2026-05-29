import type { GameState, PlayerAction, Position } from '../../types/game'
import type { ActionSolution, NodeSolution } from '../../types/solver'
import type { CoachFeedback } from '../../types/coach'
import type { MistakeCategory, MistakeSeverity } from '../../types/stats'
import { evLoss } from '../../types/solver'
import { resolveSpotKey } from '../../lib/solver/spotKey'
import { getSolution } from '../../lib/solver/getSolution'
import { comboKey } from '../../lib/solver/riverRanges'
import { handCategory } from '../cards/handCategory'
import { AgentBus } from './AgentBus'

const MIXED_THRESHOLD = 0.10 // 頻度10%以上は正解扱い (ミックス戦略)
const T_INACCURACY = 0.5     // BB。これ以下=minor
const T_MISTAKE = 2.0        // BB。これ超=critical

const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}

// CoachAgent: ヒーローの各アクションを getSolution の NodeSolution を基準に評価する。
// ACTION_REQUIRED で意思決定時点の state を捕捉し、続く PLAYER_ACTION で評価する。
export class CoachAgent {
  private bus: AgentBus
  private heroId: string
  private allowLiveSolve: boolean
  private pendingState: GameState | null = null

  constructor(bus: AgentBus, heroId: string, allowLiveSolve: boolean) {
    this.bus = bus
    this.heroId = heroId
    this.allowLiveSolve = allowLiveSolve

    bus.on('ACTION_REQUIRED', p => {
      if (p.playerId === this.heroId) this.pendingState = p.state
    })
    bus.on('PLAYER_ACTION', p => {
      if (p.playerId !== this.heroId) return
      const state = this.pendingState
      this.pendingState = null
      if (state) void this.evaluate(state, p.action, p.amount)
    })
  }

  private async evaluate(state: GameState, action: PlayerAction, amount: number): Promise<void> {
    const spot = resolveSpotKey(state, this.heroId)
    if (!spot) return // 評価対象外スポット → スキップ (誤判定より安全)

    const node = await getSolution(spot, { allowLiveSolve: this.allowLiveSolve })
    if (!node) return // 解未供給 → スキップ

    const hero = state.players.find(p => p.id === this.heroId)
    if (!hero?.holeCards) return
    // preflop はカテゴリ("AKs")、postflop は具体コンボキー("AsKc")で戦略を引く
    const handKey = node.street === 'preflop'
      ? handCategory(hero.holeCards)
      : comboKey([hero.holeCards[0], hero.holeCards[1]])

    const fb = evaluateAction(node, handKey, action, hero.position, amount)
    if (!fb) return

    this.bus.emit('FEEDBACK_READY', { playerId: this.heroId, feedback: fb })
    if (fb.kind === 'mistake') {
      this.bus.emit('MISTAKE_RECORDED', {
        playerId: this.heroId,
        category: fb.category!,
        evLoss: fb.evLoss,
      })
    }
  }
}

// ── 評価ロジック (純関数・テスト可能) ─────────────────────────────────────────

const MATCHABLE: PlayerAction[] = ['fold', 'check', 'call', 'raise', 'allin']

// 選択アクションに対応する ActionSolution を取る。raise/allin はサイズ最近傍。
function pickClosest(sols: ActionSolution[], action: PlayerAction, sizeBB?: number): ActionSolution | null {
  // allin は raise の最大サイズ扱いで突き合わせ
  const target = action === 'allin' ? 'raise' : action
  const cands = sols.filter(s => s.action === target || (target === 'raise' && s.action === 'allin'))
  if (cands.length === 0) return null
  if (cands.length === 1 || sizeBB == null) return cands[0]
  return cands.reduce((best, s) =>
    Math.abs((s.sizeBB ?? 0) - sizeBB) < Math.abs((best.sizeBB ?? 0) - sizeBB) ? s : best,
  )
}

function bestAction(sols: ActionSolution[]): ActionSolution {
  return sols.reduce((b, s) => (s.frequency > b.frequency ? s : b))
}

function severityOfEv(loss: number): MistakeSeverity {
  if (loss > T_MISTAKE) return 'critical'
  if (loss > T_INACCURACY) return 'major'
  return 'minor'
}

// approximate (EV=0) では頻度ギャップを重大度の代理指標にする。
function severityOfFreqGap(gap: number): MistakeSeverity {
  if (gap >= 0.66) return 'critical'
  if (gap >= 0.33) return 'major'
  return 'minor'
}

function categoryFor(
  position: Position,
  chosen: PlayerAction,
  best: ActionSolution,
  street: NodeSolution['street'],
): MistakeCategory {
  if (street !== 'preflop') {
    // ポストフロップ (現状リバー OOP リード): ベット過多=ブラフ頻度 / チェック過多=バリュー逃し
    // (エンジンはベットも 'raise'。'bet' は来ない)
    if (chosen === 'raise' || chosen === 'allin') return 'bluff_frequency'
    if (chosen === 'check' && best.action === 'raise') return 'value_bet_missed'
    if (chosen === 'fold' && best.action === 'call') return 'value_bet_missed'
    return 'cbet_oop_too_wide'
  }
  const isBBDefense = position === 'BB'
  // フォールドすべきでない手をフォールド = タイト過ぎ
  if (chosen === 'fold') return isBBDefense ? 'blind_defense_tight' : 'preflop_too_tight'
  // レイズ推奨を受動的にコール = パッシブ
  if (chosen === 'call' && best.action === 'raise') return 'preflop_passive'
  // フォールド推奨の手をプレイ = ワイド過ぎ
  return isBBDefense ? 'blind_defense_wide' : 'preflop_too_wide'
}

function recommendText(sols: ActionSolution[]): string {
  return sols
    .filter(s => s.frequency >= MIXED_THRESHOLD)
    .map(s => `${ACTION_JP[s.action]}${s.sizeBB ? ` ${s.sizeBB}BB` : ''} ${Math.round(s.frequency * 100)}%`)
    .join(' / ')
}

export function evaluateAction(
  node: NodeSolution,
  handKey: string,
  action: PlayerAction,
  position: Position,
  sizeBB?: number,
): CoachFeedback | null {
  if (!MATCHABLE.includes(action)) return null
  const showEv = node.source !== 'approximate'
  // approximate / approximate_with_ev は手作り scenario 由来 = 非fold手のみ収録。
  // (fromRangeScenario / attachHeuristicEV を参照: pure fold は cells に含まれない)
  const isHandBuilt = node.source === 'approximate' || node.source === 'approximate_with_ev'
  let sols = node.strategy[handKey]

  // 未収録 = fold 100% とみなす (手作り scenario の暗黙ルール)。
  if (!sols || sols.length === 0) {
    if (!isHandBuilt) return null // 実解にこの手が無い → スキップ
    sols = [{ action: 'fold', frequency: 1, ev: 0 }]
  }

  const base = (): Omit<CoachFeedback, 'kind' | 'message' | 'evLoss'> => ({
    handKey, spotId: node.spotId, street: node.street, source: node.source, chosen: action, showEv, strategy: sols,
    exploitability: node.exploitability,
    bettingAware: node.bettingAware, runoutN: node.runoutN,
  })

  const chosen = pickClosest(sols, action, sizeBB)
  const best = bestAction(sols)

  // 解にそのアクションが無い (頻度0) → ミス
  if (!chosen) {
    const loss = showEv ? +(best.ev - Math.min(...sols.map(s => s.ev))).toFixed(2) : 0
    const severity = showEv ? severityOfEv(loss) : severityOfFreqGap(best.frequency)
    const category = categoryFor(position, action, best, node.street)
    return {
      ...base(), kind: 'mistake', severity, category, evLoss: loss,
      message: mistakeMessage(handKey, action, sols, showEv, loss),
    }
  }

  // ミックス戦略の許容内 = 正解
  if (chosen.frequency >= MIXED_THRESHOLD) {
    const alts = sols.filter(s => s !== chosen && s.frequency >= MIXED_THRESHOLD)
    return alts.length > 0
      ? { ...base(), kind: 'mixed', evLoss: 0,
          message: `ミックス戦略の許容内です。推奨: ${recommendText(sols)}` }
      : { ...base(), kind: 'correct', evLoss: 0,
          message: `正解です。推奨: ${recommendText(sols)}` }
  }

  // 頻度が閾値未満 → ミス
  const loss = showEv ? evLoss(sols, chosen) : 0
  if (showEv && loss <= 0) {
    return { ...base(), kind: 'correct', evLoss: 0, message: `正解です。推奨: ${recommendText(sols)}` }
  }
  const severity = showEv ? severityOfEv(loss) : severityOfFreqGap(best.frequency - chosen.frequency)
  return {
    ...base(), kind: 'mistake', severity, category: categoryFor(position, action, best, node.street), evLoss: loss,
    message: mistakeMessage(handKey, action, sols, showEv, loss),
  }
}

function mistakeMessage(
  handKey: string, action: PlayerAction,
  sols: ActionSolution[], showEv: boolean, loss: number,
): string {
  const rec = recommendText(sols)
  const head = showEv ? `-${loss.toFixed(1)}BB。` : ''
  const tail = showEv ? '' : '(参考: GTO近似レンジに照らすと)'
  return `${head}${handKey} の ${ACTION_JP[action]} より、推奨は ${rec} です。${tail}`
}
