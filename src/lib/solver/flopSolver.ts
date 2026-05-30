import type { Card } from '../../types/game'
import type { Combo, RiverInput } from './riverSolver'
import {
  type Node, type ChanceChild, type ChanceSolution,
  buildBettingLayer, strictEquity5, allRunouts, selectRunouts, removalMasks, solveChanceTree,
} from './chanceCfr'

// ── flop 完全チャンスノード CFR(3ストリート・2チャンス層)──────────────────────
// flop(board=3枚)を「flop ベッティング → ChanceNode(turn札) → turn ベッティング →
// ChanceNode(river札) → river ベッティング → 厳密2値ショーダウン」の3街 CFR で求解する。
// turn の完全チャンス CFR(R14②)を1層深くしたもの。チャンス CFR コア(chanceCfr.ts)は
// チャンス層の深さに非依存なので、ここでは2層ネストの木を構築するだけ。
//
// ⚠ 計算量は O(N_turn × N_river × combos² × ノード) で重い。live solve には不向きで、
// **事前計算(scripts/precompute-flop.ts)専用**。getSolution は生成済み JSON を配給する。
// turn/river のランナウトは独立にサブサンプル可能(turnRunoutN / riverRunoutN)。

export type FlopSolution = ChanceSolution

export interface FlopInput extends RiverInput {
  turnRunoutN?: number  // turn 札のサンプル数(未指定=全49列挙)
  riverRunoutN?: number // turn 確定後の river 札のサンプル数(未指定=全48列挙)
}

const HALF = (pot: number) => pot / 2

// river ChanceNode(turn 確定後)。river サブツリーは厳密ショーダウン終端。
function makeRiverChance(
  flop3: Card[], turnCard: Card, potAfterFlop: number, turnStack: number,
  turnCommitted: [number, number], oop: Combo[], ip: Combo[],
  betSizes: number[], raiseSizes: number[], riverRunoutN: number | undefined,
): Node {
  if (Math.abs(turnCommitted[0] - turnCommitted[1]) > 1e-9) throw new Error('river chance: asymmetric commits')
  const potAfterTurn = potAfterFlop + turnCommitted[0] + turnCommitted[1]
  const halfR = HALF(potAfterTurn)
  const riverStack = turnStack - turnCommitted[0]
  const board4 = [...flop3, turnCard]
  const riverCards = riverRunoutN != null ? selectRunouts(board4, riverRunoutN) : allRunouts(board4)
  const runouts: ChanceChild[] = riverCards.map(riverCard => ({
    card: riverCard,
    eq: strictEquity5(oop, ip, [...board4, riverCard]),
    ...removalMasks(oop, ip, riverCard),
    subtree: buildBettingLayer({
      pot: potAfterTurn, stack: riverStack, betSizes, raiseSizes, foldHalf: halfR,
      onShowdown: (committed) => ({ kind: 'showdown', committed, half: halfR }),
    }),
  }))
  return { kind: 'chance', potAfter: potAfterTurn, committedAtChance: turnCommitted, runouts }
}

// turn ChanceNode(flop 確定後)。turn サブツリーの非fold 終端は river ChanceNode(eq は最終層のみ)。
function makeTurnChance(
  flop3: Card[], potBB: number, stack: number, flopCommitted: [number, number],
  oop: Combo[], ip: Combo[], betSizes: number[], raiseSizes: number[],
  turnRunoutN: number | undefined, riverRunoutN: number | undefined,
): Node {
  if (Math.abs(flopCommitted[0] - flopCommitted[1]) > 1e-9) throw new Error('turn chance: asymmetric commits')
  const potAfterFlop = potBB + flopCommitted[0] + flopCommitted[1]
  const halfT = HALF(potAfterFlop)
  const turnStack = stack - flopCommitted[0]
  const turnCards = turnRunoutN != null ? selectRunouts(flop3, turnRunoutN) : allRunouts(flop3)
  const runouts: ChanceChild[] = turnCards.map(turnCard => ({
    card: turnCard,
    eq: null, // 中間チャンス: 直下に showdown 無し(さらに river チャンスへ)
    ...removalMasks(oop, ip, turnCard),
    subtree: buildBettingLayer({
      pot: potAfterFlop, stack: turnStack, betSizes, raiseSizes, foldHalf: halfT,
      onShowdown: (turnCommitted) => makeRiverChance(
        flop3, turnCard, potAfterFlop, turnStack, turnCommitted, oop, ip, betSizes, raiseSizes, riverRunoutN,
      ),
    }),
  }))
  return { kind: 'chance', potAfter: potAfterFlop, committedAtChance: flopCommitted, runouts }
}

export function solveFlop(input: FlopInput): FlopSolution {
  const { oop, ip, potBB } = input
  const iterations = input.iterations ?? 60
  const betSizes = input.betSizes ?? [0.66]
  const raiseSizes = input.raiseSizes ?? []
  const flop3 = input.board

  const root = buildBettingLayer({
    pot: potBB, stack: input.stackBB, betSizes, raiseSizes, foldHalf: HALF(potBB),
    onShowdown: (flopCommitted) => makeTurnChance(
      flop3, potBB, input.stackBB, flopCommitted, oop, ip, betSizes, raiseSizes,
      input.turnRunoutN, input.riverRunoutN,
    ),
  })

  return solveChanceTree(root, oop, ip, potBB, iterations)
}
