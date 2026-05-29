import { describe, it, expect } from 'vitest'
import { solveTurn, strictEquity5, selectRunouts, allTurnRunouts } from './turnSolver'
import { solveRiver, type Combo } from './riverSolver'
import type { Card, Rank, Suit } from '../../types/game'

const c = (r: Rank, s: Suit): Card => ({ rank: r, suit: s })
const combo = (a: Card, b: Card, weight = 1): Combo => ({ cards: [a, b], weight })

function bestEv(strat: ReturnType<typeof solveTurn>['oopRootStrategy'], comboIdx: number): number {
  return Math.max(...strat[comboIdx].map(a => a.ev))
}

describe('turnSolver — strictEquity5 (5枚ボード厳密2値)', () => {
  // ドライ5枚 As Kd 7c 3h 2s。trip aces vs ポケット9。
  const board5: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts'), c('2', 'spades')]
  const trips = combo(c('A', 'hearts'), c('A', 'clubs')) // As とでスリーカード
  const nine = combo(c('9', 'diamonds'), c('9', 'clubs'))

  it('強い手は 1.0、弱い手は 0.0、相補的', () => {
    const eq = strictEquity5([trips], [nine], board5)
    expect(eq[0][0]).toBe(1) // trips が必ず勝つ
    const rev = strictEquity5([nine], [trips], board5)
    expect(rev[0][0]).toBe(0) // 立場を入れ替えると相補
  })

  it('ボードと衝突する手は -1 (到達時 reach=0 で未使用)', () => {
    const conflict = combo(c('A', 'spades'), c('Q', 'clubs')) // As はボード上
    const eq = strictEquity5([conflict], [nine], board5)
    expect(eq[0][0]).toBe(-1)
  })
})

describe('turnSolver — runout 列挙 (river 札の宇宙 = デッキ − 盤面4枚)', () => {
  const turnBoard: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts')]

  it('allTurnRunouts は全48通り・重複なし・盤面札を含まない', () => {
    const ro = allTurnRunouts(turnBoard)
    expect(ro).toHaveLength(48)
    const keys = new Set(ro.map(x => `${x.rank}${x.suit}`))
    expect(keys.size).toBe(48)
    const boardKeys = new Set(turnBoard.map(x => `${x.rank}${x.suit}`))
    for (const x of ro) expect(boardKeys.has(`${x.rank}${x.suit}`)).toBe(false)
  })

  it('selectRunouts(12) はランクを広く被覆する (R14② レビュー: suit-block ストライド偏りの回帰防止)', () => {
    // 旧実装(suit-grouped デッキへの素ストライド)では 5 ランクしか拾えずドロー/オーバーカードを
    // 「死に手」と誤評価していた。修正後は 12 サンプルで >=10 ランクを被覆すること。
    const ro = selectRunouts(turnBoard, 12)
    expect(ro).toHaveLength(12)
    expect(new Set(ro.map(x => x.rank)).size).toBeGreaterThanOrEqual(10)
    expect(new Set(ro.map(x => x.suit)).size).toBeGreaterThanOrEqual(3) // スートも分散
  })
})

describe('turnSolver — 2ストリート CFR (turn → river 札 → river ベッティング)', () => {
  // ドライターン As Kd 7c 3h。OOP: トリップA(バリュー) + エア。IP: 中ペア(ブラフキャッチャー)。
  const turnBoard: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts')]
  const VALUE = combo(c('A', 'hearts'), c('A', 'clubs')) // As とでスリーカード
  const AIR = combo(c('Q', 'hearts'), c('J', 'hearts'))  // クイーンハイ (ほぼエア)
  const BLUFFCATCHER = combo(c('9', 'diamonds'), c('9', 'clubs'))

  it('バリュー(セット)はエアより EV が高く、全 EV は有限', () => {
    // ※ ベット頻度の大小は 2ストリートでは非自明(エアが gutshot+オーバーカードでセミブラフし、
    // 単独ブラフキャッチャー相手にナッツが誘い checkするのは GTO 的に正しい)。EV 順序は不変条件。
    const sol = solveTurn({
      board: turnBoard, oop: [VALUE, AIR], ip: [BLUFFCATCHER],
      potBB: 10, stackBB: 100, betSizes: [0.75], raiseSizes: [0.5], iterations: 150,
    })
    expect(bestEv(sol.oopRootStrategy, 0)).toBeGreaterThan(bestEv(sol.oopRootStrategy, 1)) // セット > エア
    expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
  })

  it('各コンボの戦略頻度は ~1 に正規化', () => {
    const sol = solveTurn({
      board: turnBoard, oop: [VALUE, AIR], ip: [BLUFFCATCHER],
      potBB: 10, stackBB: 100, betSizes: [0.75], iterations: 100,
    })
    for (const acts of sol.oopRootStrategy) {
      const sum = acts.reduce((s, a) => s + a.frequency, 0)
      expect(sum).toBeCloseTo(1, 5)
    }
  })

  it('exploitability は反復で減少し収束時 < 10% pot (river の <5% より緩い目標)', () => {
    const args = {
      board: turnBoard, oop: [VALUE, AIR], ip: [BLUFFCATCHER],
      potBB: 10, stackBB: 100, betSizes: [0.75] as number[], raiseSizes: [0.5] as number[],
    }
    const low = solveTurn({ ...args, iterations: 20 })
    const high = solveTurn({ ...args, iterations: 200 })
    expect(high.exploitability).toBeLessThanOrEqual(low.exploitability + 1e-6)
    expect(high.exploitability).toBeLessThan(0.10)
    expect(high.exploitability).toBeGreaterThanOrEqual(0)
  })

  it('支配ハンド AA は KK 相手に root ベスト EV が正 (river 札除去=Kセットも正しく処理)', () => {
    // Qs 8d 5c 2h ターン。AA は K リバー以外で必ず勝つ → バリュー。
    const board: Card[] = [c('Q', 'spades'), c('8', 'diamonds'), c('5', 'clubs'), c('2', 'hearts')]
    const sol = solveTurn({
      board, oop: [combo(c('A', 'hearts'), c('A', 'diamonds'))], ip: [combo(c('K', 'hearts'), c('K', 'clubs'))],
      potBB: 10, stackBB: 100, betSizes: [0.66], raiseSizes: [0.5], iterations: 150,
    })
    expect(bestEv(sol.oopRootStrategy, 0)).toBeGreaterThan(0)
    expect(sol.exploitability).toBeLessThan(0.10)
  })

  it('R14② の主眼: river ベッティングを織り込むと turn 解はエクイティ近似と乖離する', () => {
    // Ks 8h 5h 2c ウェットターン。OOP=トップペアK、IP=ナッツフラドロ。ベットありなら river の
    // バリュー/ブラフ/降ろしを織り込む完全チャンス CFR は、賭け未考慮のエクイティ近似と必ず異なる
    // 解を出す(=R14② が equity 近似を超えて機能している証拠)。ground-truth(ベット無→一致)と対。
    const board: Card[] = [c('K', 'spades'), c('8', 'hearts'), c('5', 'hearts'), c('2', 'clubs')]
    const input = {
      board, oop: [combo(c('K', 'diamonds'), c('Q', 'clubs'))], ip: [combo(c('A', 'hearts'), c('4', 'hearts'))],
      potBB: 10, stackBB: 100, betSizes: [0.66] as number[], raiseSizes: [0.5] as number[], iterations: 250,
    }
    const approxEv = Math.max(...solveRiver(input).oopRootStrategy[0].map(a => a.ev)) // 賭け未考慮
    const chanceEv = bestEv(solveTurn(input).oopRootStrategy, 0)                       // river 賭け考慮
    expect(Number.isFinite(chanceEv)).toBe(true)
    expect(Math.abs(chanceEv - approxEv)).toBeGreaterThan(0.05)
  })

  it('グラウンドトゥルース: ベッティング無しなら チャンス CFR = ランナウト平均エクイティ (riverSolver)', () => {
    // betSizes=[] → 両者チェックダウンのみ。turn チャンス CFR の showdown 平均は
    // riverSolver の turn 近似(全ランナウト平均エクイティ)と一致するはず。half/committed/eq
    // スレッディング/1N 平均の会計が正しいことの直接検証。runoutN=48 で同一ランナウト集合に。
    const board: Card[] = [c('A', 'spades'), c('K', 'diamonds'), c('7', 'clubs'), c('3', 'hearts')]
    const oop = [combo(c('A', 'hearts'), c('A', 'clubs')), combo(c('Q', 'hearts'), c('J', 'hearts'))]
    const ip = [combo(c('9', 'diamonds'), c('9', 'clubs'))]
    const base = { board, oop, ip, potBB: 10, stackBB: 100, betSizes: [] as number[], iterations: 1 }
    const approx = solveRiver(base)                          // turn=全48ランナウト平均
    const chance = solveTurn({ ...base, runoutN: 48 })       // turn=完全チャンス(同48・ベット無)
    for (let i = 0; i < oop.length; i++) {
      const a = approx.oopRootStrategy[i].find(x => x.action === 'check')!.ev
      const b = chance.oopRootStrategy[i].find(x => x.action === 'check')!.ev
      expect(b).toBeCloseTo(a, 4) // チェックEV が一致 = 会計正当
    }
  })

  it('小レンジの求解は数秒以内 (Worker 前提・性能調整は R14②-4)', () => {
    const t0 = performance.now()
    solveTurn({
      board: turnBoard, oop: [VALUE, AIR], ip: [BLUFFCATCHER],
      potBB: 10, stackBB: 100, betSizes: [0.75], raiseSizes: [0.5], iterations: 100,
    })
    expect(performance.now() - t0).toBeLessThan(5000)
  })
})

// 会計(二街 pot/half/committed/stack)・カード除去のストレス検証 (R14② レビューハードニング)。
describe('turnSolver — 会計 & カード除去ストレス', () => {
  const board: Card[] = [c('Q', 'spades'), c('8', 'diamonds'), c('5', 'clubs'), c('2', 'hearts')]

  it('マルチコンボのチェックダウン EV = ランナウト平均エクイティ (runoutN=48・会計の本検証)', () => {
    // 単一コンボより強い検証: 4×3 レンジでも massAvg 正規化が条件付き EV を正しく返す。
    const oop = [
      combo(c('A', 'hearts'), c('A', 'diamonds')), combo(c('K', 'hearts'), c('K', 'diamonds')),
      combo(c('J', 'hearts'), c('T', 'hearts')), combo(c('7', 'spades'), c('6', 'spades')),
    ]
    const ip = [combo(c('Q', 'hearts'), c('J', 'clubs')), combo(c('9', 'diamonds'), c('9', 'clubs')), combo(c('A', 'clubs'), c('K', 'clubs'))]
    const base = { board, oop, ip, potBB: 10, stackBB: 100, betSizes: [] as number[], iterations: 1 }
    const approx = solveRiver(base)
    const chance = solveTurn({ ...base, runoutN: 48 })
    for (let i = 0; i < oop.length; i++) {
      const a = approx.oopRootStrategy[i].find(x => x.action === 'check')!.ev
      const b = chance.oopRootStrategy[i].find(x => x.action === 'check')!.ev
      expect(b).toBeCloseTo(a, 3)
    }
  })

  it('ショートスタック(turn レイズでほぼオールイン): EV 有限・exploit 健全', () => {
    const sol = solveTurn({
      board, oop: [combo(c('A', 'hearts'), c('A', 'clubs')), combo(c('Q', 'hearts'), c('J', 'hearts'))],
      ip: [combo(c('9', 'diamonds'), c('9', 'clubs'))],
      potBB: 10, stackBB: 18, betSizes: [0.66], raiseSizes: [2.0], iterations: 150,
    })
    expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
    expect(sol.exploitability).toBeGreaterThanOrEqual(0)
    expect(sol.exploitability).toBeLessThan(0.5)
  })

  it('turn ベット後の river スタック極小: river ベットが上限内に収まり EV 有限', () => {
    const sol = solveTurn({
      board, oop: [combo(c('A', 'hearts'), c('A', 'clubs')), combo(c('Q', 'hearts'), c('J', 'hearts'))],
      ip: [combo(c('9', 'diamonds'), c('9', 'clubs')), combo(c('K', 'hearts'), c('Q', 'spades'))],
      potBB: 20, stackBB: 12, betSizes: [0.66], raiseSizes: [1.0], iterations: 150,
    })
    expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
    expect(sol.exploitability).toBeGreaterThanOrEqual(0)
  })

  it('カード除去: runoutN を変えても (除去多発でも) EV は有限・NaN/-Inf を出さない', () => {
    // OOP はハートのドロー → 多くのハート river で除去される。小さい runoutN で除去が支配的でも健全。
    const wet: Card[] = [c('K', 'spades'), c('8', 'hearts'), c('5', 'hearts'), c('2', 'clubs')]
    const oop = [combo(c('A', 'hearts'), c('4', 'hearts')), combo(c('K', 'diamonds'), c('Q', 'clubs'))]
    const ip = [combo(c('9', 'spades'), c('9', 'diamonds'))]
    for (const N of [1, 2, 3, 5, 48]) {
      const sol = solveTurn({ board: wet, oop, ip, potBB: 10, stackBB: 100, betSizes: [], iterations: 1, runoutN: N })
      expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
    }
  })

  it('weight=0 のコンボがレンジにあっても EV 有限', () => {
    const sol = solveTurn({
      board, oop: [combo(c('A', 'hearts'), c('A', 'clubs'), 0), combo(c('Q', 'hearts'), c('J', 'hearts'), 1)],
      ip: [combo(c('9', 'diamonds'), c('9', 'clubs'), 1)],
      potBB: 10, stackBB: 100, betSizes: [0.66], iterations: 50,
    })
    expect(sol.oopRootStrategy.every(acts => acts.every(a => Number.isFinite(a.ev)))).toBe(true)
  })
})
