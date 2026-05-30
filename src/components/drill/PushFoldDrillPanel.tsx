import { useState } from 'react'
import type { Card, Rank, Suit } from '../../types/game'
import { useProgressStore } from '../../stores/progressStore'
import { CardDisplay } from '../game/CardDisplay'
import {
  explainPushFold, generatePushFoldQuestion, judgePushFold, PUSHFOLD_STACKS,
  type PushFoldQuestion, type PushFoldJudgement, type PushFoldRole, type PFAction,
} from '../../lib/drill/pushFoldDrill'

const XP_CORRECT = 5
const XP_WRONG = 2
const PF_JP: Record<PFAction, string> = { push: 'オールイン', call: 'コール', fold: 'フォールド' }

type RoleMode = 'sb' | 'bb' | 'mix'

// カテゴリ ('AKs'/'AKo'/'AA') を代表的な2枚に変換 (表示用)。
function representativeCards(hand: string): [Card, Card] {
  const r1 = hand[0] as Rank
  const r2 = hand[1] as Rank
  const s: Suit[] = ['spades', 'hearts']
  if (hand.length === 2) return [{ rank: r1, suit: s[0] }, { rank: r1, suit: s[1] }]
  if (hand.endsWith('s')) return [{ rank: r1, suit: s[0] }, { rank: r2, suit: s[0] }]
  return [{ rank: r1, suit: s[0] }, { rank: r2, suit: s[1] }]
}

const fmtEv = (ev: number) => (Number.isFinite(ev) ? `${ev > 0 ? '+' : ''}${ev.toFixed(2)}BB` : '—')

function pickRole(mode: RoleMode, rng: () => number): PushFoldRole {
  if (mode === 'mix') return rng() < 0.5 ? 'sb' : 'bb'
  return mode
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`min-h-9 px-3 rounded-lg text-sm font-bold transition-colors ${
        active ? 'brass' : 'bg-base-900 text-zinc-400 hover:text-zinc-100 border border-white/10'}`}
    >{children}</button>
  )
}

export function PushFoldDrillPanel() {
  const addXP = useProgressStore(s => s.addXP)
  const [stack, setStack] = useState(PUSHFOLD_STACKS[0] ?? 10)
  const [roleMode, setRoleMode] = useState<RoleMode>('mix')
  const [question, setQuestion] = useState<PushFoldQuestion>(() =>
    generatePushFoldQuestion(PUSHFOLD_STACKS[0] ?? 10, pickRole('mix', Math.random)))
  const [judgement, setJudgement] = useState<PushFoldJudgement | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  const fresh = (st = stack, mode = roleMode) =>
    generatePushFoldQuestion(st, pickRole(mode, Math.random), Math.random)

  const onAnswer = (action: PFAction) => {
    if (judgement) return
    const j = judgePushFold(question, action)
    setJudgement(j)
    setStats(s => ({ answered: s.answered + 1, correct: s.correct + (j.correct ? 1 : 0) }))
    addXP(j.correct ? XP_CORRECT : XP_WRONG)
  }
  const onNext = () => { setQuestion(fresh()); setJudgement(null) }
  const changeStack = (st: number) => { setStack(st); setQuestion(fresh(st)); setJudgement(null) }
  const changeRole = (mode: RoleMode) => { setRoleMode(mode); setQuestion(fresh(stack, mode)); setJudgement(null) }

  const [a, b] = representativeCards(question.hand)
  const recommend = (judgement?.best ?? [])
    .map(x => `${PF_JP[x.action]} ${Math.round(x.freq * 100)}%`)
    .join(' / ')

  return (
    <div className="space-y-4">
      {/* スタック / ロール 選択 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">スタック</span>
          {PUSHFOLD_STACKS.map(st => (
            <Seg key={st} active={stack === st} onClick={() => changeStack(st)}>{st}BB</Seg>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">立場</span>
          <Seg active={roleMode === 'sb'} onClick={() => changeRole('sb')}>SB プッシュ</Seg>
          <Seg active={roleMode === 'bb'} onClick={() => changeRole('bb')}>BB 対オールイン</Seg>
          <Seg active={roleMode === 'mix'} onClick={() => changeRole('mix')}>ミックス</Seg>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">HU プッシュ/フォールド ドリル</span>
        <span className="font-data text-zinc-300">
          {stats.correct} / {stats.answered} 正解
          {stats.answered > 0 && <span className="text-zinc-500"> ({Math.round((stats.correct / stats.answered) * 100)}%)</span>}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-5 space-y-4">
        <div className="text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold border bg-base-900 border-brass-400/40 text-brass-200">
            あなた: {question.role === 'sb' ? 'SB（スモールブラインド）' : 'BB（ビッグブラインド）'} · {question.stack}BB
          </span>
          <p className="text-sm text-zinc-200">{question.prompt}</p>
          <p className="font-display font-bold text-zinc-200">あなたのアクションは?</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <CardDisplay card={a} size="lg" />
          <CardDisplay card={b} size="lg" />
          <span className="ml-2 font-data text-2xl font-bold text-brass-200">{question.hand}</span>
        </div>

        {!judgement ? (
          <div className="flex justify-center gap-2">
            {question.options.map(o => (
              <button
                key={o.action} type="button" onClick={() => onAnswer(o.action)}
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
                {judgement.correct ? '正解' : `${PF_JP[judgement.chosen]} は不正解`}
              </p>
              <p className="text-sm text-zinc-300 mt-1">推奨: {recommend || 'フォールド 100%'}</p>
            </div>

            <p className="text-sm text-zinc-100 leading-relaxed rounded-lg bg-base-900/70 border border-brass-400/30 p-3">
              <span aria-hidden="true" className="mr-1">💡</span>{explainPushFold(judgement)}
            </p>

            {/* 各アクションの実 EV (solver_precomputed) */}
            <div className="flex justify-center gap-2 text-sm">
              {judgement.all.map(info => (
                <span key={info.action} className="px-2.5 py-1 rounded-lg bg-base-900 border border-white/10 font-data text-zinc-200">
                  {PF_JP[info.action]} <span className="text-zinc-400">{Math.round(info.freq * 100)}%</span>
                  {' · '}<span className={Number.isFinite(info.ev) && info.ev >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmtEv(info.ev)}</span>
                </span>
              ))}
            </div>

            <div className="flex justify-center">
              <button type="button" onClick={onNext} className="min-h-11 px-6 rounded-xl brass font-display font-extrabold">
                次の問題 →
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-500">
        正解 +{XP_CORRECT}XP / 挑戦 +{XP_WRONG}XP。
        <span className="text-emerald-300/80">✓ GTOソルバー解 (厳密・自社生成)</span> 基準。
        {judgement?.exploitability != null && (
          <span className="text-emerald-300/80"> exploitability {judgement.exploitability.toFixed(4)} BB/hand (≈Nash)。</span>
        )}
        ショーダウン=オールイン勝率=真値のため実 EV 付き。頻度10%以上の行動が正解 (ミックス対応)。
      </p>
    </div>
  )
}
