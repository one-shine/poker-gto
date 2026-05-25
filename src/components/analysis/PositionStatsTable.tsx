import type { Position } from '../../types/game'
import type { ActionRecord } from '../../types/game'
import type { MistakeRecord } from '../../types/stats'
import { MIN_SAMPLE_SIZE } from '../../types/stats'
import { HERO_ID } from '../../stores/gameStore'
import { SampleSizeBadge } from '../stats/SampleSizeBadge'

const POSITIONS: Position[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']

interface Row {
  position: Position
  hands: number
  decisions: number   // HU でのヒーロー判断数 (精度の母数)
  vpip: number
  pfr: number
  mistakes: number
  evLost: number
}

// handHistory(アクション列)+ mistakes から、ポジション別の実績を集計する。
// マルチウェイ(villain 2人以上)は GTO 精度の母数から除外 (CLAUDE.md ルール4)。
function aggregate(handHistory: ActionRecord[][], mistakes: MistakeRecord[]): Row[] {
  const rows = new Map<Position, Row>()
  for (const p of POSITIONS) {
    rows.set(p, { position: p, hands: 0, decisions: 0, vpip: 0, pfr: 0, mistakes: 0, evLost: 0 })
  }

  for (const hand of handHistory) {
    const heroPos = hand[0]?.heroPosition
    if (!heroPos) continue
    const r = rows.get(heroPos)!
    r.hands++

    const heroActs = hand.filter(a => a.playerId === HERO_ID)
    const pre = heroActs.filter(a => a.street === 'preflop')
    if (pre.some(a => a.action === 'call' || a.action === 'raise' || a.action === 'allin')) r.vpip++
    if (pre.some(a => a.action === 'raise' || a.action === 'allin')) r.pfr++
    // HU 判断のみ精度母数に
    r.decisions += heroActs.filter(a => a.villainPositions.length <= 1).length
  }

  for (const m of mistakes) {
    const r = rows.get(m.position)
    if (!r) continue
    r.mistakes++
    r.evLost += m.evLoss
  }

  return POSITIONS.map(p => rows.get(p)!)
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`
}

export function PositionStatsTable({ handHistory, mistakes }: { handHistory: ActionRecord[][]; mistakes: MistakeRecord[] }) {
  const rows = aggregate(handHistory, mistakes)
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
              const acc = r.decisions > 0 ? (r.decisions - r.mistakes) / r.decisions : null
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
