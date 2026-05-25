import { describe, it, expect } from 'vitest'
import { AgentBus } from './agents/AgentBus'
import { DealerAgent } from './agents/DealerAgent'
import { AIPlayerAgent } from './agents/AIPlayerAgent'
import { cardToString } from './cards/Card'
import type { PlayerConfig } from './game/GameState'

const configs: PlayerConfig[] = [
  { id: 'p0', agentType: 'fish_ai', stackBB: 100, isHero: false },
  { id: 'p1', agentType: 'fish_ai', stackBB: 100, isHero: true },
  { id: 'p2', agentType: 'fish_ai', stackBB: 100, isHero: false },
  { id: 'p3', agentType: 'fish_ai', stackBB: 100, isHero: false },
  { id: 'p4', agentType: 'fish_ai', stackBB: 100, isHero: false },
  { id: 'p5', agentType: 'fish_ai', stackBB: 100, isHero: false },
]

describe('Phase 1 Integration', () => {
  it('runs a complete 6-player hand through all streets', () => {
    const bus = new AgentBus()
    for (const cfg of configs) new AIPlayerAgent(bus, cfg.id)

    const streets: string[] = []
    let handComplete = false

    bus.on('HAND_START', ({ state }) => {
      console.log(`\n=== Hand #${state.handNumber} (btn=seat${state.buttonSeatIndex}) ===`)
      for (const p of state.players) {
        const cards = p.holeCards!.map(cardToString).join(' ')
        console.log(`  ${p.position} ${p.id}: [${cards}] ${p.stackBB}BB`)
      }
    })

    bus.on('STREET_DEALT', ({ state }) => {
      const board = state.board.map(cardToString).join(' ')
      console.log(`\n-- ${state.street.toUpperCase()}${board ? ' [' + board + ']' : ''} | pot=${state.pot.mainPotBB}BB --`)
      streets.push(state.street)
    })

    bus.on('PLAYER_ACTION', ({ playerId, action, amount }) => {
      console.log(`  ${playerId}: ${action}${amount > 0 ? ' ' + amount + 'BB' : ''}`)
    })

    bus.on('HAND_COMPLETE', ({ results }) => {
      console.log('\n-- SHOWDOWN --')
      for (const r of results) {
        console.log(`  ${r.winnerId} wins ${r.amountWonBB.toFixed(1)}BB (${r.handRank})`)
      }
      handComplete = true
    })

    const dealer = new DealerAgent(bus, configs, 0)
    dealer.startNewHand()

    expect(handComplete).toBe(true)
    expect(streets.length).toBeGreaterThanOrEqual(1) // at least preflop dealt
  })

  it('runs 20 hands without error', () => {
    const bus = new AgentBus()
    for (const cfg of configs) new AIPlayerAgent(bus, cfg.id)

    let completed = 0
    bus.on('HAND_COMPLETE', () => { completed++ })

    new DealerAgent(bus, configs, 0)
    for (let i = 0; i < 20; i++) {
      bus.emit('NEW_HAND_REQUEST', {})
    }

    expect(completed).toBe(20)
  })
})
