import { useState } from 'react'
import { useProgressStore } from '../../stores/progressStore'
import { useDrillStore } from '../../stores/drillStore'
import { CardDisplay } from '../game/CardDisplay'
import { TermChips, ConceptLink } from '../common/TermChips'
import { conceptById } from '../../data/theory/concepts'
import {
  generateSizingQuestion, judgeSizing, APPROACH_JP,
  type SizingQuestion, type SizingJudgement, type SizingStreet,
} from '../../lib/drill/sizingDrill'

const XP_CORRECT = 5
const XP_WRONG = 2
const STREET_JP: Record<SizingStreet, string> = { flop: 'フロップ', turn: 'ターン', river: 'リバー' }

export function SizingDrillPanel() {
  const addXP = useProgressStore(s => s.addXP)
  const recordDrill = useDrillStore(s => s.recordDrill)
  const [question, setQuestion] = useState<SizingQuestion>(() => generateSizingQuestion())
  const [judgement, setJudgement] = useState<SizingJudgement | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  const next = () => {
    setJudgement(null)
    setQuestion(generateSizingQuestion())
  }

  const onAnswer = (chosen: SizingQuestion['options'][number]) => {
    if (judgement) return
    const j = judgeSizing(question, chosen)
    setJudgement(j)
    setStats(s => ({ answered: s.answered + 1, correct: s.correct + (j.correct ? 1 : 0) }))
    addXP(j.correct ? XP_CORRECT : XP_WRONG)
    recordDrill({
      kind: 'sizing',
      bucketKey: `sizing:${question.street}`,
      bucketLabel: `ベット判断 (${STREET_JP[question.street]})`,
      correct: j.correct,
      chosen: APPROACH_JP[chosen],
      evLoss: null, // 一般原則の整理であり EV/GTO 採点ではない
    })
  }

  const conceptTitle = conceptById(question.conceptId)?.title

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">ベット判断ドリル</span>
        <span className="font-data text-zinc-300">
          {stats.correct} / {stats.answered} 正解
          {stats.answered > 0 && (
            <span className="text-zinc-500"> ({Math.round((stats.correct / stats.answered) * 100)}%)</span>
          )}
        </span>
      </div>

      {/* 正直表示: GTO採点ではない (ルール1) */}
      <p className="rounded-lg bg-amber-950/30 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-200/90">
        ⚠ これは「ベットの使い分け」を<strong>一般原則で整理</strong>する学習用クイズです。GTO 頻度の採点ではありません
        (現ソルバーは単一サイズしか解かないため)。行動(打つ/チェック)の厳密な採点は「ポストフロップ」ドリルを使ってください。
      </p>

      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-5 space-y-4">
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-zinc-100">
            {STREET_JP[question.street]} · {question.position}
          </p>
          <p className="text-sm text-zinc-300">{question.situation}</p>
          <p className="text-sm">
            <span className="text-zinc-500">あなた: </span>
            <span className="font-bold text-brass-200">{question.heroLabel}</span>
          </p>
        </div>

        {/* ボード */}
        <div className="flex items-center justify-center gap-1.5">
          {question.board.map((c, i) => <CardDisplay key={i} card={c} size="sm" />)}
        </div>

        <p className="text-center text-sm text-zinc-200">推奨アプローチは?</p>

        {/* アプローチ選択 */}
        <div className="flex flex-col gap-2">
          {question.options.map(opt => {
            const revealed = judgement != null
            const isCorrect = revealed && opt === question.correct
            const isChosen = revealed && judgement.chosen === opt
            const tone = !revealed
              ? 'bg-base-900 border-white/10 hover:border-brass-400 hover:text-brass-200'
              : isCorrect
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
              : isChosen
              ? 'bg-rose-950/30 border-rose-500/50 text-rose-200'
              : 'bg-base-900 border-white/10 opacity-70'
            return (
              <button
                key={opt}
                type="button"
                disabled={revealed}
                onClick={() => onAnswer(opt)}
                className={`min-h-12 px-4 rounded-xl border font-display font-bold text-sm text-left transition-colors ${tone}`}
              >
                {revealed && isCorrect && <span aria-hidden="true" className="mr-1">✓</span>}
                {revealed && isChosen && !isCorrect && <span aria-hidden="true" className="mr-1">✗</span>}
                {APPROACH_JP[opt]}
              </button>
            )
          })}
        </div>

        {judgement && (
          <div className="space-y-3">
            <div className={`rounded-xl p-3 text-center ${
              judgement.correct ? 'bg-emerald-950/40 border border-emerald-500/40' : 'bg-rose-950/30 border border-rose-500/40'}`}>
              <p className={`font-display font-extrabold ${judgement.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                <span aria-hidden="true">{judgement.correct ? '✓' : '✗'}</span>{' '}
                {judgement.correct ? '正解' : '不正解'}
                {!judgement.correct && (
                  <span className="text-sm font-normal text-zinc-300">
                    {' '}— 原則は「{APPROACH_JP[judgement.correctApproach]}」
                  </span>
                )}
              </p>
            </div>

            <div className="rounded-lg bg-base-900/70 border border-brass-400/30 p-3 space-y-2">
              <p className="text-sm text-zinc-100 leading-relaxed">
                <span aria-hidden="true" className="mr-1">💡</span>{question.explain}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {conceptTitle && <ConceptLink conceptId={question.conceptId} label={`${conceptTitle} ▶`} />}
                <TermChips terms={question.terms} />
              </div>
            </div>

            <div className="flex justify-center">
              <button type="button" onClick={next} className="min-h-11 px-6 rounded-xl brass font-display font-extrabold">
                次の問題 →
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-500">
        正解 +{XP_CORRECT}XP / 挑戦 +{XP_WRONG}XP。レンジ優位・ナッツ優位・ボードテクスチャ・ブロッカーから
        「小さく高頻度 / ポラライズ / 薄いバリュー / ポットコントロール」の使い分けを一般原則で学びます。
      </p>
    </div>
  )
}
