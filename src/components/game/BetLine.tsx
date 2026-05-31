import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { ActionRecord, GameState, PlayerAction, Street } from '../../types/game'
import { HERO_ID } from '../../stores/gameStore'

const STREET_JP: Record<Street, string> = {
  preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー', showdown: 'ショーダウン',
}
const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン',
}

// アクション種別ごとの色 + アイコン (色のみ非依存・カラーブラインド対応)
const ACTION_STYLE: Record<PlayerAction, { icon: string; cls: string }> = {
  fold:  { icon: '✕', cls: 'bg-zinc-700/80 text-zinc-300 border-zinc-500/50' },
  check: { icon: '✓', cls: 'bg-sky-800/70 text-sky-100 border-sky-500/40' },
  call:  { icon: '✓', cls: 'bg-sky-800/70 text-sky-100 border-sky-500/40' },
  raise: { icon: '▲', cls: 'bg-emerald-800/70 text-emerald-100 border-emerald-500/40' },
  allin: { icon: '★', cls: 'bg-brass-500/90 text-ink border-brass-300' },
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

interface BetLineProps {
  state: GameState
}

// 行動者の表示名: ヒーローは「あなた」、相手はポジション (無ければ playerId)
function actorLabel(a: ActionRecord): string {
  if (a.playerId === HERO_ID) return 'あなた'
  return a.actorPosition ?? a.playerId
}

// アクションの完全な読み上げテキスト (raise/call/allin は BB 額を併記)
function actionText(a: ActionRecord): string {
  const amt = a.amountBB > 0 ? ` ${fmt(a.amountBB)}BB` : ''
  return `${ACTION_JP[a.action]}${amt}`
}

// ハンド内のアクション列をストリート別にまとめて表示する、ライブ卓用のコンパクトなベットライン。
// 例: プリフロップ [UTG レイズ 2.5BB] [MP コール 2.5BB] [BB フォールド] ...
export function BetLine({ state }: BetLineProps) {
  const reduce = useReducedMotion()
  const history = state.actionHistory

  // ストリート別にグループ化 (発生したストリートのみ、行動順を保持)
  const grouped = useMemo(() => {
    const order: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown']
    return order
      .map(street => ({ street, actions: history.filter(a => a.street === street) }))
      .filter(g => g.actions.length > 0)
  }, [history])

  if (grouped.length === 0) return null

  return (
    <div
      className="w-full rounded-xl bg-base-900/60 border border-white/10 px-2.5 py-2"
      aria-label="アクション履歴"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span aria-hidden="true" className="text-brass-300 text-xs">≡</span>
        <span className="text-[11px] font-bold text-zinc-400 font-display tracking-wide">アクション履歴</span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto overflow-x-hidden">
        {grouped.map(({ street, actions }) => (
          <div key={street} className="flex flex-wrap items-center gap-1">
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold font-display tracking-wide bg-base-700 text-zinc-300 border border-white/8">
              {STREET_JP[street]}
            </span>
            {actions.map((a, i) => {
              const isHero = a.playerId === HERO_ID
              const style = ACTION_STYLE[a.action]
              return (
                <motion.span
                  key={`${street}-${i}`}
                  initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  className={[
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] whitespace-nowrap',
                    style.cls,
                    isHero ? 'ring-1 ring-brass-400/60 font-bold' : 'font-semibold',
                  ].join(' ')}
                >
                  <span aria-hidden="true">{style.icon}</span>
                  <span>{actorLabel(a)}</span>
                  <span className="font-data">{actionText(a)}</span>
                </motion.span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
