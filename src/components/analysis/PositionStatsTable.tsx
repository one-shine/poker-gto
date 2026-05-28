import type { ActionRecord } from '../../types/game'
import type { MistakeRecord } from '../../types/stats'
import { MIN_SAMPLE_SIZE } from '../../types/stats'
import { aggregatePositionStats, estimateAccuracy } from '../../lib/analysis/positionStats'
import { SampleSizeBadge } from '../stats/SampleSizeBadge'

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`
}

export function PositionStatsTable({ handHistory, mistakes }: { handHistory: ActionRecord[][]; mistakes: MistakeRecord[] }) {
  const rows = aggregatePositionStats(handHistory, mistakes)
  const anyHands = rows.some(r => r.hands > 0)

  if (!anyHands) {
    return <p className="text-sm text-zinc-500">まだプレイ記録がありません。Game でハンドをプレイすると集計されます。</p>
  }

  return (
    <div className="space-y-2">
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/10">
              <th className="text-left font-bold py-2 pr-2">ポジション</th>
              <th className="text-right font-bold py-2 px-2">ハンド</th>
              <th className="text-right font-bold py-2 px-2">VPIP</th>
              <th className="text-right font-bold py-2 px-2">PFR</th>
              <th className="text-right font-bold py-2 px-2">推定精度</th>
              <th className="text-right font-bold py-2 pl-2">EV損失</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const acc = estimateAccuracy(r)
              const low = r.decisions < MIN_SAMPLE_SIZE
              return (
                <tr key={r.position} className="border-b border-white/5">
                  <td className="py-2 pr-2 font-display font-bold text-zinc-200">{r.position}</td>
                  <td className="py-2 px-2 text-right font-data text-zinc-300">{r.hands}</td>
                  <td className="py-2 px-2 text-right font-data text-zinc-300">{pct(r.vpip, r.hands)}</td>
                  <td className="py-2 px-2 text-right font-data text-zinc-300">{pct(r.pfr, r.hands)}</td>
                  <td className="py-2 px-2 text-right">
                    <span className="inline-flex items-center gap-1.5 justify-end">
                      <span className="font-data text-emerald-300">{acc == null ? '—' : `${Math.round(acc * 100)}%`}</span>
                      {r.decisions > 0 && low && <SampleSizeBadge n={r.decisions} />}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-right font-data text-rose-300">{r.evLost > 0 ? `-${r.evLost.toFixed(1)}` : '0'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">
        推定精度 = (HU判断数 − ミス数) / HU判断数。マルチウェイ(3人以上)は精度の母数から除外しています(参考値)。
        判断数が {MIN_SAMPLE_SIZE} 未満は「データ不足」です。
      </p>
    </div>
  )
}
