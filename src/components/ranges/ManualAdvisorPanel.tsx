import { useMemo, useState } from 'react'
import type { Card, Position } from '../../types/game'
import type { SpotKey } from '../../types/solver'
import { parseCards, cardToString } from '../../engine/cards/Card'
import { handCategory } from '../../engine/cards/handCategory'
import { comboKey } from '../../lib/solver/riverRanges'
import {
  buildManualSpotKey,
  validPreflopHeroPositions,
  validPreflopVillainPositions,
  validPostflopPairs,
  type ManualStreet,
  type PreflopContext,
  type FacingAction,
  type ManualUncoveredReason,
} from '../../lib/solver/manualSpot'
import { useManualAdvice } from '../../hooks/useManualAdvice'
import { recommendedSolution, actionSizeLabel, recommendLabel } from '../../lib/coach/recommendation'
import type { ActionSolution, SolutionSource } from '../../types/solver'
import { StrategyBars } from '../coach/StrategyBars'
import { OddsGuide } from '../coach/OddsGuide'

// 手作り近似はレンジ外(=降り100%)の手をデータから省く。収録スポットで handKey 無し=フォールド100%。
const FOLD_ONLY: ActionSolution[] = [{ action: 'fold', frequency: 1, ev: 0 }]

const STREETS: [ManualStreet, string][] = [
  ['preflop', 'プリフロップ'], ['flop', 'フロップ'], ['turn', 'ターン'], ['river', 'リバー'],
]
const PREFLOP_CONTEXTS: [PreflopContext, string][] = [
  ['rfi', 'オープン(自分が最初)'], ['vs_open', 'オープンに対応'], ['vs_3bet', '3betされた(自分がオープン)'],
]
const BOARD_NEED: Record<ManualStreet, number> = { preflop: 0, flop: 3, turn: 4, river: 5 }

const REASON_JP: Record<ManualUncoveredReason, string> = {
  no_scenario: 'この位置の組み合わせは収録レンジにありません(対象外)',
  sb_srp: 'SB のシングルレイズ・ポストフロップは盲対盲の反転のため未対応です(3betポットは可)',
  three_bet_pair_unsupported: 'この 3bet ポットのペアは未収録です(対象外)',
  invalid_cards: 'カードが重複しています(手札同士、または手札と盤面)',
  need_board: '盤面のカード枚数が足りません',
  invalid_bet: '相手のベット額を入力してください',
}

function PosRow({ label, options, value, onChange }: {
  label: string; options: Position[]; value: Position; onChange: (p: Position) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-500 w-20 shrink-0">{label}</span>
      {options.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={`px-3 min-h-9 rounded text-sm font-bold transition-colors ${
            value === p ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

function Seg<T extends string>({ options, value, onChange }: {
  options: [T, string][]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`px-3 min-h-9 rounded-lg text-sm font-bold transition-colors ${
            value === v ? 'brass' : 'bg-base-800 text-zinc-400 hover:text-zinc-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// 解の信頼度ラベル(設計ルール1: source を正直に明示・"GTO最適" は使わない)。
function sourceBadge(source: SolutionSource): string {
  switch (source) {
    case 'solver_precomputed': return 'GTOソルバー解(事前計算)'
    case 'solver_live': return 'GTOソルバー解(ローカル求解・簡易アブストラクション)'
    case 'approximate_with_ev': return 'GTO近似 + 概算EV'
    case 'approximate': return '参考: GTO近似'
  }
}

export function ManualAdvisorPanel() {
  const [street, setStreet] = useState<ManualStreet>('river')
  const [preflopContext, setPreflopContext] = useState<PreflopContext>('vs_open')
  const [potType, setPotType] = useState<'srp' | '3bet'>('srp')
  const [heroPos, setHeroPos] = useState<Position>('BB')
  const [villainPos, setVillainPos] = useState<Position>('BTN')
  const [heroText, setHeroText] = useState('As Ks')
  const [boardText, setBoardText] = useState('Ah 8d 3c 5s Qh')
  const [facing, setFacing] = useState<FacingAction>('check')
  const [betText, setBetText] = useState('4')
  const [potText, setPotText] = useState('6')
  const [stackText, setStackText] = useState('100')

  const [spot, setSpot] = useState<SpotKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonstandardBet, setNonstandardBet] = useState(false)

  const isPreflop = street === 'preflop'

  // 有効な位置の選択肢(収録レンジのある組み合わせだけを出す=対象外を事実上発生させない)。
  const heroOptions = useMemo<Position[]>(() => {
    if (isPreflop) return validPreflopHeroPositions(preflopContext)
    return [...new Set(validPostflopPairs(potType).map(p => p.hero))]
  }, [isPreflop, preflopContext, potType])

  const villainOptions = useMemo<Position[]>(() => {
    if (isPreflop) return validPreflopVillainPositions(preflopContext, heroPos)
    return [...new Set(validPostflopPairs(potType).filter(p => p.hero === heroPos).map(p => p.villain))]
  }, [isPreflop, preflopContext, potType, heroPos])

  // hero/villain が現在の選択肢から外れたら先頭へ寄せる。
  const safeHero = heroOptions.includes(heroPos) ? heroPos : heroOptions[0]
  const safeVillain = villainOptions.includes(villainPos) ? villainPos : (villainOptions[0] ?? villainPos)

  const advice = useManualAdvice(spot)

  function onSubmit() {
    setError(null)
    let heroCards: [Card, Card]
    try {
      const hc = parseCards(heroText)
      if (hc.length !== 2) throw new Error()
      heroCards = [hc[0], hc[1]]
    } catch {
      setSpot(null); setError('自分の2枚を正しく入力してください(例: As Ks)'); return
    }
    let board: Card[] = []
    if (!isPreflop) {
      try { board = parseCards(boardText) } catch {
        setSpot(null); setError('盤面を正しく入力してください(例: Ah Kd 7s)'); return
      }
    }
    const res = buildManualSpotKey({
      street, heroPos: safeHero, villainPos: safeVillain, heroCards,
      preflopContext, potType, board, facing,
      villainBetBB: Number(betText) || 0,
      potBB: Number(potText) || 0,
      effStackBB: Number(stackText) || 100,
    })
    if (!res.ok) { setSpot(null); setError(REASON_JP[res.reason]); return }
    setSpot(res.spot)
    setNonstandardBet(!!res.nonstandardBet)
  }

  // --- 結果の戦略抽出(preflop=handCategory / postflop=comboKey でキー切替) ---
  const node = advice.node
  const key = spot?.heroCards
    ? (spot.street === 'preflop' ? handCategory(spot.heroCards) : comboKey(spot.heroCards))
    : null
  const rawStrategy = node && key ? node.strategy[key] ?? null : null
  // preflop の収録スポットで handKey 無し = レンジ外 = フォールド100%(降りの手はデータ省略)。
  const foldOut = !rawStrategy && !!node && node.street === 'preflop' &&
    (node.source === 'approximate' || node.source === 'approximate_with_ev')
  const strategy = rawStrategy ?? (foldOut ? FOLD_ONLY : null)
  const recommended = strategy ? recommendedSolution(strategy) : null

  // オッズ(被ベット時のみコール判断・それ以外は勝率の強弱)。
  const callAmount = spot?.riverBetBB != null && spot.riverBetBB > 0 ? spot.riverBetBB : 0
  const effPot = (spot?.potBB ?? 0) + callAmount
  const reqEquity = callAmount > 0 ? callAmount / (effPot + callAmount) : 0

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-zinc-400">
          盤面・自分の2枚・状況を設定して、その1ハンドのおすすめプレイ(頻度)と勝率・ポットオッズを表示します。
          ヘッズアップ(1対1)前提です。
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          答えの信頼度は状況で異なります(下に正直に表示)。「GTO最適」とは断定しません。
        </p>
      </div>

      {/* --- 設定フォーム --- */}
      <div className="space-y-3 rounded-xl border border-white/5 bg-base-900/40 p-3">
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">ストリート</span>
          <Seg options={STREETS} value={street} onChange={setStreet} />
        </div>

        {isPreflop ? (
          <div className="space-y-1">
            <span className="text-xs text-zinc-500">状況</span>
            <Seg options={PREFLOP_CONTEXTS} value={preflopContext} onChange={setPreflopContext} />
          </div>
        ) : (
          <div className="space-y-1">
            <span className="text-xs text-zinc-500">ポット種別</span>
            <Seg options={[['srp', 'シングルレイズ'], ['3bet', '3betポット']] as ['srp' | '3bet', string][]}
              value={potType} onChange={setPotType} />
          </div>
        )}

        <PosRow label="自分の位置" options={heroOptions} value={safeHero} onChange={setHeroPos} />
        {!(isPreflop && preflopContext === 'rfi') && (
          <PosRow label="相手の位置" options={villainOptions} value={safeVillain} onChange={setVillainPos} />
        )}

        {!isPreflop && (
          <>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">
                盤面(コミュニティカード・{BOARD_NEED[street]}枚 例: Ah 8d 3c)
              </span>
              <input
                type="text" value={boardText} onChange={e => setBoardText(e.target.value)}
                className="w-full rounded-lg bg-base-800 border border-white/10 px-3 py-2 text-sm font-data text-zinc-100"
                placeholder="Ah 8d 3c 5s Qh"
              />
            </label>
            <div className="space-y-1">
              <span className="text-xs text-zinc-500">相手のアクション</span>
              <Seg options={[['check', 'チェックで回ってきた'], ['bet', 'ベットされた']] as [FacingAction, string][]}
                value={facing} onChange={setFacing} />
            </div>
            <div className="flex gap-3 flex-wrap">
              {facing === 'bet' && (
                <label className="space-y-1">
                  <span className="text-xs text-zinc-500">相手のベット額(BB)</span>
                  <input type="number" min={0} value={betText} onChange={e => setBetText(e.target.value)}
                    className="w-24 rounded-lg bg-base-800 border border-white/10 px-3 py-2 text-sm font-data text-zinc-100" />
                </label>
              )}
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">ポット(BB・ベット前)</span>
                <input type="number" min={0} value={potText} onChange={e => setPotText(e.target.value)}
                  className="w-24 rounded-lg bg-base-800 border border-white/10 px-3 py-2 text-sm font-data text-zinc-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">実効スタック(BB)</span>
                <input type="number" min={0} value={stackText} onChange={e => setStackText(e.target.value)}
                  className="w-24 rounded-lg bg-base-800 border border-white/10 px-3 py-2 text-sm font-data text-zinc-100" />
              </label>
            </div>
          </>
        )}

        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">自分の2枚(例: As Ks)</span>
          <input type="text" value={heroText} onChange={e => setHeroText(e.target.value)}
            className="w-full rounded-lg bg-base-800 border border-white/10 px-3 py-2 text-sm font-data text-zinc-100"
            placeholder="As Ks" />
        </label>

        <button type="button" onClick={onSubmit}
          className="brass min-h-11 px-5 rounded-lg text-sm font-bold">
          おすすめを見る
        </button>
        {street === 'turn' && (
          <p className="text-[11px] text-zinc-500">※ ターンの任意盤面はローカル求解で数秒かかることがあります。</p>
        )}
        {street === 'flop' && (
          <p className="text-[11px] text-zinc-500">※ フロップは代表ボードの事前計算解がある場合に頻度を表示します(それ以外は勝率のみ)。</p>
        )}
      </div>

      {/* --- 結果 --- */}
      {error && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          <span aria-hidden="true">⚠️ </span>{error}
        </p>
      )}

      {spot && !error && (
        <div className="space-y-3 rounded-xl border border-brass-500/25 bg-base-800/70 p-3">
          <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400">
            <span className="text-zinc-500">設定:</span>
            <span className="font-data text-zinc-200">{safeHero} vs {safeVillain}</span>
            <span className="font-data text-zinc-200">{STREETS.find(s => s[0] === street)?.[1]}</span>
            {!isPreflop && spot.board && (
              <span className="font-data text-zinc-200">{spot.board.map(cardToString).join(' ')}</span>
            )}
            <span className="font-data text-zinc-200">手札 {spot.heroCards?.map(cardToString).join(' ')}</span>
          </div>

          {/* GTO 頻度: flop は precomputed ヒット時のみ表示、未ヒット時は info のみ(正直表示) */}
          {street === 'flop' && !node ? (
            advice.loading ? (
              <span className="text-xs text-brass-300/80 flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-brass-400/40 border-t-brass-300 animate-spin" />
                GTO 解を確認しています…
              </span>
            ) : (
              <p className="text-xs text-zinc-400 leading-snug rounded-lg border border-sky-500/20 bg-sky-950/10 p-2">
                <span aria-hidden="true">ℹ️ </span>
                この盤面/スポットの事前計算解はありません。下の勝率・ポットオッズを目安にしてください(正直表示)。
              </p>
            )
          ) : advice.loading ? (
            <span className="text-xs text-brass-300/80 flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-brass-400/40 border-t-brass-300 animate-spin" />
              GTO 解を求めています…
            </span>
          ) : !node || !strategy ? (
            <p className="text-xs text-zinc-500">
              <strong className="text-zinc-400">解が出せませんでした</strong>
              <span className="text-zinc-600">(この盤面/手札では相手レンジが痩せて求解できません)</span>
            </p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-brass-300">GTO 戦略</span>
                {key && <span className="text-[10px] text-zinc-400">{key} @ {node.spotId}</span>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${node.source === 'solver_precomputed' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'}`}>
                  <span aria-hidden="true">{node.source === 'solver_precomputed' ? '✓ ' : '△ '}</span>{sourceBadge(node.source)}
                </span>
                {recommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-brass-500/15 text-brass-200 border border-brass-400/30 inline-flex items-center gap-1">
                    <span aria-hidden="true">★</span>
                    {recommendLabel(node.source)}: <span className="font-bold">{actionSizeLabel(recommended)}</span>
                  </span>
                )}
              </div>
              <StrategyBars
                strategy={strategy}
                source={node.source}
                showEv={!foldOut && node.source !== 'approximate'}
                approxEv={!foldOut && node.source === 'approximate_with_ev'}
                showRecommended
              />
              {node.source === 'solver_precomputed' && node.street === 'flop' && (
                <p className="text-[10px] text-zinc-500 leading-snug">
                  ※ フロップ事前計算解(ターン+リバーの賭けを完全列挙で織り込み済・exploitability {node.exploitability != null ? `~${(node.exploitability * 100).toFixed(2)}%` : '計算済'})。
                </p>
              )}
              {node.source === 'solver_live' && node.exploitability != null && (
                <p className="text-[10px] text-zinc-500 leading-snug">
                  ※ ローカル求解(簡易)。収束度 ~{Math.round(node.exploitability * 100)}%(小さいほど精度高)。
                  {node.street === 'turn' && (node.bettingAware ? ' ターンはリバーの賭けを考慮済。' : ' ')}
                </p>
              )}
              {nonstandardBet && (
                <p className="text-[10px] text-zinc-500 leading-snug">
                  ※ 入力したベット額は代表サイズ(約2/3ポット)と異なるため、そのサイズでローカル求解しています。
                </p>
              )}
            </div>
          )}

          {/* 勝率・ポットオッズ(全ストリート共通の目安) */}
          <OddsGuide
            callAmount={callAmount}
            reqEquity={reqEquity}
            equity={advice.equity}
            eqLoading={advice.eqLoading}
            effPot={effPot}
            reason={advice.eqReason}
          />
        </div>
      )}
    </div>
  )
}
