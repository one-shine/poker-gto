import type { NodeSolution, SolutionSource } from '../../types/solver'
import { allHandCategories } from './preflopDrill'

// HU プッシュ/フォールド ドリル。R4 で自前生成した厳密解 (hu-pf-*.json, solver_precomputed)
// を出題基準にする。ショーダウン=オールイン勝率=真値のため**実 EV** が使える。
// 依存方向: drill ← data/solutions。getSolution と同じ glob でバンドル済み JSON を読む。

const modules = import.meta.glob<{ default: NodeSolution }>(
  '../../data/solutions/preflop/hu-pf-*.json',
  { eager: true },
)
const SOLUTIONS = new Map<string, NodeSolution>()
for (const m of Object.values(modules)) {
  if (m.default?.spotId) SOLUTIONS.set(m.default.spotId, m.default)
}

export type PushFoldRole = 'sb' | 'bb'
export type PFAction = 'push' | 'call' | 'fold'

const spotId = (stack: number, role: PushFoldRole) => `hu-pf-${stack}bb-${role}`

// 同梱済みの有効スタックを JSON から発見 (昇順)。
export const PUSHFOLD_STACKS: number[] = [
  ...new Set(
    [...SOLUTIONS.keys()]
      .map(id => { const m = /^hu-pf-(\d+)bb-/.exec(id); return m ? Number(m[1]) : null })
      .filter((n): n is number => n !== null),
  ),
].sort((a, b) => a - b)

export interface PushFoldQuestion {
  stack: number
  role: PushFoldRole
  hand: string
  prompt: string
  options: { action: PFAction; label: string }[]
}

export interface PFActionInfo {
  action: PFAction
  freq: number
  ev: number // BB。solver_precomputed の実 EV。未収録アクションは NaN
}

export interface PushFoldJudgement {
  correct: boolean
  chosen: PFAction
  best: PFActionInfo[] // 頻度 ≥ 0.10 の正解アクション
  all: PFActionInfo[]
  source: SolutionSource | null
  exploitability?: number | null // 厳密解の到達 exploitability (BB/hand)
}

const MIXED_THRESHOLD = 0.10

function optionsFor(role: PushFoldRole): { action: PFAction; label: string }[] {
  return role === 'sb'
    ? [{ action: 'push', label: 'オールイン' }, { action: 'fold', label: 'フォールド' }]
    : [{ action: 'call', label: 'コール' }, { action: 'fold', label: 'フォールド' }]
}

function promptFor(stack: number, role: PushFoldRole): string {
  return role === 'sb'
    ? `${stack}BB · SB: プッシュ or フォールド?`
    : `${stack}BB · BB: 相手のオールインにコール or フォールド?`
}

// NodeSolution の strategy[hand] を PFActionInfo[] に正規化 ('raise'→'push')。
function infosFor(stack: number, role: PushFoldRole, hand: string): { all: PFActionInfo[]; source: SolutionSource | null; exploitability: number | null } {
  const sol = SOLUTIONS.get(spotId(stack, role))
  const opts = optionsFor(role).map(o => o.action)
  const acts = sol?.strategy[hand] ?? []
  const all: PFActionInfo[] = opts.map(opt => {
    // 'raise' は push に対応。option と solver action を突合。
    const sa = acts.find(a => (a.action === 'raise' ? 'push' : a.action) === opt)
    return { action: opt, freq: sa?.frequency ?? 0, ev: sa ? sa.ev : NaN }
  })
  return { all, source: sol?.source ?? null, exploitability: sol?.exploitability ?? null }
}

export function generatePushFoldQuestion(
  stack: number,
  role: PushFoldRole,
  rng: () => number = Math.random,
): PushFoldQuestion {
  const cats = allHandCategories()
  const hand = cats[(rng() * cats.length) | 0]
  return { stack, role, hand, prompt: promptFor(stack, role), options: optionsFor(role) }
}

// 短い説明文。プッシュ/フォールドは実EV(厳密解)があるので EV 比較に紐づけられる。
export function explainPushFold(judgement: PushFoldJudgement): string {
  const primary = [...judgement.best].sort((a, b) => b.freq - a.freq)[0]?.action
  if (!primary || primary === 'fold') return 'プッシュ/コールは期待値マイナス。フォールドが正しい。'
  if (primary === 'push') return 'このスタックではプッシュが+EV(降りるより期待値が高い)。'
  if (primary === 'call') return 'オールインに対しコールが+EV。'
  return ''
}

export function judgePushFold(question: PushFoldQuestion, chosen: PFAction): PushFoldJudgement {
  const { all, source, exploitability } = infosFor(question.stack, question.role, question.hand)
  const best = all.filter(a => a.freq >= MIXED_THRESHOLD)
  const chosenFreq = all.find(a => a.action === chosen)?.freq ?? 0
  return { correct: chosenFreq >= MIXED_THRESHOLD, chosen, best, all, source, exploitability }
}
