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

// C1: セル内を頻度比でスタック塗り(下から raise→call→fold)。混合戦略が一目でわかる。
function cellStyle(cell: RangeCell | undefined): React.CSSProperties {
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
}

export function RangeGrid({ scenario }: Props) {
  const hasCall = Object.values(scenario.cells).some(c => c.call > 0)

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
              const folded = !cell || cell.fold >= 1
              return (
                <div
                  key={`${row}-${col}`}
                  style={cellStyle(cell)}
                  className={`relative aspect-square flex items-center justify-center text-[11px] font-data font-bold rounded-[3px] border border-black/30 select-none cursor-default ${
                    folded ? 'text-zinc-500' : 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]'
                  }`}
                  title={cellTitle(hand, cell)}
                >
                  {hand}
                  {/* 色覚配慮: 行動トークンを角に併記 */}
                  {token && (
                    <span className="absolute top-0 right-0.5 text-[8px] font-extrabold opacity-90 leading-none">{token}</span>
                  )}
                </div>
              )
            }),
          ])}
        </div>
      </div>

      {/* Legend — 色 + トークン (R/C/M) 併記で色覚配慮 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
        <span className="font-semibold text-zinc-300">凡例:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-extrabold text-white" style={{ background: RAISE_COLOR }}>R</span>
          {hasCall ? '3-Bet' : 'レイズ'}
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
    </div>
  )
}
