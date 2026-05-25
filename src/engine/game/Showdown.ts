import type { GameState, ShowdownResult, HandEvalResult } from '../../types/game'
import { evaluateBestHand, compareHands } from '../cards/HandEvaluator'
import { getTotalPot } from './BettingEngine'

function findWinners<T extends { eval: HandEvalResult }>(entries: T[]): T[] {
  if (entries.length === 0) return []
  let best = entries[0]
  const winners: T[] = [best]
  for (let i = 1; i < entries.length; i++) {
    const cmp = compareHands(entries[i].eval, best.eval)
    if (cmp < 0) { best = entries[i]; winners.length = 0; winners.push(best) }
    else if (cmp === 0) winners.push(entries[i])
  }
  return winners
}

export function determineWinners(state: GameState): ShowdownResult[] {
  const active = state.players.filter(p => !p.isFolded && p.holeCards)

  if (active.length === 1) {
    return [{
      winnerId: active[0].id,
      winnerIds: [active[0].id],
      handRank: 'high_card',
      amountWonBB: getTotalPot(state),
    }]
  }

  const evals = active.map(p => ({
    player: p,
    eval: evaluateBestHand([...p.holeCards!, ...state.board]),
  }))

  const results: ShowdownResult[] = []

  // Main pot
  const mainWinners = findWinners(evals)
  const mainShare = state.pot.mainPotBB / mainWinners.length
  for (const w of mainWinners) {
    results.push({
      winnerId: w.player.id,
      winnerIds: mainWinners.map(x => x.player.id),
      handRank: w.eval.rank,
      amountWonBB: mainShare,
    })
  }

  // Side pots
  for (const sp of state.pot.sidePots) {
    const eligible = evals.filter(e => sp.eligiblePlayerIds.includes(e.player.id))
    if (eligible.length === 0) continue
    const spWinners = findWinners(eligible)
    const spShare = sp.amountBB / spWinners.length
    for (const w of spWinners) {
      const existing = results.find(r => r.winnerId === w.player.id)
      if (existing) existing.amountWonBB += spShare
      else results.push({
        winnerId: w.player.id,
        winnerIds: spWinners.map(x => x.player.id),
        handRank: w.eval.rank,
        amountWonBB: spShare,
      })
    }
  }

  return results
}
