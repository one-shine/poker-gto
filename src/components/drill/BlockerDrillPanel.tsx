import { useState } from 'react'
import { useProgressStore } from '../../stores/progressStore'
import { useDrillStore } from '../../stores/drillStore'
import { CardDisplay } from '../game/CardDisplay'
import { TermChips, ConceptLink } from '../common/TermChips'
import { BookIcon } from '../icons/ActionIcons'
import {
  generateBlockerQuestion, judgeBlocker, explainBlocker,
  type BlockerQuestion, type BlockerJudgement,
} from '../../lib/drill/blockerDrill'

const XP_CORRECT = 6
const XP_WRONG = 2
// 関連用語 (GLOSSARY に無いものは TermChips が黙って除外)。
const BLOCKER_TERMS = ['ブロッカー', 'アンブロック', 'ナッツ優位', 'ブラフ', 'コンボ']

export function BlockerDrillPanel() {
  const addXP = useProgressStore(s => s.addXP)
  const recordDrill = useDrillStore(s => s.recordDrill)
  const [question, setQuestion] = useState<BlockerQuestion>(() => generateBlockerQuestion())
  const [judgement, setJudgement] = useState<BlockerJudgement | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  const next = () => {
    setJudgement(null)
    setQuestion(generateBlockerQuestion())
  }

  const onAnswer = (idx: number) => {
    if (judgement) return
    const j = judgeBlocker(question, idx)
    setJudgement(j)
    setStats(s => ({ answered: s.answered + 1, correct: s.correct + (j.correct ? 1 : 0) }))
    addXP(j.correct ? XP_CORRECT : XP_WRONG)
    recordDrill({
      kind: 'blocker',
      bucketKey: 'blocker:river',
      bucketLabel: 'ブロッカー (リバー)',
      correct: j.correct,
      chosen: question.candidates[idx].label,
      evLoss: null, // ブロッカーは EV ではなくカードリムーバルで採点 (頻度の主張なし)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">ブロッカー ドリル</span>
        <span className="font-data text-zinc-300">
          {stats.correct} / {stats.answered} 正解
          {stats.answered > 0 && (
            <span className="text-zinc-500"> ({Math.round((stats.correct / stats.answered) * 100)}%)</span>
          )}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-5 space-y-4">
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-zinc-100">リバー — 最良のブラフを選ぶ</p>
          <p className="text-sm text-zinc-300">
            相手の<span className="text-brass-200 font-bold">バリュー(ツーペア以上)</span>を
            <span className="text-brass-200 font-bold">最も多く消す</span>ブロッカーはどれ?
          </p>
          <p className="text-[11px] text-zinc-500">
            相手の強い続行レンジを握る手ほど良いブラフ (相手がその手を持てない)。
          </p>
        </div>

        {/* ボード (リバー5枚) */}
        <div className="flex items-center justify-center gap-1.5">
          {question.board.map((c, i) => <CardDisplay key={i} card={c} size="sm" />)}
        </div>

        {/* 候補 = ブラフ手 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {question.candidates.map((cand, idx) => {
            const revealed = judgement != null
            const isBest = revealed && judgement.bestIdxs.includes(idx)
            const isChosen = revealed && judgement.chosenIdx === idx
            const tone = !revealed
              ? 'bg-base-900 border-white/10 hover:border-brass-400'
              : isBest
              ? 'bg-emerald-950/40 border-emerald-500/50'
              : isChosen
              ? 'bg-rose-950/30 border-rose-500/50'
              : 'bg-base-900 border-white/10 opacity-70'
            return (
              <button
                key={idx}
                type="button"
                disabled={revealed}
                onClick={() => onAnswer(idx)}
                aria-label={`候補 ${cand.label}`}
                className={`min-h-12 p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-colors ${tone}`}
              >
                <span className="flex items-center gap-1">
                  <CardDisplay card={cand.cards[0]} size="sm" />
                  <CardDisplay card={cand.cards[1]} size="sm" />
                </span>
                {revealed && (
                  <span className="text-[11px] font-data text-zinc-300">
                    {isBest && <span aria-hidden="true" className="text-emerald-300">✓ </span>}
                    {isChosen && !isBest && <span aria-hidden="true" className="text-rose-300">✗ </span>}
                    {cand.blocks} 通りブロック
                  </span>
                )}
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
              </p>
            </div>

            <div className="rounded-lg bg-base-900/70 border border-brass-400/30 p-3 space-y-2">
              <p className="text-sm text-zinc-100 leading-relaxed">
                <span aria-hidden="true" className="mr-1">💡</span>{explainBlocker(question, judgement)}
                <span className="text-zinc-400"> (採点: カードリムーバルの事実。GTO 頻度ではありません。)</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ConceptLink conceptId="blockers" label="ブロッカー(カードリムーバル) ▶" />
                <TermChips terms={BLOCKER_TERMS} />
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
        <span className="inline-flex items-center gap-1"><BookIcon className="w-3.5 h-3.5" />学習</span>:
        正解 +{XP_CORRECT}XP / 挑戦 +{XP_WRONG}XP。採点は「自分の2枚が相手のバリュー(ツーペア以上)を何通り消すか」という
        カードリムーバルの事実で行います (ソルバーの GTO 頻度ではありません)。良いブラフは相手の続行レンジをブロックします。
      </p>
    </div>
  )
}
