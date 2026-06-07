import type { EquityUnavailableReason } from '../../lib/equity/opponentRange'

// equity=null の理由を1行で説明 (透明性: 「壊れている」ではなく「出せない局面」と伝える)。
const EQUITY_REASON_JP: Record<EquityUnavailableReason, string> = {
  no_opponent: '相手がいないため勝率は出せません',
  limped: 'リンプ(未オープン)で相手レンジが定まらないため勝率は出せません',
  fourbet_plus: '4bet 以上の応酬は未対応のため勝率は出せません',
  uncovered_line: '未収録の対戦ライン(相手レンジ不明)のため勝率は出せません',
  sampling_failed: '相手レンジと手札の衝突で勝率を算出できません',
}

// U18: オッズ基準の目安。GTO 解の有無に関わらず併記する(GTO が本筋・これは単純化の目安)。
//  - コール直面: ポットオッズ / 必要勝率 vs 実勝率 → コール有利 / フォールド寄り。
//  - コール無し(チェック/ベット先頭): エクイティの強弱目安(GTOのベット/チェック判断とは別)。
// SpotPanel 内で「1回だけ」描画する共有部品(考え方/答え合わせの重複を解消)。
export function OddsGuide({ callAmount, reqEquity, equity, eqLoading, effPot, reference, reason }: {
  callAmount: number; reqEquity: number; equity: number | null; eqLoading: boolean; effPot: number
  reference?: boolean // true = マルチウェイの参考勝率 (厳密でない・設計ルール4)
  reason?: EquityUnavailableReason // equity=null の理由 (透明性)
}) {
  const eqText = eqLoading ? '計算中…' : equity != null ? `${Math.round(equity * 100)}%` : '—'
  const reasonText = !eqLoading && equity == null && reason ? EQUITY_REASON_JP[reason] : null
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
      {/* 勝率が出せない局面はその理由を1行で明示 (「壊れている」誤解を防ぐ・透明性) */}
      {reasonText && (
        <p className="mt-1 text-[10px] text-zinc-500 leading-snug">
          <span aria-hidden="true">ℹ️ </span>{reasonText}
        </p>
      )}
      {/* 理論/用語リンクは持たない: SpotPanel の「関連理論・用語」に集約 (重複・散在を避ける)。 */}
    </div>
  )
}
