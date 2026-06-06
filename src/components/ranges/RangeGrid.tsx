import type { RangeCell, RangeScenario } from '../../types/ranges'

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']

function handName(row: number, col: number): string {
  if (row === col) return RANKS[row] + RANKS[row]
  if (row < col)  return RANKS[row] + RANKS[col] + 's'
  return RANKS[col] + RANKS[row] + 'o'
}

// 行動ごとの色 (GTO Wizard 流のスプリット塗り)。R=緑 / C=青 / F=暗灰。
const RAISE_COLOR = '#16a34a' // green-600
const CALL_COLOR = '#2563eb'  // blue-600
const FOLD_COLOR = '#27272a'  // zinc-800

// U6: 頻度ヒートマップの表示モード。'off'=従来のスプリット塗り / 'raise'|'call'=単一指標の濃淡。
export type HeatmapMode = 'off' | 'raise' | 'call'

const metricFreq = (cell: RangeCell | undefined, mode: HeatmapMode): number =>
  !cell ? 0 : mode === 'call' ? cell.call : cell.raise

// 暗→指標色を頻度 t で線形補間 (0=暗灰, 1=満色)。ダーク背景上なので文字は白で可読。
function lerpHex(from: string, to: string, t: number): string {
  const ch = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16))
  const a = ch(from), b = ch(to)
  const k = Math.max(0, Math.min(1, t))
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return `rgb(${m[0]},${m[1]},${m[2]})`
}

// C1: セル内を頻度比でスタック塗り(下から raise→call→fold)。混合戦略が一目でわかる。
// U6: heatmap モードでは指標(raise|call)頻度を暗→色の濃淡1色で塗る(分布が一目)。
function cellStyle(cell: RangeCell | undefined, heatmap: HeatmapMode): React.CSSProperties {
  if (heatmap !== 'off') {
    const color = heatmap === 'call' ? CALL_COLOR : RAISE_COLOR
    return { background: lerpHex(FOLD_COLOR, color, metricFreq(cell, heatmap)) }
  }
  if (!cell || cell.fold >= 1) return { background: FOLD_COLOR }
  const { raise, call, fold } = cell
  const stops: string[] = []
  let acc = 0
  const seg = (color: string, freq: number) => {
    if (freq <= 0) return
    stops.push(`${color} ${(acc * 100).toFixed(1)}%`, `${color} ${((acc + freq) * 100).toFixed(1)}%`)
    acc += freq
  }
  seg(RAISE_COLOR, raise)
  seg(CALL_COLOR, call)
  seg(FOLD_COLOR, fold)
  return { backgroundImage: `linear-gradient(to top, ${stops.join(', ')})` }
}

function cellTitle(hand: string, cell: RangeCell | undefined): string {
  if (!cell || cell.fold >= 1) return `${hand}: Fold 100%`
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const parts: string[] = []
  if (cell.raise > 0) parts.push(`Raise ${pct(cell.raise)}`)
  if (cell.call  > 0) parts.push(`Call ${pct(cell.call)}`)
  if (cell.fold  > 0) parts.push(`Fold ${pct(cell.fold)}`)
  return `${hand}: ${parts.join(' / ')}`
}

// 色のみに依存しないための行動トークン (CLAUDE.md ルール5)。R=レイズ C=コール M=ミックス。
function actionToken(cell: RangeCell | undefined): string {
  if (!cell || cell.fold >= 1) return ''
  if (cell.raise > 0 && cell.call > 0) return 'M'
  if (cell.raise > 0) return 'R'
  if (cell.call > 0) return 'C'
  return ''
}

interface Props {
  scenario: RangeScenario
  heatmap?: HeatmapMode // U6: 既定 'off'=従来塗り。RangeVsRange 等は省略で従来描画。
}

export function RangeGrid({ scenario, heatmap = 'off' }: Props) {
  const hasCall = Object.values(scenario.cells).some(c => c.call > 0)
  // 対3bet スポット(opener応答)では raise=4bet。それ以外で call を含む=3bet。
  const raiseLabel = scenario.id.endsWith('-3bet') ? '4-Bet' : hasCall ? '3-Bet' : 'レイズ'
  const heatColor = heatmap === 'call' ? CALL_COLOR : RAISE_COLOR
  const heatLabel = heatmap === 'call' ? 'コール頻度' : raiseLabel + '頻度'

  return (
    <div className="space-y-3">
      {/* Grid — コンテナ幅にフィットしてレスポンシブ拡大。狭幅では横スクロール。 */}
      <div className="overflow-auto touch-action-auto">
        <div
          className="w-full max-w-[44rem] min-w-[22rem]"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(1.4rem,1.6rem) repeat(13, minmax(0,1fr))', gap: '2px' }}
        >
          {/* Header row */}
          <div />
          {RANKS.map(r => (
            <div key={r} className="flex items-center justify-center text-xs font-data text-brass-300/80 font-bold pb-0.5">
              {r}
            </div>
          ))}

          {/* Data rows — flat array to avoid Fragment key issues */}
          {RANKS.flatMap((rowRank, row) => [
            <div key={`label-${row}`} className="flex items-center justify-center text-xs font-data text-brass-300/80 font-bold">
              {rowRank}
            </div>,
            ...RANKS.map((_, col) => {
              const hand = handName(row, col)
              const cell = scenario.cells[hand]
              const token = actionToken(cell)
              const heatF = heatmap !== 'off' ? metricFreq(cell, heatmap) : 0
              // 色覚配慮: heatmap では色の濃淡だけに依らず頻度%を角に併記、通常時は R/C/M トークン。
              const corner = heatmap !== 'off' ? (heatF > 0 ? `${Math.round(heatF * 100)}` : '') : token
              const dim = heatmap !== 'off' ? heatF <= 0 : (!cell || cell.fold >= 1)
              return (
                <div
                  key={`${row}-${col}`}
                  style={cellStyle(cell, heatmap)}
                  className={`relative aspect-square flex items-center justify-center text-[11px] font-data font-bold rounded-[3px] border border-black/30 select-none cursor-default ${
                    dim ? 'text-zinc-500' : 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]'
                  }`}
                  title={cellTitle(hand, cell)}
                >
                  {hand}
                  {corner && (
                    <span className="absolute top-0 right-0.5 text-[8px] font-extrabold opacity-90 leading-none">{corner}</span>
                  )}
                </div>
              )
            }),
          ])}
        </div>
      </div>

      {/* Legend (heatmap) — グラデバー + 0/50/100% 目盛りで色覚配慮 */}
      {heatmap !== 'off' ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-300">{heatLabel}:</span>
          <span className="flex items-center gap-1.5">
            <span className="text-zinc-500">0%</span>
            <span
              className="h-3 w-28 rounded-sm border border-black/30"
              style={{ backgroundImage: `linear-gradient(to right, ${FOLD_COLOR}, ${heatColor})` }}
            />
            <span className="text-zinc-300 font-semibold">100%</span>
          </span>
          <span className="text-zinc-500 italic">濃いほど高頻度 / 角の数字 = その行動の頻度%</span>
        </div>
      ) : (
      /* Legend (通常) — 色 + トークン (R/C/M) 併記で色覚配慮 */
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
        <span className="font-semibold text-zinc-300">凡例:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-extrabold text-white" style={{ background: RAISE_COLOR }}>R</span>
          {raiseLabel}
        </span>
        {hasCall && (
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-extrabold text-white" style={{ background: CALL_COLOR }}>C</span>
            コール
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-extrabold text-white" style={{ background: FOLD_COLOR }}>F</span>
          フォールド
        </span>
        <span className="flex items-center gap-1.5">
          {/* スプリット塗りの見本: 下半分R・上半分C */}
          <span className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-extrabold text-white"
            style={{ backgroundImage: `linear-gradient(to top, ${RAISE_COLOR} 0%, ${RAISE_COLOR} 50%, ${CALL_COLOR} 50%, ${CALL_COLOR} 100%)` }}>M</span>
          ミックス
        </span>
        <span className="ml-1 text-zinc-500 italic">セル内の塗り分け = 各行動の頻度比 / 角の R·C·M は主行動</span>
      </div>
      )}
    </div>
  )
}
