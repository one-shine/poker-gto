import type { Card, Rank, Suit } from '../../types/game'
import { CardDisplay } from '../game/CardDisplay'
import { explainPreflop, type PreflopDrillQuestion, type DrillAction, type DrillJudgement } from '../../lib/drill/preflopDrill'
import { TermChips, ConceptLink } from '../common/TermChips'

const ACTION_JP: Record<DrillAction, string> = { raise: 'レイズ', call: 'コール', fold: 'フォールド' }

// プリフロップ ドリルで関連する用語 (GLOSSARY に無いものは TermChips が黙って除外)。
const PREFLOP_TERMS = ['レンジ', 'ポジション', 'ブロッカー', 'エクイティ実現', 'ポットオッズ', '3bet', '4bet']

// カテゴリ ('AKs'/'AKo'/'AA') を代表的な2枚に変換 (表示用)。
function representativeCards(hand: string): [Card, Card] {
  const r1 = hand[0] as Rank
  const r2 = hand[1] as Rank
  const s: Suit[] = ['spades', 'hearts']
  if (hand.length === 2) return [{ rank: r1, suit: s[0] }, { rank: r1, suit: s[1] }]
  if (hand.endsWith('s')) return [{ rank: r1, suit: s[0] }, { rank: r2, suit: s[0] }]
  return [{ rank: r1, suit: s[0] }, { rank: r2, suit: s[1] }]
}

interface Props {
  question: PreflopDrillQuestion
  judgement: DrillJudgement | null
  onAnswer: (action: DrillAction) => void
  onNext: () => void
}

// スポット種別に応じた関連理論コンセプト ID (deep-link 先)。
function conceptForScenario(scenarioId: string): string {
  if (scenarioId.endsWith('-3bet')) return 'facing-3bet'
  if (scenarioId.startsWith('bb-vs-')) return 'bb-defense'
  if (scenarioId === 'sb-open') return 'no-limp'
  return 'rfi-ranges'
}

export function DrillQuestion({ question, judgement, onAnswer, onNext }: Props) {
  const [a, b] = representativeCards(question.hand)
  const best = judgement?.best ?? []
  const recommend = best
    .map(x => `${ACTION_JP[x.action]} ${Math.round(x.freq * 100)}%`)
    .join(' / ')
  const isMixed = best.length > 1

  return (
    <div className="rounded-2xl border border-white/10 bg-base-800/60 p-5 space-y-4">
      <div className="text-center space-y-2">
        <p className="text-sm font-semibold text-zinc-100">{question.scenarioLabel}</p>
        {question.position && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold border bg-base-900 border-brass-400/40 text-brass-200">
            あなた: {question.position}
          </span>
        )}
        <p className="font-display font-bold text-zinc-200">あなたのアクションは?</p>
      </div>

      <div className="flex items-center justify-center gap-2">
        <CardDisplay card={a} size="lg" />
        <CardDisplay card={b} size="lg" />
        <span className="ml-2 font-data text-2xl font-bold text-brass-200">{question.hand}</span>
      </div>

      {!judgement ? (
        <div className="flex flex-wrap justify-center gap-2">
          {question.options.map(o => (
            <button
              key={o.action}
              type="button"
              onClick={() => onAnswer(o.action)}
              className="min-h-12 px-6 rounded-xl font-display font-bold whitespace-nowrap bg-base-900 border border-white/10 hover:border-brass-400 hover:text-brass-200 transition-colors"
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={`rounded-xl p-3 text-center ${
              judgement.correct ? 'bg-emerald-950/40 border border-emerald-500/40' : 'bg-rose-950/30 border border-rose-500/40'
            }`}
          >
            <p className={`font-display font-extrabold ${judgement.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
              <span aria-hidden="true">{judgement.correct ? '✓' : '✗'}</span>{' '}
              {judgement.correct ? '正解' : `${ACTION_JP[judgement.chosen]} は不正解`}
            </p>
            <p className="text-sm text-zinc-300 mt-1">
              推奨: <span className="font-bold text-zinc-100">{recommend || 'フォールド 100%'}</span>
              {isMixed && <span className="ml-1 text-brass-300 font-bold">(どちらも正解)</span>}
            </p>
          </div>
          <div className="rounded-lg bg-base-900/70 border border-brass-400/30 p-3 space-y-2">
            <p className="text-sm text-zinc-100 leading-relaxed">
              <span aria-hidden="true" className="mr-1">💡</span>{explainPreflop(question, judgement)}
            </p>
            <TermChips terms={PREFLOP_TERMS} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConceptLink conceptId={conceptForScenario(question.scenarioId)} />
            <button
              type="button"
              onClick={onNext}
              className="min-h-11 px-6 rounded-xl brass font-display font-extrabold whitespace-nowrap"
            >
              次の問題 →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
