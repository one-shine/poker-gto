import { useEffect, useRef } from 'react'
import type { ActionRequiredPayload } from '../../engine/agents/AgentBus'
import { getTotalPot } from '../../engine/game/BettingEngine'
import { handCategory } from '../../engine/cards/handCategory'
import { HERO_ID } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSolution } from '../../hooks/useSolution'
import { useEquity } from '../../hooks/useEquity'
import { StrategyBars } from './StrategyBars'
import { TermChips, ConceptLink } from '../common/TermChips'
import type { PlayerAction } from '../../types/game'

const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}

// U18: オッズ基準の目安。GTO 解の有無に関わらず常時併記する(GTO が本筋・これは単純化の目安)。
//  - コール直面: ポットオッズ / 必要勝率 vs 実勝率 → コール有利 / フォールド寄り。
//  - コール無し(チェック/ベット先頭): エクイティの強弱目安(GTOのベット/チェック判断とは別)。
function OddsGuide({ callAmount, reqEquity, equity, eqLoading, effPot, reference }: {
  callAmount: number; reqEquity: number; equity: number | null; eqLoading: boolean; effPot: number
  reference?: boolean // true = マルチウェイの参考勝率 (厳密でない・設計ルール4)
}) {
  const eqText = eqLoading ? '計算中…' : equity != null ? `${Math.round(equity * 100)}%` : '—'
  // マルチウェイ(相手2人以上)の勝率は全相手レンジ vs hero の参考値。実現は割り引かれる。
  const eqLabel = reference ? 'あなたの勝率(参考)' : 'あなたの勝率'
  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-2 text-xs">
      <p className="font-bold text-sky-300 mb-0.5">
        <span aria-hidden="true">📐 </span>オッズ目安(GTO頻度ではありません)
      </p>
      {callAmount > 0 ? (
        // コール直面: ポットオッズ/必要勝率は算術なので常に、判定は勝率が出たら添える。
        <p className="text-zinc-300 leading-snug">
          ポットオッズ <span className="font-data text-zinc-100">{(effPot / callAmount).toFixed(1)} : 1</span>
          {' / '}必要勝率 <span className="font-data font-bold text-emerald-300">{Math.round(reqEquity * 100)}%</span>
          {' / '}{eqLabel} <span className="font-data font-bold">{eqText}</span>
          {/* マルチウェイ(参考値)では断定的なコール判定を出さない。生の勝率 vs ポットオッズは
              背後の未行動プレイヤー・含意オッズ・実現割引を無視するため誤誘導になる(ルール1)。 */}
          {equity != null && !reference && (
            <>{' → '}
              <span className={equity >= reqEquity ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'}>
                {equity >= reqEquity ? '✓ コール有利' : '✗ フォールド寄り'}
              </span>
            </>
          )}
          <span className="block text-[10px] text-zinc-500 mt-0.5">
            {reference
              ? '※ マルチウェイの参考勝率(相手レンジ近似)。背後のプレイヤー・含意オッズ・実現割引のため、必要勝率より高い勝率が要る → コール判定は出さず参考数値のみ'
              : '※ 単純なコール判断の目安(含意オッズ等は未考慮)'}
          </span>
        </p>
      ) : (
        // チェック/ベット先頭: コール判断は無いのでエクイティの強弱目安。
        <p className="text-zinc-300 leading-snug">
          {eqLabel} <span className="font-data font-bold">{eqText}</span>
          {equity != null && (
            <>{' → '}
              <span className={equity >= 0.55 ? 'text-emerald-300 font-bold' : equity >= 0.45 ? 'text-sky-300 font-bold' : 'text-rose-300 font-bold'}>
                {equity >= 0.55 ? '強い(バリュー寄り)' : equity >= 0.45 ? '中庸' : '弱い(慎重に)'}
              </span>
            </>
          )}
          <span className="block text-[10px] text-zinc-500 mt-0.5">
            {reference ? '※ マルチウェイのため相手レンジ近似の参考勝率(厳密でない)' : '※ 大まかなエクイティ目安(GTO判断とは別)'}
          </span>
        </p>
      )}
      {/* オッズ学習への導線: pot-odds 理論 + 用語チップ */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ConceptLink conceptId="pot-odds" label="オッズの理論 ▶" />
        <TermChips terms={['ポットオッズ', '必要勝率', 'エクイティ']} />
      </div>
    </div>
  )
}

interface Props {
  pending: ActionRequiredPayload
  allowLiveSolve: boolean
  // 設定時: 「アクション後の答え合わせ」モード (U8)。事前ではなく自分が打った後に表示するので
  // 精度サンプルからは除外しない。値 = 自分が選んだアクション (ヘッダに併記)。
  revealActed?: PlayerAction
}

// study モードの GTO 戦略パネル (頻度バー)。
// 既定 (revealActed なし): アクション直下に表示し、答えを見せるのでこのハンドを精度サンプルから除外 (markHinted)。
// revealActed あり: 自分が打った「後」の答え合わせ。事前に見せていないので markHinted しない (U8)。
// U18: GTO 戦略の下に「オッズ目安」(OddsGuide) を常時併記する。
export function LiveStrategyPanel({ pending, allowLiveSolve, revealActed }: Props) {
  const markHinted = useSessionStore(s => s.markHinted)
  // 設計ルール4: 表示はマルチウェイでも HU レンジを「参考値」として出す (精度計算には入れない)。
  const { node, loading } = useSolution(pending.state, HERO_ID, allowLiveSolve, true)
  // R8/U18: エクイティ。オッズ目安を常時併記する(コール直面=必要勝率比較 / チェック局面=強弱目安)ため常時有効化。
  // マルチウェイ(相手2人以上)は reference=true の参考勝率として出す(設計ルール4)。
  const { equity, loading: eqLoading, reference: eqReference } = useEquity(pending.state, HERO_ID, true)

  const hero = pending.state.players.find(p => p.id === HERO_ID)
  const handKey = hero?.holeCards ? handCategory(hero.holeCards) : null

  // 事前表示=答えを見せるので、表示できたハンドは精度サンプルから除外。
  // ただし答え合わせ (revealActed) は打った後なので除外しない (実力測定を保つ・U8)。
  const hintedRef = useRef<string | null>(null)
  useEffect(() => {
    if (revealActed) return
    const id = pending.state.handId
    if (node && handKey && node.strategy[handKey] && hintedRef.current !== id) {
      hintedRef.current = id
      markHinted(id)
    }
  }, [node, handKey, pending.state.handId, markHinted, revealActed])

  // A2: ポットオッズ / 必要勝率 (純算術。コールが必要なときのみ)
  const callAmount = pending.callAmount
  const effPot = getTotalPot(pending.state) + pending.state.players.reduce((s, p) => s + p.currentBetBB, 0)
  const reqEquity = callAmount > 0 ? callAmount / (effPot + callAmount) : 0

  const strategy = node && handKey ? node.strategy[handKey] ?? null : null
  // 対象外の理由説明用: フォールドしていない参加者数 (3+ = マルチウェイ)
  const activeCount = pending.state.players.filter(p => !p.isFolded).length

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-brass-500/25 bg-base-800/85 backdrop-blur-md p-3 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-brass-300 flex items-center gap-1.5 flex-wrap">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="0.5" /><rect x="12" y="7" width="3" height="10" rx="0.5" /><rect x="17" y="13" width="3" height="4" rx="0.5" /></svg>
          {revealActed ? '答え合わせ — GTO 戦略' : 'GTO 戦略'}
          {revealActed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-700 text-zinc-200 border border-white/10 font-normal">
              あなた: <span className="font-bold text-zinc-100">{ACTION_JP[revealActed]}</span>
            </span>
          )}
          {handKey && node && <span className="text-zinc-400 font-normal">{handKey} @ {node.spotId}</span>}
          {node?.multiwayReference && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 font-normal" title="3人以上(マルチウェイ)。ヘッズアップのレンジを参考表示しています(厳密解ではない・精度測定対象外)。">
              マルチウェイ=参考値
            </span>
          )}
        </span>
        {node && node.source === 'approximate' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">参考: GTO近似</span>
        )}
        {node && node.source === 'approximate_with_ev' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">GTO近似 + 概算EV</span>
        )}
      </div>

      {loading ? (
        <span className="text-xs text-brass-300/80 flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-brass-400/40 border-t-brass-300 animate-spin" />
          GTO解を求めています…
        </span>
      ) : !node || !strategy ? (
        <div className="space-y-2">
          <span className="block text-xs text-zinc-500">
            GTO 解の<strong className="text-zinc-400">対象外</strong>
            <span className="text-zinc-600">{activeCount >= 3 ? '(マルチウェイ)' : '(未収録スポット)'}</span>
          </span>
          {/* 対象外でも、オッズ目安は主表示として出す (U18)。マルチウェイは参考勝率。 */}
          <OddsGuide callAmount={callAmount} reqEquity={reqEquity} equity={equity} eqLoading={eqLoading} effPot={effPot} reference={eqReference} />
        </div>
      ) : (
        <div className="space-y-2">
          {/* マルチウェイは HU レンジの EV が当てはまらないため EV は出さない (参考値・ルール4)。 */}
          <StrategyBars
            strategy={strategy}
            source={node.source}
            showEv={!node.multiwayReference && node.source !== 'approximate'}
            approxEv={!node.multiwayReference && node.source === 'approximate_with_ev'}
          />
          {node.multiwayReference && (
            <p className="text-[11px] text-amber-300/80 leading-snug">
              ※ 3人以上(マルチウェイ)のため、相手レイザーに対する<strong className="text-amber-200">ヘッズアップのレンジを参考</strong>として表示しています。
              実際の最適頻度はこれより気持ちタイトになります。厳密解ではないため精度測定には含めません。
            </p>
          )}
          {/* U18: GTO 解があるときも、オッズ目安をバーの下に副表示で常時併記 (GTO が本筋)。 */}
          <OddsGuide callAmount={callAmount} reqEquity={reqEquity} equity={equity} eqLoading={eqLoading} effPot={effPot} reference={eqReference} />
        </div>
      )}
    </div>
  )
}
