import { useState } from 'react'
import type { CoachFeedback } from '../../types/coach'
import type { MistakeCategory, MistakeSeverity } from '../../types/stats'
import { CATEGORY_EXPLAIN, conceptIdForCategory } from '../../lib/coach/coachConcepts'
import { TermChips, ConceptLink } from '../common/TermChips'
import { StrategyDetail } from './StrategyDetail'

// 重大度ごとの見出し (色 + 形状で色覚配慮)。
const SEVERITY: Record<MistakeSeverity, { icon: string; label: string; cls: string }> = {
  critical: { icon: '◆', label: 'ブランダー', cls: 'text-rose-300' },
  major: { icon: '▲', label: 'ミス', cls: 'text-amber-300' },
  minor: { icon: '●', label: 'インアキュラシー', cls: 'text-yellow-300' },
}

// カテゴリ別に関連する用語チップ (A10)。GLOSSARY に無い語は TermChips が黙って除外する。
const CATEGORY_TERMS: Record<MistakeCategory, string[]> = {
  preflop_too_wide: ['レンジ', 'ポジション', 'RFI'],
  preflop_too_tight: ['RFI', 'ポジション', 'オープン'],
  preflop_passive: ['オープン', 'リンプ', 'バリューベット'],
  preflop_sizing: ['オープン', 'ポラライズ'],
  fold_to_3bet: ['3bet', '4bet', 'ブラフ'],
  call_3bet_oop: ['3bet', 'OOP', 'エクイティ実現'],
  blind_defense_wide: ['BB', 'ポットオッズ', 'エクイティ実現'],
  blind_defense_tight: ['BB', 'ポットオッズ', 'レンジ'],
  sb_limp: ['SB', 'リンプ', 'OOP'],
  missed_cbet_ip: ['Cベット', 'IP', 'レンジ優位'],
  cbet_oop_too_wide: ['Cベット', 'OOP', 'レンジ優位'],
  check_ip_missed_value: ['IP', 'バリューベット', 'シンバリュー'],
  oop_donk_bet: ['ドンクベット', 'レンジ優位', 'OOP'],
  bluff_frequency: ['ブラフ', 'ポラライズ', 'ブロッカー'],
  value_bet_missed: ['バリューベット', 'シンバリュー', 'ブラフキャッチ'],
}

// 頻出/重大カテゴリ向けの「次はこう」prescriptive な一言 (A7)。
const NEXT_TIME: Record<MistakeCategory, string> = {
  preflop_too_wide: '次は前ポジションほどレンジを締める。弱い手は降りる。',
  preflop_too_tight: '次は良いポジションでもう一段広くオープンする。',
  preflop_passive: '次は主導権を取れる手はコールでなくレイズで開く。',
  preflop_sizing: '次は手の強弱でサイズを変えず標準値で統一する。',
  fold_to_3bet: '次は3betに一定割合 (4bet/コール) で続行レンジを残す。',
  call_3bet_oop: '次はOOPの3betコールを絞り、難しい手は4betか降りる。',
  blind_defense_wide: '次はオッズが良くても実現率の低い手は守らない。',
  blind_defense_tight: '次はBBをワイドに守る (目安50%以上)。',
  sb_limp: '次はSBはリンプでなくレイズか降りるかで入る。',
  missed_cbet_ip: '次はレンジ優位ボードで小さく高頻度にCベットを打つ。',
  cbet_oop_too_wide: '次はOOPは打つボードを絞り、チェックを多く混ぜる。',
  check_ip_missed_value: '次はIPで薄いバリューも取りにベットする。',
  oop_donk_bet: '次はコール側からのリードを控え、まずチェックする。',
  bluff_frequency: '次はバリューとブラフを適正比で混ぜる。',
  value_bet_missed: '次は続行レンジに負ける手があるならバリューを打つ。',
}

// A3: 実解 (showEv) かつ EV差が大きいとき、推奨手とあなたの手の EV を1行で対比する。
// approximate は EV を出さない (ルール1) ので null。
function evBreakdownLine(feedback: CoachFeedback): string | null {
  if (!feedback.showEv || feedback.strategy.length === 0) return null
  const best = Math.max(...feedback.strategy.map(s => s.ev))
  const mine = feedback.strategy.find(
    s => s.action === feedback.chosen || (feedback.chosen === 'allin' && s.action === 'raise'),
  )
  if (mine == null) return null
  if (best - mine.ev <= 0.5) return null
  const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}BB`
  return `推奨 ${fmt(best)} vs あなた ${fmt(mine.ev)}`
}

// ミス時のフィードバックカード本体。EV損失(実解時)と推奨を示す。
// 枠/背景は親 CoachPanel が head.cls で付与するので、ここでは中身のみ描画する。
export function MistakeCard({ feedback }: { feedback: CoachFeedback }) {
  const [expanded, setExpanded] = useState(false)
  const sev = SEVERITY[feedback.severity ?? 'minor']
  const category = feedback.category
  const explain = category ? CATEGORY_EXPLAIN[category] : null
  const conceptId = category ? conceptIdForCategory(category) : null
  const terms = category ? CATEGORY_TERMS[category] : []
  const evBreakdown = evBreakdownLine(feedback)

  return (
    <>
      <span className={`flex items-center gap-2 font-display font-extrabold ${sev.cls}`}>
        <span aria-hidden="true" className="text-lg">{sev.icon}</span>
        {sev.label}
        {explain && <span className="text-xs font-bold text-zinc-400">· {explain.label}</span>}
        {feedback.showEv && (
          <span className="font-data text-sm font-bold">-{feedback.evLoss.toFixed(1)}BB</span>
        )}
      </span>
      <p className="text-sm text-zinc-200 leading-relaxed my-2">{feedback.message}</p>

      {/* A3: アクション別 EV 内訳 (実解・差>0.5BB のみ)。 */}
      {evBreakdown && (
        <p className="font-data text-xs text-zinc-400 mb-2">{evBreakdown}</p>
      )}

      {/* A9: 背景説明の折りたたみ (概念の why + 次はこう)。コア文は簡潔に保つ。 */}
      {explain && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 min-h-7 text-xs font-bold text-zinc-300 hover:text-zinc-100"
          >
            <span aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
            背景説明
          </button>
          {expanded && (
            <div className="mt-1.5 rounded-lg bg-black/20 p-2.5 text-xs leading-relaxed text-zinc-300 space-y-1.5">
              <p>{explain.why}</p>
              {category && (
                <p className="text-brass-200">
                  <span aria-hidden="true">👉 </span>{NEXT_TIME[category]}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <StrategyDetail feedback={feedback} />

      {/* A10: 用語チップ + 関連理論へのディープリンク。 */}
      {(terms.length > 0 || conceptId) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {terms.length > 0 && <TermChips terms={terms} />}
          {conceptId && <ConceptLink conceptId={conceptId} />}
        </div>
      )}
    </>
  )
}
