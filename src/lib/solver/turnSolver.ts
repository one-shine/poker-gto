import type { Card } from '../../types/game'
import type { RiverInput } from './riverSolver'
import {
  type Node, type ChanceChild, type ChanceSolution, type CfrOpts,
  buildBettingLayer, strictEquity5, allRunouts, selectRunouts, removalMasks, solveChanceTree,
} from './chanceCfr'

// ── R14② turn 完全チャンスノード CFR ──────────────────────────────────────────
// turn(board=4枚)を「turn ベッティング → ChanceNode(river札を配る) → river ベッティング
// → 厳密2値ショーダウン」の2ストリート CFR で求解する。riverSolver の turn 近似(リバーまで
// オールイン相当のエクイティ平均=以降の賭け未考慮)と違い、river のベッティング判断を織り込む
// ため、ドロー(降ろされる/降ろさない)の過大評価を解消する。
//
// チャンス CFR コアは chanceCfr.ts に共有(flopSolver と共通)。本ファイルは turn 木の構築のみ。
// riverSolver.ts は別アルゴリズム(チャンス層なし)で不変=回帰安全網。

export type TurnSolution = ChanceSolution
export interface TurnInput extends RiverInput {
  cfrOpts?: CfrOpts // 収束改善(linearAveraging / dcfr)。未指定=従来 CFR+ と同一挙動
}
// 既存テスト互換のため再エクスポート(turnSolver から import しているテストを維持)。
export { strictEquity5, selectRunouts }
export const allTurnRunouts = allRunouts

interface RunoutData { card: Card; eq: number[][]; removedOOP: boolean[]; removedIP: boolean[] }

// 非fold の turn 終端を置換する river ChanceNode を構築。river サブツリーは potAfterTurn(=turn
// 投入を死にポットへ畳んだ額)とスタック(turn 投入差引)で組む。river の committed は [0,0] に
// リセット(turn チップは potAfterTurn=halfR 側にあり二重計上にならない)。
function makeRiverChance(turnCommitted: [number, number], input: RiverInput, runoutData: RunoutData[]): Node {
  if (Math.abs(turnCommitted[0] - turnCommitted[1]) > 1e-9) {
    // チャンスノードはマッチしたアクション(両チェック=[0,0] / コール=[add,add])でのみ到達する。
    throw new Error('chance node reached with asymmetric commits')
  }
  const potAfterTurn = input.potBB + turnCommitted[0] + turnCommitted[1]
  const halfR = potAfterTurn / 2
  const riverStack = input.stackBB - turnCommitted[0]
  const betSizes = input.betSizes ?? [0.66]
  const raiseSizes = input.raiseSizes ?? []
  const runouts: ChanceChild[] = runoutData.map(rd => ({
    card: rd.card, eq: rd.eq, removedOOP: rd.removedOOP, removedIP: rd.removedIP,
    subtree: buildBettingLayer({
      pot: potAfterTurn, stack: riverStack, betSizes, raiseSizes, foldHalf: halfR,
      onShowdown: (committed) => ({ kind: 'showdown', committed, half: halfR }),
    }),
  }))
  return { kind: 'chance', potAfter: potAfterTurn, committedAtChance: turnCommitted, runouts }
}

export function solveTurn(input: TurnInput): TurnSolution {
  const { oop, ip, potBB } = input
  const iterations = input.iterations ?? 100

  // river 札を全列挙(production)/ runoutN 指定時はサブセット(主にテスト)。
  const runoutCards = input.runoutN != null ? selectRunouts(input.board, input.runoutN) : allRunouts(input.board)
  const runoutData: RunoutData[] = runoutCards.map(card => ({
    card, eq: strictEquity5(oop, ip, [...input.board, card]),
    ...removalMasks(oop, ip, card),
  }))

  const root = buildBettingLayer({
    pot: potBB, stack: input.stackBB,
    betSizes: input.betSizes ?? [0.66], raiseSizes: input.raiseSizes ?? [],
    foldHalf: potBB / 2,
    onShowdown: (committed) => makeRiverChance(committed, input, runoutData),
  })

  return solveChanceTree(root, oop, ip, potBB, iterations, input.cfrOpts)
}
