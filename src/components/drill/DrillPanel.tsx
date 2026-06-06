import { useEffect, useState } from 'react'
import { useProgressStore } from '../../stores/progressStore'
import { useDrillStore } from '../../stores/drillStore'
import { useNavStore } from '../../stores/navStore'
import { CATEGORY_JP } from '../../data/mistakeLabels'
import { generateQuestion, judge, type DrillAction, type DrillJudgement, type PreflopDrillQuestion } from '../../lib/drill/preflopDrill'
import { DrillQuestion } from './DrillQuestion'

const XP_CORRECT = 5
const XP_WRONG = 2

export function DrillPanel() {
  const addXP = useProgressStore(s => s.addXP)
  const recordDrill = useDrillStore(s => s.recordDrill)
  const drillCategory = useNavStore(s => s.drillCategory)
  const clearDrillCategory = useNavStore(s => s.clearDrillCategory)

  // 弱点ドリルのカテゴリは初回の出題に反映(マウント時に一度だけ取り込む)
  const [category] = useState(() => drillCategory ?? undefined)
  const [question, setQuestion] = useState<PreflopDrillQuestion>(() => generateQuestion(Math.random, drillCategory ?? undefined))
  const [judgement, setJudgement] = useState<DrillJudgement | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  // 取り込んだフィルタはクリア(ナビで戻っても残らないように)。マウント時一度。
  useEffect(() => {
    if (drillCategory) clearDrillCategory()
  }, [drillCategory, clearDrillCategory])

  const onAnswer = (action: DrillAction) => {
    if (judgement) return
    const j = judge(question, action)
    setJudgement(j)
    setStats(s => ({ answered: s.answered + 1, correct: s.correct + (j.correct ? 1 : 0) }))
    addXP(j.correct ? XP_CORRECT : XP_WRONG)
    recordDrill({ kind: 'preflop', bucketKey: question.scenarioId, bucketLabel: question.scenarioLabel, correct: j.correct, chosen: action, evLoss: null })
  }

  const onNext = () => {
    setQuestion(generateQuestion(Math.random, category))
    setJudgement(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">
          {category ? <>出題: <span className="text-brass-200 font-bold">{CATEGORY_JP[category]}</span></> : 'プリフロップ ドリル'}
        </span>
        <span className="font-data text-zinc-300">
          {stats.correct} / {stats.answered} 正解
          {stats.answered > 0 && <span className="text-zinc-500"> ({Math.round((stats.correct / stats.answered) * 100)}%)</span>}
        </span>
      </div>
      <DrillQuestion question={question} judgement={judgement} onAnswer={onAnswer} onNext={onNext} />
      <p className="text-[11px] text-zinc-500">
        正解 +{XP_CORRECT}XP / 挑戦 +{XP_WRONG}XP。GTO近似レンジ基準(頻度10%以上の行動が正解・ミックス対応)。
      </p>
    </div>
  )
}
