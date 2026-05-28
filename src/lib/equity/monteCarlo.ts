import type { Card, Rank } from '../../types/game'
import { RANKS, SUITS } from '../../engine/cards/Card'
import { evaluateBestHand, compareHands } from '../../engine/cards/HandEvaluator'

export interface EquityInput {
  holeCards: [Card, Card]
  board: Card[]               // 0 / 3 / 4 / 5 枚
  opponentRanges: string[][]  // 相手ごとの想定レンジ (ハンドカテゴリ配列 例 ['AA','AKs',...])
  iterations: number
}
export interface EquityResult {
  equity: number // 0..1
  samples: number
}

const key = (c: Card) => c.rank + c.suit[0]

// カテゴリ ('AA' / 'AKs' / 'AKo') を具体コンボへ展開。
export function expandCategory(cat: string): [Card, Card][] {
  const r1 = cat[0] as Rank
  const r2 = cat[1] as Rank
  const out: [Card, Card][] = []
  if (cat.length === 2) {
    for (let i = 0; i < SUITS.length; i++)
      for (let j = i + 1; j < SUITS.length; j++)
        out.push([{ rank: r1, suit: SUITS[i] }, { rank: r1, suit: SUITS[j] }])
  } else if (cat[2] === 's') {
    for (const s of SUITS) out.push([{ rank: r1, suit: s }, { rank: r2, suit: s }])
  } else {
    for (const s1 of SUITS) for (const s2 of SUITS)
      if (s1 !== s2) out.push([{ rank: r1, suit: s1 }, { rank: r2, suit: s2 }])
  }
  return out
}

function fullDeck(): Card[] {
  const d: Card[] = []
  for (const r of RANKS) for (const s of SUITS) d.push({ rank: r, suit: s })
  return d
}

// モンテカルロで hero のエクイティ(勝ち + 分割込みの取り分)を推定する。
// 相手は「ランダム2枚」ではなく指定レンジから引く(タイ・ブロッカーを正しく反映)。
export function computeEquity(input: EquityInput): EquityResult {
  const { holeCards, board, iterations } = input
  const oppCombos = input.opponentRanges.map(r => r.flatMap(expandCategory))
  // 相手レンジが空 = 計算不能
  if (oppCombos.some(c => c.length === 0)) return { equity: 0, samples: 0 }

  const dead = new Set<string>([...holeCards.map(key), ...board.map(key)])
  const baseDeck = fullDeck().filter(c => !dead.has(key(c)))

  let won = 0
  let samples = 0
  const heroSeen = [holeCards[0], holeCards[1]]

  for (let it = 0; it < iterations; it++) {
    const used = new Set(dead)
    const oppHands: [Card, Card][] = []
    let ok = true
    for (const combos of oppCombos) {
      // 使用済みと衝突しないコンボを引く(リジェクションサンプリング)
      let pick: [Card, Card] | null = null
      for (let tries = 0; tries < 30; tries++) {
        const cand = combos[(Math.random() * combos.length) | 0]
        if (!used.has(key(cand[0])) && !used.has(key(cand[1]))) { pick = cand; break }
      }
      if (!pick) { ok = false; break }
      used.add(key(pick[0])); used.add(key(pick[1]))
      oppHands.push(pick)
    }
    if (!ok) continue

    // 残りデッキからボードを5枚まで補完
    const avail = baseDeck.filter(c => !used.has(key(c)))
    const need = 5 - board.length
    // 部分シャッフル (Fisher-Yates)
    for (let i = 0; i < need; i++) {
      const j = i + ((Math.random() * (avail.length - i)) | 0)
      ;[avail[i], avail[j]] = [avail[j], avail[i]]
    }
    const runout = [...board, ...avail.slice(0, need)]

    const heroEval = evaluateBestHand([...heroSeen, ...runout])
    let tie = 1 // hero を含むタイ人数
    let lost = false
    for (const opp of oppHands) {
      // compareHands(hero, opp): 負=heroの勝ち / 正=heroの負け / 0=タイ (HandEvaluator:165)
      const cmp = compareHands(heroEval, evaluateBestHand([...opp, ...runout]))
      if (cmp > 0) { lost = true; break }
      if (cmp === 0) tie++
    }
    samples++
    if (!lost) won += 1 / tie
  }

  return { equity: samples === 0 ? 0 : won / samples, samples }
}
