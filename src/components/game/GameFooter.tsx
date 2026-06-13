import { useEffect, useState } from 'react'
import type { SolutionSource } from '../../types/solver'
import { useSettingsStore } from '../../stores/settingsStore'
import { useGameStore } from '../../stores/gameStore'

interface GameFooterProps {
  // 現在表示中スポットの解の出典。null = 解未取得 (データ準備中)
  source?: SolutionSource | null
}

// source ごとの信頼度表記。ⓘ/✓/△ で色のみ非依存 (CLAUDE.md ルール5)
const SOURCE_INFO: Record<SolutionSource, { icon: string; label: string; cls: string }> = {
  solver_precomputed: { icon: '✓', label: 'GTOソルバー解', cls: 'text-emerald-300' },
  solver_live: { icon: '✓', label: 'GTOソルバー解 (ローカル求解·簡易)', cls: 'text-sky-300' },
  approximate_with_ev: { icon: '△', label: 'GTO近似レンジ + 概算EV (手作り戦略·サブゲームEV/近似)', cls: 'text-amber-300' },
  approximate: { icon: '△', label: 'GTO近似レンジ (一般理論ベースの手作り)', cls: 'text-amber-300' },
}

export function GameFooter({ source }: GameFooterProps) {
  const stackMode = useSettingsStore(s => s.stackMode)
  const buyInBB = useSettingsStore(s => s.buyInBB)
  const opponentMode = useSettingsStore(s => s.opponentMode)
  const effectiveStackBB = useGameStore(s => s.effectiveStackBB)
  const [open, setOpen] = useState(false)
  // 実効スタック。解は100BB前提なので、ここから外れると精度が下がる旨を正直に出す (honest-display)。
  const effective = stackMode === 'cash' ? effectiveStackBB : buyInBB
  const stackDrift = effective < 90 || effective > 110

  // Escape で詳細モーダルを閉じる
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const src = source ? SOURCE_INFO[source] : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="前提条件の詳細を開く"
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border-t border-zinc-800 tabular-nums"
      >
        <span aria-hidden="true">ⓘ</span>
        <span>
          {stackMode === 'cash'
            ? `6-max キャッシュ · 持ち越し · 実効 ${effective}BB · ノーレーク`
            : `6-max キャッシュゲーム · 各ハンド${buyInBB}BBスタート · ノーレーク · ICM非考慮`}
        </span>
        {stackDrift && (
          <>
            <span className="text-zinc-600" aria-hidden="true">·</span>
            <span className="text-amber-300" title="本アプリの解は100BB前提。実効スタックが100BBから外れるとSPRが変わりGTO評価がずれます。">
              <span aria-hidden="true">△ </span>実効{effective}BB(精度低下)
            </span>
          </>
        )}
        {src && (
          <>
            <span className="text-zinc-600" aria-hidden="true">·</span>
            <span className={src.cls}>
              <span aria-hidden="true">{src.icon} </span>
              {src.label}
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="前提条件の詳細"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-md w-full rounded-xl bg-zinc-900 border border-zinc-700 p-5 text-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-zinc-100">前提条件</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="min-h-11 min-w-11 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <dl className="flex flex-col gap-2.5">
              <Item term="用途">
                教育・学習用のシミュレーションです。
                <span className="text-zinc-100 font-semibold">実際の金銭の賭け・換金・賞金は一切ありません。</span>
                「GTO Wizard」「PokerSnowie」等とは無関係・非提携です(各社の商標)。
              </Item>
              <Item term="ゲーム形式">
                6-max ノーリミットホールデム · キャッシュゲーム
              </Item>
              <Item term="スタック方式">
                {stackMode === 'cash' ? (
                  <>
                    キャッシュ繰り越し: バイイン {buyInBB}BB。前ハンドの終了スタックを次に持ち越し、バストで自動リバイ。
                    <span className="text-amber-300"> 実効スタックが100BBから外れるとSPRが変わりGTO評価がずれます</span>
                    (本アプリの解は100BB前提)。
                  </>
                ) : (
                  <>
                    リセット: 各ハンド開始時に全員 {buyInBB}BB に戻ります (GTO評価が最もクリーン)。
                    {buyInBB !== 100 && <span className="text-amber-300"> 100BB以外は取込解の前提から外れ精度が下がります。</span>}
                  </>
                )}
              </Item>
              <Item term="レーキ">
                0% (ノーレーク) として求解。実戦のレーキは未考慮。
              </Item>
              <Item term="ICM">
                非考慮。チップEV基準のため、トーナメント終盤の学習用途には不向き。
              </Item>
              <Item term="解の出典">
                {src ? (
                  <span className={src.cls}>
                    <span aria-hidden="true">{src.icon} </span>
                    {src.label}
                  </span>
                ) : (
                  <span className="text-zinc-400">このスポットはデータ準備中</span>
                )}
                <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">
                  ✓ = 本物のソルバー解 / △ = GTO近似レンジ (一般理論ベースの手作り)。
                  スポットごとに信頼度が変わります。
                </p>
              </Item>
              <Item term="対戦相手">
                {opponentMode === 'trainer' ? (
                  <>
                    GTO (trainer): 相手は上記「解の出典」と同じ解を頻度サンプリングして打ちます。
                    <span className="text-zinc-400"> 相手の精度もバッジと同じで、△ のスポットでは相手も GTO近似で打ちます</span>
                    (真のGTOボットではありません)。
                  </>
                ) : (
                  <>Fish (exploit): リーク持ちの相手。固定解との突合は「GTO近似に照らすと」の参考値です。</>
                )}
              </Item>
            </dl>
          </div>
        </div>
      )}
    </>
  )
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold text-zinc-500">{term}</dt>
      <dd className="text-zinc-200 leading-relaxed">{children}</dd>
    </div>
  )
}
