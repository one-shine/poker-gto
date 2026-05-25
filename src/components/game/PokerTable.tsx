import { motion } from 'framer-motion'
import type { ActionRecord, GameState } from '../../types/game'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useContainSize } from '../../hooks/useContainSize'
import { CardDisplay } from './CardDisplay'
import { PlayerSeat, type SeatLastAction } from './PlayerSeat'

// デスクトップ卓の最大幅 (px)。大画面では従来の max-w-4xl(896) より広げつつ過大化を防ぐ (R30)。
const DESKTOP_MAX_W = 1100

interface PokerTableProps {
  state: GameState
  winnerIds?: string[] // ショーダウンで勝った席をハイライト (B3)
}

type Pos = { left: number; top: number }

// seatIndex → テーブル上の絶対座標 (left%, top%)。ポジション名ではなく席で固定 (docs/PHASE_3.md)。
// ヒーロー(seat 0)を最も目立つ「下中央」に置き、残り5席を周回配置する。
// デスクトップ = 横長オーバル。狭幅では席が画面端で見切れるため mobile は縦長 + 内側に寄せる (R28)。
const SEAT_POS_DESKTOP: Record<number, Pos> = {
  0: { left: 50, top: 80 },
  1: { left: 12, top: 66 },
  2: { left: 9,  top: 28 },
  3: { left: 50, top: 9 },
  4: { left: 91, top: 28 },
  5: { left: 88, top: 66 },
}
const SEAT_POS_MOBILE: Record<number, Pos> = {
  0: { left: 50, top: 90 }, // 下中央 = Hero (下端へ)
  1: { left: 14, top: 60 }, // 左下 (カード xs で席幅が細いので外側へ)
  2: { left: 14, top: 25 }, // 左上
  3: { left: 50, top: 9 },  // 上中央
  4: { left: 86, top: 25 }, // 右上
  5: { left: 86, top: 60 }, // 右下
}

// 各席のベットチップ位置 = 席から中央(50,42)へ寄せた点。who-bet-what を felt 上に明示する。
function betPos(seat: number, posMap: Record<number, Pos>) {
  const s = posMap[seat]
  const t = 0.32 // 中央への寄せ率
  return { left: `${s.left + (50 - s.left) * t}%`, top: `${s.top + (42 - s.top) * t}%` }
}

const formatBB = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function PokerTable({ state, winnerIds }: PokerTableProps) {
  const isMobile = useIsMobile()
  // デスクトップは利用可能な幅×高さにフィットさせる (16/9・両制約で歪まず縮む)。モバイルは縦長 CSS のまま。
  const { ref: fitRef, size } = useContainSize(16 / 9, DESKTOP_MAX_W)
  const SEAT_POS = isMobile ? SEAT_POS_MOBILE : SEAT_POS_DESKTOP
  const showdown = state.street === 'showdown' || state.isHandComplete
  const winners = new Set(winnerIds ?? [])

  // 現ストリートの各プレイヤー直近アクション
  const lastByPlayer = new Map<string, ActionRecord>()
  for (const a of state.actionHistory) {
    if (a.street === state.street) lastByPlayer.set(a.playerId, a)
  }

  // B1: トータルポット = 確定ポット + 現ストリートの未回収ベット
  const liveBets = state.players.reduce((s, p) => s + p.currentBetBB, 0)
  const totalPot = state.pot.mainPotBB + liveBets

  return (
    <div ref={fitRef} className="w-full h-full flex items-center justify-center">
    <div
      className={isMobile
        ? 'relative w-full max-w-4xl aspect-[5/6]'
        : 'relative w-full max-w-[1100px] aspect-[16/9]'}
      style={!isMobile && size ? { width: size.w, height: size.h } : undefined}
    >
      {/* レール (外周の縁) — 暗い木革調 + ブラスのパイピング */}
      <div className="absolute inset-[2%] rounded-[50%] bg-gradient-to-b from-[#23282a] to-[#0e1211] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-black/60" />
      <div className="absolute inset-[3.2%] rounded-[50%] ring-1 ring-brass-600/30" />

      {/* フェルト面 — 照明付きラジアル + グレイン + 内側の落ち込み */}
      <div className="absolute inset-[5%] rounded-[50%] felt grain overflow-hidden shadow-[inset_0_4px_30px_rgba(0,0,0,0.55)]">
        {/* 中央の薄いマーキングリング */}
        <div className="absolute inset-[14%] rounded-[50%] border border-brass-400/10" />
      </div>

      {/* 中央: ポット (チップ + ラベル) + ボード */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
        style={{ left: '50%', top: isMobile ? '40%' : '42%' }}
      >
        {totalPot > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-sm border border-brass-500/30">
            {/* チップディスク (装飾・aria-hidden) */}
            <span aria-hidden="true" className="relative w-5 h-5">
              <span className="absolute inset-0 rounded-full bg-brass-400 border border-brass-600 shadow" />
              <span className="absolute inset-[3px] rounded-full border border-dashed border-base-900/50" />
            </span>
            {/* B1: 見出しは現ベット込みの総額。テスト契約「ポット {n}BB」は単一テキストノードで維持。 */}
            <span className="text-base text-brass-100 font-semibold tracking-wide tabular-nums">
              ポット {formatBB(totalPot)}BB
            </span>
            {liveBets > 0 && !isMobile && (
              <span className="text-[11px] text-brass-300/70 tabular-nums">
                (確定 {formatBB(state.pot.mainPotBB)} ＋ ベット {formatBB(liveBets)})
              </span>
            )}
          </div>
        )}
        <div className="flex gap-1 min-h-[2.5rem]">
          {state.board.map((c, i) => (
            <motion.div
              key={`${c.rank}-${c.suit}`}
              initial={{ opacity: 0, y: -10, rotateY: 90 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ duration: 0.35, delay: i * 0.08, ease: 'easeOut' }}
            >
              <CardDisplay card={c} size={isMobile ? 'sm' : 'md'} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* ベットチップ層: 各プレイヤーの現ベット額を felt 上に表示 (誰がいくら賭けたか一目で) */}
      {!showdown && state.players.map(p => {
        if (p.currentBetBB <= 0 || !SEAT_POS[p.seatIndex]) return null
        const bp = betPos(p.seatIndex, SEAT_POS)
        return (
          <motion.div
            key={`bet-${p.id}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-brass-500/40"
            style={{ left: bp.left, top: bp.top }}
            aria-hidden="true"
          >
            <span className="relative w-3.5 h-3.5 shrink-0">
              <span className="absolute inset-0 rounded-full bg-brass-400 border border-brass-600" />
              <span className="absolute inset-[2px] rounded-full border border-dashed border-base-900/60" />
            </span>
            <span className="font-data text-sm font-bold text-brass-100">{formatBB(p.currentBetBB)}</span>
          </motion.div>
        )
      })}

      {/* 各席 + ディーラーボタン */}
      {state.players.map(p => {
        const pos = SEAT_POS[p.seatIndex]
        if (!pos) return null
        const la = lastByPlayer.get(p.id)
        const lastAction: SeatLastAction | null = la
          ? { action: la.action, amountBB: la.amountBB }
          : null
        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
          >
            <PlayerSeat
              player={p}
              isActing={state.currentActorId === p.id && !state.isHandComplete}
              revealCards={showdown}
              lastAction={lastAction}
              isWinner={showdown && winners.has(p.id)}
              compact={isMobile}
            />
            {p.seatIndex === state.buttonSeatIndex && (
              <span
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full brass font-display text-[11px] font-extrabold flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.5)] ring-1 ring-brass-600"
                aria-label="ディーラーボタン"
              >
                D
              </span>
            )}
          </div>
        )
      })}
    </div>
    </div>
  )
}
