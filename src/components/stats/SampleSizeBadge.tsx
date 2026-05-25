import { MIN_SAMPLE_SIZE } from '../../types/stats'

interface Props {
  n: number
}

// N表示と信頼度バッジ。N<20 で「データ不足」警告 (色 + ✓/⚠ 形状で色覚配慮)。
export function SampleSizeBadge({ n }: Props) {
  const ok = n >= MIN_SAMPLE_SIZE
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-data font-bold ${
        ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'
      }`}
      title={ok ? '十分なサンプル数' : `データ不足 (N<${MIN_SAMPLE_SIZE})`}
    >
      <span aria-hidden="true">{ok ? '✓' : '⚠'}</span>
      N={n}
    </span>
  )
}
