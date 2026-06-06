import type { NodeSolution, SolutionSource } from '../../types/solver'
import { allHandCategories } from './preflopDrill'
import { handTier } from '../coach/coachConcepts'
import { MIXED_STRATEGY_THRESHOLD as MIXED_THRESHOLD } from '../../types/gtoRules'

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

// EV 値を BB 表記に (厳密解の実 EV)。
const fmtEv = (ev: number) => `${ev > 0 ? '+' : ''}${ev.toFixed(2)}BB`

// スタック深度の一般原則 (浅いほど広く押せる)。エクイティ実現が縮む = ポストフロップで
// 価値を取りにくいため、フォールドエクイティ主体のオールインが相対的に有利になる。
function depthRationale(stack: number, role: PushFoldRole): string {
  if (role === 'sb') {
    if (stack <= 12) return `${stack}BBは浅く、ポストフロップでのエクイティ実現が縮むぶん広く押せる。`
    return `${stack}BBはやや深く、押せる手が締まる (実現できるエクイティが増えるほどレンジは狭くなる)。`
  }
  // BB のコール (vs shove)。浅いほど割安なポットオッズで広くコールできる。
  if (stack <= 12) return `${stack}BBは浅く、コール額に対しポットが大きいため広くコールできる。`
  return `${stack}BBはやや深く、コールに必要な勝率が上がるためレンジは狭くなる。`
}

// 短い説明文。プッシュ/フォールドは実EV(厳密解=solver_precomputed)があるので EV 比較に紐づけられる。
// question を渡すとスタック深度の根拠 (浅いほど広く押せる) を添える。
export function explainPushFold(judgement: PushFoldJudgement, question?: PushFoldQuestion): string {
  const primary = [...judgement.best].sort((a, b) => b.freq - a.freq)[0]?.action
  const depth = question ? depthRationale(question.stack, question.role) : ''
  const tier = question ? handTier(question.hand) : null
  const pushEv = judgement.all.find(a => a.action === 'push')?.ev
  const callEv = judgement.all.find(a => a.action === 'call')?.ev
  const foldNote = '厳密解 (Nash) なので、各アクションの EV を直接比較できる。'

  if (!primary || primary === 'fold') {
    const lead = tier ? `${tier.label}。プッシュ/コールは期待値マイナスで、フォールド (EV 0) が最善。` : 'プッシュ/コールは期待値マイナス。フォールドが正しい。'
    return [lead, depth, foldNote].filter(Boolean).join(' ')
  }
  if (primary === 'push') {
    const evTxt = Number.isFinite(pushEv ?? NaN) ? `プッシュ ${fmtEv(pushEv!)} > フォールド 0BB。` : 'プッシュが+EV (降りるより期待値が高い)。'
    return [tier ? `${tier.label}。${evTxt}` : evTxt, depth].filter(Boolean).join(' ')
  }
  if (primary === 'call') {
    const evTxt = Number.isFinite(callEv ?? NaN) ? `オールインに対しコール ${fmtEv(callEv!)} > フォールド 0BB。` : 'オールインに対しコールが+EV。'
    return [tier ? `${tier.label}。${evTxt}` : evTxt, depth].filter(Boolean).join(' ')
  }
  return ''
}

export function judgePushFold(question: PushFoldQuestion, chosen: PFAction): PushFoldJudgement {
  const { all, source, exploitability } = infosFor(question.stack, question.role, question.hand)
  const best = all.filter(a => a.freq >= MIXED_THRESHOLD)
  const chosenFreq = all.find(a => a.action === chosen)?.freq ?? 0
  return { correct: chosenFreq >= MIXED_THRESHOLD, chosen, best, all, source, exploitability }
}
