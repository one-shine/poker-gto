import { motion, useReducedMotion } from 'framer-motion'
import type { Player, PlayerAction } from '../../types/game'
import { CardDisplay } from './CardDisplay'

export interface SeatLastAction {
  action: PlayerAction
  amountBB: number
}

interface PlayerSeatProps {
  player: Player
  isActing?: boolean
  // 相手のホールカードを表向きにするか (ショーダウン / studyモードのフォールド公開)
  revealCards?: boolean
  lastAction?: SeatLastAction | null
  isWinner?: boolean // ショーダウンの勝者ハイライト (B3)
  compact?: boolean  // モバイル: ヒーローカードを一回り小さく (重なり回避・R28)
  // B6: ハンドごとに変わる識別子 (handId)。これを key に混ぜて配布アニメを毎ハンド再生する。
  dealKey?: string
}

const ACTION_LABEL: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}

// アクション種別ごとの色 + アイコン (色のみ非依存)。視認性のため塗りで強調する。
const ACTION_STYLE: Record<PlayerAction, { icon: string; cls: string }> = {
  fold:  { icon: '✕', cls: 'bg-zinc-700/90 text-zinc-200 border-zinc-500' },
  check: { icon: '✓', cls: 'bg-sky-700/90 text-sky-50 border-sky-400/60' },
  call:  { icon: '✓', cls: 'bg-sky-700/90 text-sky-50 border-sky-400/60' },
  raise: { icon: '▲', cls: 'bg-emerald-700/90 text-emerald-50 border-emerald-400/60' },
  allin: { icon: '★', cls: 'bg-brass-500 text-ink border-brass-300' },
}

const formatBB = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

function actionText(la: SeatLastAction): string {
  const amt = la.amountBB > 0 ? ` ${formatBB(la.amountBB)}BB` : ''
  return `${ACTION_LABEL[la.action]}${amt}`
}

export function PlayerSeat({ player, isActing = false, revealCards = false, lastAction, isWinner = false, compact = false, dealKey }: PlayerSeatProps) {
  const reduceMotion = useReducedMotion()
  // モバイル(compact)は卓が小さいので Hero も sm に抑え、左右席との重なり・はみ出しを防ぐ (U10)。
  const cardSize = player.isHero ? (compact ? 'sm' : 'lg') : (compact ? 'xs' : 'sm')
  // ヒーローは常に自分の手札を見る。相手は revealCards のときだけ表向き。
  const faceDown = !player.isHero && !revealCards
  const las = lastAction ? ACTION_STYLE[lastAction.action] : null

  return (
    <motion.div
      className={[
        'relative flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl w-fit',
        'bg-base-800/80 backdrop-blur-sm border transition-all duration-300',
        isWinner ? 'border-amber-300' : player.isHero ? 'border-brass-500/40' : 'border-white/8',
        player.isFolded ? 'opacity-40 saturate-50' : 'opacity-100',
        isWinner
          ? 'shadow-[0_0_0_2px_rgba(252,211,77,0.9),0_0_30px_rgba(252,211,77,0.5)]'
          : isActing ? 'shadow-[0_0_0_1px_rgba(212,175,55,0.6),0_0_22px_rgba(212,175,55,0.35)]' : 'shadow-lg shadow-black/40',
      ].join(' ')}
      animate={isWinner ? { scale: [1, 1.06, 1] } : isActing ? { y: [0, -2, 0] } : { y: 0 }}
      transition={
        isWinner ? { duration: 0.6, repeat: 2, ease: 'easeInOut' }
        : isActing ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0.2 }
      }
      aria-label={`${player.position} ${formatBB(player.stackBB)}BB${player.isHero ? ' (あなた)' : ''}${isWinner ? ' 勝者' : ''}`}
    >
      {/* B3: 勝者バッジ (色 + テキストで色覚配慮) */}
      {isWinner && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-px rounded-full bg-amber-300 text-ink font-display text-[10px] font-extrabold tracking-wide shadow-[0_2px_8px_rgba(252,211,77,0.6)] whitespace-nowrap z-10">
          WINNER
        </span>
      )}
      {/* 手番リング: ブラスの回転発光 */}
      {isActing && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-xl ring-1 ring-brass-400/70"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {/* B5: 控えめな「手番」の時間表現。ゆっくり一周するブラスのスイープ弧をループ。
          完全に装飾 (カウントダウン/自動フォールドの圧は付けない・study トレーナーのため)。
          色覚配慮: 動き + 既存の「手番中」テキスト/発光リングが本体の合図。reduced-motion では出さない。 */}
      {isActing && !reduceMotion && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-xl"
          style={{
            // 細いブラスのスイープ弧 (リング外周をなぞる)。conic で 1/4 周だけ発光。
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(212,175,55,0.55) 320deg, rgba(244,209,107,0.95) 350deg, transparent 360deg)',
            WebkitMask:
              'radial-gradient(closest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
            mask: 'radial-gradient(closest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {isActing && <span className="sr-only">手番中</span>}

      {/* ヒーローを一目で識別できる「あなた」リボン (勝者バッジと重なるときは省略) */}
      {player.isHero && !isWinner && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-px rounded-full brass font-display text-[10px] font-extrabold tracking-wide shadow-[0_2px_6px_rgba(0,0,0,0.5)] whitespace-nowrap">
          あなた
        </span>
      )}

      {/* B6: ホール配布アニメ。ボード配布 (PokerTable) と一貫した opacity+y+rotateY のスタッガー。
          key に dealKey(handId) を混ぜることで毎ハンド再マウントされ配布が再生される。
          reduced-motion では静的描画。aria/role は CardDisplay 側で不変 (テスト契約保持)。 */}
      <div className={`flex gap-1 ${player.isHero ? 'mt-1' : ''}`}>
        {(player.holeCards ?? [null, null]).map((c, i) =>
          reduceMotion ? (
            <CardDisplay key={i} card={c} faceDown={faceDown} size={cardSize} />
          ) : (
            <motion.div
              key={`${dealKey ?? 'deal'}-${i}`}
              initial={{ opacity: 0, y: -14, rotateY: 90 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ duration: 0.32, delay: i * 0.1, ease: 'easeOut' }}
            >
              <CardDisplay card={c} faceDown={faceDown} size={cardSize} />
            </motion.div>
          ),
        )}
      </div>

      <div className="flex items-center gap-1">
        <span
          className={`px-1.5 py-0.5 rounded text-[11px] font-bold font-display tracking-wide ${
            player.isHero ? 'brass' : 'bg-base-700 text-zinc-200'
          }`}
        >
          {player.position}
        </span>
        <span className="font-data text-xs text-zinc-100 font-bold">{formatBB(player.stackBB)}</span>
        <span className="font-data text-[9px] text-zinc-500">BB</span>
      </div>

      {/* 直近アクション / オールイン — 塗りバッジ + 変化時にポップ */}
      <div className="h-5 flex items-center">
        {player.isAllIn ? (
          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full border bg-brass-500 text-ink border-brass-300 flex items-center gap-0.5 shadow">
            <span aria-hidden="true">★</span> オールイン
          </span>
        ) : lastAction && las ? (
          <motion.span
            key={`${lastAction.action}-${lastAction.amountBB}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap ${las.cls}`}
          >
            <span aria-hidden="true">{las.icon} </span>
            {actionText(lastAction)}
          </motion.span>
        ) : null}
      </div>
    </motion.div>
  )
}
