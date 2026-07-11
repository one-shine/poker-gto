import { useEffect, useMemo, useState } from 'react'
import type { Card } from '../../types/game'
import type { RangeScenario } from '../../types/ranges'
import { RANKS, SUITS, parseCards } from '../../engine/cards/Card'
import { CardDisplay } from '../game/CardDisplay'
import { computeRangeEquityAsync } from '../../lib/equity/equityClient'
import type { RangeEquityResult, SideDistribution, WeightedCategory } from '../../lib/equity/rangeVsRange'

const ITERATIONS = 400

// レンジに「残る」コンボ (raise+call 頻度) を重み付きカテゴリに変換。
function continueRange(s: RangeScenario): WeightedCategory[] {
  return Object.entries(s.cells)
    .map(([hand, c]) => ({ hand, weight: c.raise + c.call }))
    .filter(x => x.weight > 0)
}

const PRESETS: { label: string; cards: string }[] = [
  { label: 'A高ドライ', cards: 'Ah 7d 2c' },
  { label: 'K高ドライ', cards: 'Ks 8h 3c' },
  { label: '両面ウェット', cards: 'Jh Ts 9d' },
  { label: 'モノトーン', cards: 'Qh 9h 5h' },
  { label: 'ペアボード', cards: '8s 8d 3h' },
  { label: 'ローボード', cards: '7c 5d 2h' },
]

function randomFlop(): Card[] {
  const deck: Card[] = []
  for (const r of RANKS) for (const s of SUITS) deck.push({ rank: r, suit: s })
  for (let i = 0; i < 3; i++) {
    const j = i + ((Math.random() * (deck.length - i)) | 0)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck.slice(0, 3)
}

const A_COLOR = '#fbbf24' // amber
const B_COLOR = '#38bdf8' // sky

// エクイティ分布ヒストグラム (10分位)。色だけに依存せず、横軸=エクイティ・縦棒の高さ=比率で読める。
function Histogram({ dist, color, max }: { dist: SideDistribution; color: string; max: number }) {
  return (
    <div>
      <div className="flex items-end gap-0.5 h-24" role="img" aria-label="エクイティ分布ヒストグラム">
        {dist.buckets.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end" title={`${i * 10}–${i * 10 + 10}% : ${(v * 100).toFixed(1)}%`}>
            <div
              className="w-full rounded-t-sm"
              style={{ height: `${max > 0 ? (v / max) * 100 : 0}%`, background: color, minHeight: v > 0 ? '2px' : '0' }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600 mt-1 font-data">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
    </div>
  )
}

function AdvantageBar({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const total = a + b || 1
  const pa = (a / total) * 100
  return (
    <div>
      <div className="flex h-6 rounded-md overflow-hidden ring-1 ring-white/10">
        <div className="flex items-center justify-start px-2 text-[11px] font-bold text-base-900" style={{ width: `${pa}%`, background: A_COLOR }}>
          {pa >= 18 && `${pa.toFixed(0)}%`}
        </div>
        <div className="flex items-center justify-end px-2 text-[11px] font-bold text-base-900" style={{ width: `${100 - pa}%`, background: B_COLOR }}>
          {100 - pa >= 18 && `${(100 - pa).toFixed(0)}%`}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
        <span className="truncate">A: {labelA}</span>
        <span className="truncate text-right">B: {labelB}</span>
      </div>
    </div>
  )
}

export function RangeEquityDistribution({ a, b }: { a: RangeScenario; b: RangeScenario }) {
  const [board, setBoard] = useState<Card[]>(() => parseCards(PRESETS[0].cards))
  const [result, setResult] = useState<RangeEquityResult | null>(null)
  const [loading, setLoading] = useState(false)

  const rangeA = useMemo(() => continueRange(a), [a])
  const rangeB = useMemo(() => continueRange(b), [b])
  const boardKey = board.map(c => c.rank + c.suit[0]).join('')

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 計算開始時のローディング表示
    setLoading(true)
    computeRangeEquityAsync({ rangeA, rangeB, board, iterations: ITERATIONS, seed: 1 })
      .then(r => { if (!cancelled) { setResult(r); setLoading(false) } })
      .catch(() => { if (!cancelled) { setResult(null); setLoading(false) } })
    return () => { cancelled = true }
    // boardKey で実質的な変化のみ再計算 (board 配列参照は毎回変わるため)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeA, rangeB, boardKey])

  const ok = result && result.runouts > 0 && result.a.comboCount > 0 && result.b.comboCount > 0
  const maxBucket = ok
    ? Math.max(...result.a.buckets, ...result.b.buckets, 0.0001)
    : 0.0001
  const advLabel = ok
    ? (result.a.avgEquity > result.b.avgEquity ? 'A' : 'B')
    : null

  return (
    <div className="rounded-xl border border-brass-500/20 bg-base-800/40 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-display font-bold text-zinc-100">ボード上のエクイティ分布</h3>
        <div className="flex items-center gap-1">
          {board.map((c, i) => <CardDisplay key={i} card={c} size="sm" />)}
        </div>
      </div>

      {/* ボード選択 */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map(p => {
          const active = boardKey === parseCards(p.cards).map(c => c.rank + c.suit[0]).join('')
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setBoard(parseCards(p.cards))}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                active ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setBoard(randomFlop())}
          className="px-2.5 py-1 rounded text-xs font-semibold bg-brass-600/30 text-brass-200 hover:bg-brass-600/50 transition-colors"
        >
          🎲 ランダム
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-6 justify-center">
          <span className="inline-block w-3 h-3 border-2 border-brass-400/40 border-t-brass-300 rounded-full animate-spin" />
          エクイティを計算中…
        </div>
      )}

      {!loading && !ok && (
        <p className="text-xs text-zinc-500 py-4 text-center">
          このレンジ/ボードではエクイティを算出できません (空レンジ等)。
        </p>
      )}

      {!loading && ok && (
        <div className="space-y-4">
          {/* レンジ優位 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-400">レンジ優位 (平均エクイティ)</span>
              <span className="text-xs font-bold" style={{ color: advLabel === 'A' ? A_COLOR : B_COLOR }}>
                {advLabel} が優位
              </span>
            </div>
            <AdvantageBar a={result.a.avgEquity} b={result.b.avgEquity} labelA={a.label} labelB={b.label} />
          </div>

          {/* ナッツ優位 */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-base-900/50 p-2.5">
              <div className="text-zinc-500 mb-1">ナッツ級比率 (エクイティ80%+)</div>
              <div className="flex items-center justify-between font-data">
                <span style={{ color: A_COLOR }}>A {(result.a.nutShare * 100).toFixed(0)}%</span>
                <span style={{ color: B_COLOR }}>B {(result.b.nutShare * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="rounded-lg bg-base-900/50 p-2.5">
              <div className="text-zinc-500 mb-1">弱い手比率 (エクイティ20%-)</div>
              <div className="flex items-center justify-between font-data">
                <span style={{ color: A_COLOR }}>A {(result.a.weakShare * 100).toFixed(0)}%</span>
                <span style={{ color: B_COLOR }}>B {(result.b.weakShare * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* 分布ヒストグラム */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs mb-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: A_COLOR }} />
                <span className="text-zinc-300 truncate">A: {a.label}</span>
                <span className="text-zinc-500 ml-auto font-data">平均 {(result.a.avgEquity * 100).toFixed(1)}%</span>
              </div>
              <Histogram dist={result.a} color={A_COLOR} max={maxBucket} />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs mb-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: B_COLOR }} />
                <span className="text-zinc-300 truncate">B: {b.label}</span>
                <span className="text-zinc-500 ml-auto font-data">平均 {(result.b.avgEquity * 100).toFixed(1)}%</span>
              </div>
              <Histogram dist={result.b} color={B_COLOR} max={maxBucket} />
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-500 leading-snug border-t border-white/10 pt-3">
        ※ 横軸=相手レンジに対するエクイティ、縦棒=そのエクイティ帯に入るコンボ比率。
        flop/turn は {ITERATIONS} 回のモンテカルロ近似 (river は厳密)。入力レンジは GTO理論準拠の近似のため参考値です。
      </p>
    </div>
  )
}
