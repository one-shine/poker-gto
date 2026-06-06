import { describe, it, expect } from 'vitest'
import type { GameState } from '../../types/game'
import { createShuffledDeck } from '../cards/Deck'
import { createInitialGameState, type PlayerConfig } from './GameState'
import { getTotalPot } from './BettingEngine'
import { AgentBus } from '../agents/AgentBus'
import { DealerAgent } from '../agents/DealerAgent'
import { AIPlayerAgent } from '../agents/AIPlayerAgent'

// ブラインドの二重計上(mainPotBB 初期値=ブラインド AND currentBetBB=ブラインド)を防ぐ回帰テスト。
// 正しいモデル: ブラインドは currentBetBB のみ、pot は collectBetsIntoPot で集約。チップは常に保存される。
const configs: PlayerConfig[] = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i}`, agentType: 'fish_ai' as const, stackBB: 100, isHero: i === 1,
}))
const START_CHIPS = 600 // 6 × 100BB

const liveBets = (s: GameState) => s.players.reduce((sum, p) => sum + p.currentBetBB, 0)
const chipsTotal = (s: GameState) =>
  s.players.reduce((sum, p) => sum + p.stackBB, 0) + liveBets(s) + getTotalPot(s)

describe('pot accounting (chip conservation)', () => {
  it('initial state: blinds live in currentBetBB, settled pot starts at 0, real pot = 1.5BB', () => {
    const { state } = createInitialGameState(configs, createShuffledDeck(), 0, 1)
    expect(state.pot.mainPotBB).toBe(0) // 確定ポットは 0(ブラインドはまだ未回収)
    expect(liveBets(state)).toBe(1.5) // SB 0.5 + BB 1
    expect(getTotalPot(state) + liveBets(state)).toBe(1.5) // 実ポット = 1.5BB(3BB ではない)
    expect(chipsTotal(state)).toBe(START_CHIPS) // 幽霊チップなし(保存則)
  })

  it('conserves chips through 20 random hands (no blind double-count at showdown/fold)', () => {
    const bus = new AgentBus()
    for (const cfg of configs) new AIPlayerAgent(bus, cfg.id)
    const violations: number[] = []
    bus.on('HAND_COMPLETE', ({ state }) => {
      // ハンド終了時は collectBetsIntoPot 済 → 場のベットは 0、全チップは stacks + pot。
      const total = state.players.reduce((sum, p) => sum + p.stackBB, 0) + getTotalPot(state)
      if (Math.abs(total - START_CHIPS) > 1e-9) violations.push(total)
    })
    new DealerAgent(bus, configs, 0)
    for (let i = 0; i < 20; i++) bus.emit('NEW_HAND_REQUEST', {})
    expect(violations).toEqual([]) // 旧バグでは全ハンドで 601.5 になる
  })
})
