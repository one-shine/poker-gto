import type { ActionRecord } from '../../types/game'
import type { MistakeRecord } from '../../types/stats'
import { MIN_SAMPLE_SIZE } from '../../types/stats'
import { aggregatePositionStats, estimateAccuracy } from '../../lib/analysis/positionStats'
import { SampleSizeBadge } from '../stats/SampleSizeBadge'
import { useSessionStore } from '../../stores/sessionStore'

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`
}

export function PositionStatsTable({ handHistory, mistakes }: { handHistory: ActionRecord[][]; mistakes: MistakeRecord[] }) {
  // R20: ポジション別の精度は「コーチが実評価した判断」を母数にする (未評価/ヒント参照は除外)。
  const evalByPosition = useSessionStore(s => s.evalByPosition)
  const rows = aggregatePositionStats(handHistory, mistakes, evalByPosition)
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
              <th className="text-right font-bold py-2 px-2">GTO精度</th>
              <th className="text-right font-bold py-2 pl-2">EV損失</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const acc = estimateAccuracy(r)
              const sample = r.evaluated ?? 0 // 精度の母数 = コーチ実評価数
              const low = sample < MIN_SAMPLE_SIZE
              return (
                <tr key={r.position} className="border-b border-white/5">
                  <td className="py-2 pr-2 font-display font-bold text-zinc-200">{r.position}</td>
                  <td className="py-2 px-2 text-right font-data text-zinc-300">{r.hands}</td>
                  <td className="py-2 px-2 text-right font-data text-zinc-300">{pct(r.vpip, r.hands)}</td>
                  <td className="py-2 px-2 text-right font-data text-zinc-300">{pct(r.pfr, r.hands)}</td>
                  <td className="py-2 px-2 text-right">
                    <span className="inline-flex items-center gap-1.5 justify-end">
                      <span className="font-data text-emerald-300">{acc == null ? '—' : `${Math.round(acc * 100)}%`}</span>
                      {sample > 0 && low && <SampleSizeBadge n={sample} />}
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
        GTO精度 = 正解数 / コーチ評価数。コーチが実際に評価した HU スポットのみが母数で、
        マルチウェイ(3人以上)・未評価スポット・ヒント参照ハンドは除外します(楽観計上しない)。
        評価数が {MIN_SAMPLE_SIZE} 未満は「データ不足」です。
      </p>
    </div>
  )
}
