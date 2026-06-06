import { useState } from 'react'
import { useProgressStore } from '../../stores/progressStore'
import { useDrillStore } from '../../stores/drillStore'
import {
  generateOddsQuestion, judgeOdds, ODDS_TYPE_JP,
  type OddsQuestion, type OddsJudgement, type OddsQuestionType,
} from '../../lib/drill/oddsDrill'
import { TermChips, ConceptLink } from '../common/TermChips'

const XP_CORRECT = 5
const XP_WRONG = 2

// オッズ算術で関連する用語 (GLOSSARY に無いものは TermChips が黙って除外)。
const ODDS_TERMS = ['ポットオッズ', '必要勝率', 'エクイティ', 'アウツ', 'EV']

type TypeMode = 'mix' | OddsQuestionType

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`min-h-9 px-3 rounded-lg text-sm font-bold transition-colors ${
        active ? 'brass' : 'bg-base-900 text-zinc-400 hover:text-zinc-100 border border-white/10'}`}
    >{children}</button>
  )
}

const genFor = (mode: TypeMode): OddsQuestion =>
  generateOddsQuestion(Math.random, mode === 'mix' ? undefined : mode)

export function OddsDrillPanel() {
  const addXP = useProgressStore(s => s.addXP)
  const recordDrill = useDrillStore(s => s.recordDrill)
  const [typeMode, setTypeMode] = useState<TypeMode>('mix')
  const [question, setQuestion] = useState<OddsQuestion>(() => genFor('mix'))
  const [judgement, setJudgement] = useState<OddsJudgement | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  const onAnswer = (optionId: string) => {
    if (judgement) return
    const j = judgeOdds(question, optionId)
    setJudgement(j)
    setStats(s => ({ answered: s.answered + 1, correct: s.correct + (j.correct ? 1 : 0) }))
    addXP(j.correct ? XP_CORRECT : XP_WRONG)
    recordDrill({
      kind: 'odds', bucketKey: question.type, bucketLabel: ODDS_TYPE_JP[question.type],
      correct: j.correct, chosen: optionId, evLoss: null,
    })
  }

  const next = (mode = typeMode) => { setQuestion(genFor(mode)); setJudgement(null) }
  const changeType = (mode: TypeMode) => { setTypeMode(mode); setQuestion(genFor(mode)); setJudgement(null) }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500">種別</span>
        <Seg active={typeMode === 'mix'} onClick={() => changeType('mix')}>ミックス</Seg>
        <Seg active={typeMode === 'required-equity'} onClick={() => changeType('required-equity')}>必要勝率</Seg>
        <Seg active={typeMode === 'call-fold'} onClick={() => changeType('call-fold')}>コール判断</Seg>
        <Seg active={typeMode === 'outs-equity'} onClick={() => changeType('outs-equity')}>アウツ→勝率</Seg>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">オッズ ドリル</span>
        <span className="font-data text-zinc-300">
          {stats.correct} / {stats.answered} 正解
          {stats.answered > 0 && <span className="text-zinc-500"> ({Math.round((stats.correct / stats.answered) * 100)}%)</span>}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-5 space-y-4">
        <div className="text-center space-y-2">
          <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold border bg-base-900 border-brass-400/40 text-brass-200">
            {ODDS_TYPE_JP[question.type]}
          </span>
          <p className="text-sm text-zinc-100 leading-relaxed">{question.prompt}</p>
        </div>

        {!judgement ? (
          <div className="flex flex-wrap justify-center gap-2">
            {question.options.map(o => (
              <button
                key={o.id} type="button" onClick={() => onAnswer(o.id)}
                className="min-h-12 px-6 rounded-xl font-display font-bold bg-base-900 border border-white/10 hover:border-brass-400 hover:text-brass-200 transition-colors"
              >{o.label}</button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl p-3 text-center ${
              judgement.correct ? 'bg-emerald-950/40 border border-emerald-500/40' : 'bg-rose-950/30 border border-rose-500/40'}`}>
              <p className={`font-display font-extrabold ${judgement.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                <span aria-hidden="true">{judgement.correct ? '✓' : '✗'}</span>{' '}
                {judgement.correct ? '正解' : '不正解'}
              </p>
              <p className="text-sm text-zinc-300 mt-1">
                正解: <span className="font-bold text-zinc-100">{judgement.correctLabel}</span>
              </p>
            </div>

            <div className="rounded-lg bg-base-900/70 border border-brass-400/30 p-3 space-y-2">
              <p className="text-sm text-zinc-100 leading-relaxed">
                <span aria-hidden="true" className="mr-1">💡</span>{judgement.explain}
              </p>
              <TermChips terms={ODDS_TERMS} />
              <ConceptLink conceptId="pot-odds" />
            </div>

            <div className="flex justify-center">
              <button type="button" onClick={() => next()} className="min-h-11 px-6 rounded-xl brass font-display font-extrabold">
                次の問題 →
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-500">
        正解 +{XP_CORRECT}XP / 挑戦 +{XP_WRONG}XP。これは<strong className="text-zinc-400">オッズ算術の練習</strong>です
        (必要勝率・ポットオッズ・アウツ×2/×4)。<strong className="text-zinc-400">GTO頻度とは別</strong>の、数学的な目安の暗算力を鍛えます。
      </p>
    </div>
  )
}
