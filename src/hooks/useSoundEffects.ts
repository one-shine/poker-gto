import { useEffect, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  setSoundEnabled,
  playChip,
  playCheck,
  playFold,
  playDeal,
  playWin,
} from '../lib/sound/sound'
import type { GameState, Street } from '../types/game'

// state 遷移で効果音/ハプティクスを鳴らす。GamePage 冒頭で一度だけ mount する想定。
// 直前値を ref に保持し差分検出する。すべて settingsStore のトグルでゲートする。

function vibrate(enabled: boolean, pattern: number | number[]): void {
  if (!enabled) return
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern)
    } catch {
      // 非対応端末は黙って無視
    }
  }
}

export function useSoundEffects(): void {
  const prevStreet = useRef<Street | null>(null)
  const prevHandId = useRef<string | null>(null)
  const prevResultsKey = useRef<string | null>(null)
  // playerId → そのプレイヤーの「最後に観測した actionHistory 件数」相当の指標。
  const prevActionCount = useRef(0)
  const prevActorIds = useRef<Set<string>>(new Set())

  // sound.ts の有効状態を settingsStore に追従させる (sound.ts は store 非依存)。
  useEffect(() => {
    setSoundEnabled(useSettingsStore.getState().soundEnabled)
    return useSettingsStore.subscribe(s => setSoundEnabled(s.soundEnabled))
  }, [])

  useEffect(() => {
    const handle = (gs: GameState | null) => {
      const { soundEnabled, hapticsEnabled } = useSettingsStore.getState()
      if (!gs) {
        prevStreet.current = null
        prevHandId.current = null
        prevActionCount.current = 0
        prevActorIds.current = new Set()
        return
      }

      // 新ハンド: 配布音をリセット基準に。
      if (gs.handId !== prevHandId.current) {
        prevHandId.current = gs.handId
        prevStreet.current = gs.street
        prevActionCount.current = gs.actionHistory.length
        prevActorIds.current = new Set(gs.players.map(p => p.id))
        if (soundEnabled) playDeal()
        return
      }

      // 新ストリート配布 (preflop→flop→turn→river)。
      if (gs.street !== prevStreet.current && gs.street !== 'showdown') {
        prevStreet.current = gs.street
        if (soundEnabled) playDeal()
        vibrate(hapticsEnabled, 8)
      } else if (gs.street !== prevStreet.current) {
        prevStreet.current = gs.street
      }

      // 新規アクション: actionHistory の増分から直近のアクション種別を判定して鳴らす。
      const history = gs.actionHistory
      if (history.length > prevActionCount.current) {
        for (let i = prevActionCount.current; i < history.length; i++) {
          const rec = history[i]
          if (!soundEnabled) continue
          switch (rec.action) {
            case 'raise':
            case 'call':
            case 'allin':
              playChip()
              break
            case 'check':
              playCheck()
              break
            case 'fold':
              playFold()
              break
          }
        }
        prevActionCount.current = history.length
      }
    }

    const handleResults = () => {
      const { soundEnabled, hapticsEnabled } = useSettingsStore.getState()
      const results = useGameStore.getState().lastResults
      const key = results ? results.map(r => `${r.winnerId}:${r.amountWonBB}`).join('|') : null
      if (key && key !== prevResultsKey.current) {
        prevResultsKey.current = key
        if (soundEnabled) playWin()
        vibrate(hapticsEnabled, [12, 40, 12])
      } else if (!key) {
        prevResultsKey.current = null
      }
    }

    // 初期状態を取り込んでから購読 (mount 時点のハンドで誤発火しないよう基準を確定)。
    handle(useGameStore.getState().gameState)
    handleResults()

    const unsub = useGameStore.subscribe(st => {
      handle(st.gameState)
      handleResults()
    })
    return unsub
  }, [])
}
