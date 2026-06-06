import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerAction } from '../../types/game'
import { useProgressStore } from '../../stores/progressStore'
import { useDrillStore } from '../../stores/drillStore'
import { evLossFrom } from '../../lib/drill/evLoss'
import { CardDisplay } from '../game/CardDisplay'
import {
  ACTION_JP, explainPostflop, generatePostflopQuestion, judgePostflop, solvePostflopQuestion,
  type PostflopActionInfo, type PostflopJudgement, type PostflopQuestion, type PostflopStreet, type PotType,
} from '../../lib/drill/postflopDrill'
import type { SolutionSource } from '../../types/solver'
import { TermChips, ConceptLink } from '../common/TermChips'

const XP_CORRECT = 8
const XP_WRONG = 3

// ポストフロップで関連する用語 (GLOSSARY に無いものは TermChips が黙って除外)。
const POSTFLOP_TERMS = ['レンジ優位', 'ナッツ優位', 'Cベット', 'ブロッカー', 'エクイティ実現', 'ポラライズ', 'IP', 'OOP']

// 出題スポットに応じた関連理論コンセプト (deep-link 先)。
function conceptForSpot(q: PostflopQuestion): string {
  return q.heroIsOOP ? 'cbet-oop' : 'cbet-ip'
}

// source 信頼度を 1語で添える (C8)。solver_live=簡易求解・参考値 / precomputed=厳密解。
function sourceWord(source: SolutionSource | null): string {
  if (source === 'solver_precomputed') return '厳密解'
  if (source === 'solver_live') return '簡易求解・参考値'
  return '参考値'
}

type StreetMode = PostflopStreet | 'mix'

const STREET_JP: Record<PostflopStreet, string> = { flop: 'フロップ', turn: 'ターン', river: 'リバー' }

const fmtEv = (ev: number) => (Number.isFinite(ev) ? `${ev > 0 ? '+' : ''}${ev.toFixed(2)}BB` : '—')

function situationText(q: PostflopQuestion): string {
  if (q.facingRaise) return 'あなたのベットがレイズされた'
  if (q.facing) return '相手のベットに直面'
  return q.heroIsOOP ? 'あなたが先に行動' : '相手がチェック'
}

// hero の位置を平易な言葉で示すバッジ (色 + 文言で色覚配慮)。
function PositionBadge({ oop }: { oop: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold border ${
      oop ? 'bg-amber-950/50 border-amber-500/50 text-amber-200' : 'bg-sky-950/50 border-sky-500/50 text-sky-200'}`}>
      <span aria-hidden="true">{oop ? '◀' : '▶'}</span>
      あなた: {oop ? 'OOP（先に行動・不利な位置）' : 'IP（後に行動・有利な位置）'}
    </span>
  )
}

function pickStreet(mode: StreetMode): PostflopStreet | undefined {
  return mode === 'mix' ? undefined : mode
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

// solver_live はライブ求解。信頼度バッジを正直に表示 (CLAUDE.md 設計ルール1)。
function SourceBadge({ source }: { source: SolutionSource | null }) {
  if (source === 'solver_live') {
    return <span className="text-amber-300/90">△ GTOソルバー解 (ローカル求解・簡易アブストラクション)</span>
  }
  if (source === 'solver_precomputed') {
    return <span className="text-emerald-300/80">✓ GTOソルバー解 (事前計算)</span>
  }
  return <span className="text-zinc-500">参考値</span>
}

const POT_KEY_JP: Record<PotType, string> = { srp: 'SRP', '3bet': '3bet' }

export function PostflopDrillPanel() {
  const addXP = useProgressStore(s => s.addXP)
  const recordDrill = useDrillStore(s => s.recordDrill)
  const [streetMode, setStreetMode] = useState<StreetMode>('flop')
  const [potType, setPotType] = useState<PotType>('srp')
  const [question, setQuestion] = useState<PostflopQuestion>(() =>
    generatePostflopQuestion(Math.random, pickStreet('flop'), 'srp'))
  // solving/solved/error は question に追随。リセットは出題ハンドラ側で行い、
  // effect 内では async コールバックでのみ setState する (set-state-in-effect 回避)。
  const [solved, setSolved] = useState<{ all: PostflopActionInfo[]; source: SolutionSource } | null>(null)
  const [solving, setSolving] = useState(true)
  const [error, setError] = useState(false)
  const [judgement, setJudgement] = useState<PostflopJudgement | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  // 出題ごとに採番。求解は async なので、古い問題の結果が新しい問題に紛れ込まないよう判定する。
  const reqId = useRef(0)

  // 問題が変わるたびに自前 CFR で求解 (Worker)。最新リクエストのみ反映。
  useEffect(() => {
    const id = ++reqId.current
    let cancelled = false
    solvePostflopQuestion(question)
      .then(res => {
        if (cancelled || id !== reqId.current) return
        if (!res) { setError(true); setSolving(false); return }
        setSolved(res)
        setSolving(false)
      })
      .catch(() => { if (!cancelled && id === reqId.current) { setError(true); setSolving(false) } })
    return () => { cancelled = true }
  }, [question])

  const next = useCallback((mode = streetMode, pt = potType) => {
    setJudgement(null)
    setSolving(true)
    setError(false)
    setSolved(null)
    setQuestion(generatePostflopQuestion(Math.random, pickStreet(mode), pt))
  }, [streetMode, potType])

  const onAnswer = (action: PlayerAction) => {
    if (judgement || !solved) return
    const j = judgePostflop(solved.all, solved.source, action)
    setJudgement(j)
    setStats(s => ({ answered: s.answered + 1, correct: s.correct + (j.correct ? 1 : 0) }))
    addXP(j.correct ? XP_CORRECT : XP_WRONG)
    recordDrill({
      kind: 'postflop',
      bucketKey: `${question.potType}:${question.street}`,
      bucketLabel: `${POT_KEY_JP[question.potType]}·${STREET_JP[question.street]}`,
      correct: j.correct, chosen: action, evLoss: evLossFrom(solved.all, action),
    })
  }

  const changeStreet = (mode: StreetMode) => { setStreetMode(mode); next(mode, potType) }
  const changePotType = (pt: PotType) => { setPotType(pt); next(streetMode, pt) }

  const best = judgement?.best ?? []
  const recommend = best
    .map(x => `${x.label} ${Math.round(x.freq * 100)}%`)
    .join(' / ')
  const isMixed = best.length > 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-2 gap-x-2 sm:gap-x-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">ポット</span>
          <Seg active={potType === 'srp'} onClick={() => changePotType('srp')}>シングルレイズド</Seg>
          <Seg active={potType === '3bet'} onClick={() => changePotType('3bet')}>3betポット</Seg>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">ストリート</span>
          <Seg active={streetMode === 'flop'} onClick={() => changeStreet('flop')}>フロップ</Seg>
          <Seg active={streetMode === 'turn'} onClick={() => changeStreet('turn')}>ターン</Seg>
          <Seg active={streetMode === 'river'} onClick={() => changeStreet('river')}>リバー</Seg>
          <Seg active={streetMode === 'mix'} onClick={() => changeStreet('mix')}>ミックス</Seg>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">ポストフロップ ドリル</span>
        <span className="font-data text-zinc-300">
          {stats.correct} / {stats.answered} 正解
          {stats.answered > 0 && <span className="text-zinc-500"> ({Math.round((stats.correct / stats.answered) * 100)}%)</span>}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-base-800/60 p-5 space-y-4">
        {/* 状況ヘッダー: スポット・ストリート・あなたの位置を明確に */}
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold text-zinc-100">
            {question.baseLabel} · {STREET_JP[question.street]}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <PositionBadge oop={question.heroIsOOP} />
            <span className="text-sm text-zinc-200">{situationText(question)}</span>
          </div>
        </div>

        {/* ポット文脈: ベット額がポット比で決まることを明示 (学習用) */}
        <p className="text-center font-data text-sm text-zinc-200">
          ポット {question.potBB}BB
          {question.facing && question.facedBetBB != null && (
            <span className="text-zinc-300">
              {' · '}相手のベット {question.facedBetBB}BB
              <span className="text-zinc-400"> (ポットの{Math.round((question.facedBetBB / question.potBB) * 100)}%)</span>
            </span>
          )}
          {question.facingRaise && question.heroBetBB != null && question.raiseToBB != null && (
            <span className="text-zinc-300">
              {' · '}あなたのベット {question.heroBetBB}BB → 相手のレイズ {question.raiseToBB}BB
            </span>
          )}
        </p>

        {/* C6: サイズラベルの読み方 (ポット比の意味と「手で変えない」原則) */}
        <p className="text-center text-[11px] text-zinc-500 -mt-2">
          GTOはポット比約2/3 (≈67%) が基本・手で変えない (読まれるため)。
        </p>

        {/* ボード */}
        <div className="flex items-center justify-center gap-1.5">
          {question.board.map((c, i) => <CardDisplay key={i} card={c} size="sm" />)}
        </div>

        {/* hero ハンド */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-zinc-500">あなた</span>
          <CardDisplay card={question.heroCards[0]} size="md" />
          <CardDisplay card={question.heroCards[1]} size="md" />
          <span className="ml-1 font-data text-xl font-bold text-brass-200">{question.heroHand}</span>
        </div>

        {solving ? (
          <p className="text-center text-sm text-zinc-400 py-3" role="status">
            <span className="inline-block animate-pulse">ソルバー求解中…</span>
          </p>
        ) : error || !solved ? (
          <div className="text-center space-y-2 py-2">
            <p className="text-sm text-zinc-400">このスポットは現在求解できません。</p>
            <button type="button" onClick={() => next()} className="min-h-10 px-5 rounded-xl brass font-display font-bold">
              次の問題 →
            </button>
          </div>
        ) : !judgement ? (
          <div className="flex flex-wrap justify-center gap-2">
            {solved.all.map(o => (
              <button
                key={o.action} type="button" onClick={() => onAnswer(o.action)}
                className="min-h-12 px-5 rounded-xl font-display font-bold bg-base-900 border border-white/10 hover:border-brass-400 hover:text-brass-200 transition-colors"
              >{o.label}</button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl p-3 text-center ${
              judgement.correct ? 'bg-emerald-950/40 border border-emerald-500/40' : 'bg-rose-950/30 border border-rose-500/40'}`}>
              <p className={`font-display font-extrabold ${judgement.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                <span aria-hidden="true">{judgement.correct ? '✓' : '✗'}</span>{' '}
                {judgement.correct ? '正解' : `${ACTION_JP[judgement.chosen]} は不正解`}
              </p>
              <p className="text-sm text-zinc-300 mt-1">
                推奨: <span className="font-bold text-zinc-100">{recommend || 'チェック'}</span>
                {isMixed && <span className="ml-1 text-brass-300 font-bold">(どちらも正解)</span>}
              </p>
            </div>

            {solved && (
              <div className="rounded-lg bg-base-900/70 border border-brass-400/30 p-3 space-y-2">
                <p className="text-sm text-zinc-100 leading-relaxed">
                  <span aria-hidden="true" className="mr-1">💡</span>{explainPostflop(question, solved.all)}
                  <span className="text-zinc-400"> (基準: {sourceWord(solved.source)})</span>
                </p>
                <TermChips terms={POSTFLOP_TERMS} />
                <ConceptLink conceptId={conceptForSpot(question)} />
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2 text-sm">
              {judgement.all.map(info => (
                <span key={info.action} className="px-2.5 py-1 rounded-lg bg-base-900 border border-white/10 font-data text-zinc-200">
                  {info.label} <span className="text-zinc-400">{Math.round(info.freq * 100)}%</span>
                  {' · '}<span className={Number.isFinite(info.ev) && info.ev >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmtEv(info.ev)}</span>
                </span>
              ))}
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
        正解 +{XP_CORRECT}XP / 挑戦 +{XP_WRONG}XP。基準: <SourceBadge source={solved?.source ?? null} />。
        ベット額はポット比 (リードは約2/3ポット)。3betポットはポット ≈ 22.5BB・残り ≈ 89BB。
        フロップはショーダウンをエクイティ近似 (賭け未考慮)。ターンは river ベッティングを織り込む完全チャンスノード CFR (賭け考慮済・river 全48通り評価)。頻度10%以上の行動が正解 (ミックス対応)。
      </p>
    </div>
  )
}
