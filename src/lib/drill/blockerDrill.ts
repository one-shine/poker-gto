import type { Card, HandRank, Rank } from '../../types/game'
import { RANKS, SUITS } from '../../engine/cards/Card'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'

// ブロッカー ドリル (戦略学習拡張 Tier1・B10)。
// 「最良のブラフ手はどれか」を、相手のバリュー/続行レンジ(ツーペア以上)を最も多く消す
// (= カードリムーバル)ハンドで判定する。採点は実カードリムーバル数学=事実ベースであり、
// GTO 頻度の主張はしない (ルール1)。依存: engine/cards のみ (ソルバー非依存・同期・即時採点)。

// 役の強さ順 (大きいほど強い)。
const RANK_ORDER: Record<HandRank, number> = {
  high_card: 0, one_pair: 1, two_pair: 2, three_of_a_kind: 3, straight: 4,
  flush: 5, full_house: 6, four_of_a_kind: 7, straight_flush: 8, royal_flush: 9,
}
// 相手の「バリュー/続行レンジ」のしきい値 = ツーペア以上。
const VALUE_THRESHOLD = RANK_ORDER.two_pair

export interface BlockerCandidate {
  cards: [Card, Card]
  label: string  // 169 表記 (AKs/AKo/AA)。パネルはカードで描画するので補助・テスト用。
  blocks: number // 相手バリューコンボのうち、この2枚が消す数 (= 採点根拠)
}

export interface BlockerQuestion {
  board: Card[]      // リバー 5枚
  valueCount: number // 相手バリューコンボ総数 (ツーペア以上)
  candidates: BlockerCandidate[]
  bestBlocks: number // 候補中の最大ブロック数 (= 正解の条件)
}

export interface BlockerJudgement {
  correct: boolean
  chosenIdx: number
  bestIdxs: number[]   // 最良(最多ブロック)の候補 index 群 (同数は全て正解)
  candidates: BlockerCandidate[]
  valueCount: number
}

const cardEq = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit
const cardStr = (c: Card) => `${c.rank}${c.suit}`

// 52枚から dead を除いてシャッフル (Fisher-Yates・rng 注入で再現可能)。
function shuffledDeck(rng: () => number, dead: Card[]): Card[] {
  const deck: Card[] = []
  for (const r of RANKS) for (const s of SUITS) {
    if (!dead.some(d => cardEq(d, { rank: r, suit: s }))) deck.push({ rank: r, suit: s })
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// コンボ 2枚を 169 表記に変換 (AsKs→AKs, AsKd→AKo, AsAd→AA)。RANKS は昇順 2..A。
function comboToCategory(cards: [Card, Card]): string {
  const order = (r: Rank) => RANKS.indexOf(r)
  const [hi, lo] = order(cards[0].rank) >= order(cards[1].rank) ? [cards[0], cards[1]] : [cards[1], cards[0]]
  if (hi.rank === lo.rank) return `${hi.rank}${lo.rank}`
  return `${hi.rank}${lo.rank}${hi.suit === lo.suit ? 's' : 'o'}`
}

function strengthOf(combo: [Card, Card], board: Card[]): number {
  return RANK_ORDER[evaluateBestHand([...combo, ...board]).rank]
}

// リバー盤面を1つ生成し、最良ブラフ(最多ブロッカー)が明確に存在する問題を作る。
// 候補は全てノーペア(high_card)=ブラフ手で、distractor は正解より厳密に少ないブロック数。
export function generateBlockerQuestion(rng: () => number = Math.random): BlockerQuestion {
  for (let attempt = 0; attempt < 100; attempt++) {
    const deck = shuffledDeck(rng, [])
    const board = deck.slice(0, 5)
    const rest = deck.slice(5) // 47枚

    // 残り47枚の全コンボを1回だけ評価し、強さで分類する。
    const combos: { cards: [Card, Card]; strength: number }[] = []
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        const cards: [Card, Card] = [rest[i], rest[j]]
        combos.push({ cards, strength: strengthOf(cards, board) })
      }
    }

    // 相手バリュー(ツーペア以上)コンボと、各カードの出現数。
    const cardValueCount = new Map<string, number>()
    let valueCount = 0
    for (const c of combos) {
      if (c.strength < VALUE_THRESHOLD) continue
      valueCount++
      const [a, b] = c.cards
      cardValueCount.set(cardStr(a), (cardValueCount.get(cardStr(a)) ?? 0) + 1)
      cardValueCount.set(cardStr(b), (cardValueCount.get(cardStr(b)) ?? 0) + 1)
    }
    if (valueCount < 10) continue

    // ブラフ候補 = ノーペア(high_card)。ブロック数 = 2枚それぞれがバリューに現れる数の和。
    // (両方を含むバリューコンボは「候補自身=ノーペア」なので存在しない → 単純な和で厳密。)
    const weak: BlockerCandidate[] = []
    for (const c of combos) {
      if (c.strength !== RANK_ORDER.high_card) continue
      const blocks = (cardValueCount.get(cardStr(c.cards[0])) ?? 0) + (cardValueCount.get(cardStr(c.cards[1])) ?? 0)
      weak.push({ cards: c.cards, label: comboToCategory(c.cards), blocks })
    }
    if (weak.length < 6) continue

    weak.sort((a, b) => b.blocks - a.blocks)
    const top = weak[0]
    if (top.blocks === weak[weak.length - 1].blocks) continue // ブロック差が無い盤面はスキップ

    // distractor = 正解より厳密にブロックが少なく、カードが重複しない手を最大3つ。
    const used = new Set([cardStr(top.cards[0]), cardStr(top.cards[1])])
    const distractors: BlockerCandidate[] = []
    for (const c of shuffle(weak.filter(w => w.blocks < top.blocks), rng)) {
      if (distractors.length >= 3) break
      if (used.has(cardStr(c.cards[0])) || used.has(cardStr(c.cards[1]))) continue
      distractors.push(c)
      used.add(cardStr(c.cards[0]))
      used.add(cardStr(c.cards[1]))
    }
    if (distractors.length < 2) continue // 最低3択

    const candidates = shuffle([top, ...distractors], rng)
    const bestBlocks = Math.max(...candidates.map(c => c.blocks))
    return { board, valueCount, candidates, bestBlocks }
  }

  // 防御的フォールバック (実質到達しない): 制約を緩めて必ず返す。
  const deck = shuffledDeck(rng, [])
  const board = deck.slice(0, 5)
  const rest = deck.slice(5)
  const cardValueCount = new Map<string, number>()
  let valueCount = 0
  const weak: BlockerCandidate[] = []
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const cards: [Card, Card] = [rest[i], rest[j]]
      const st = strengthOf(cards, board)
      if (st >= VALUE_THRESHOLD) {
        valueCount++
        cardValueCount.set(cardStr(cards[0]), (cardValueCount.get(cardStr(cards[0])) ?? 0) + 1)
        cardValueCount.set(cardStr(cards[1]), (cardValueCount.get(cardStr(cards[1])) ?? 0) + 1)
      }
    }
  }
  for (let i = 0; i < rest.length && weak.length < 4; i++) {
    for (let j = i + 1; j < rest.length && weak.length < 4; j++) {
      const cards: [Card, Card] = [rest[i], rest[j]]
      if (strengthOf(cards, board) !== RANK_ORDER.high_card) continue
      const blocks = (cardValueCount.get(cardStr(cards[0])) ?? 0) + (cardValueCount.get(cardStr(cards[1])) ?? 0)
      weak.push({ cards, label: comboToCategory(cards), blocks })
    }
  }
  const bestBlocks = Math.max(...weak.map(c => c.blocks))
  return { board, valueCount, candidates: weak, bestBlocks }
}

export function judgeBlocker(q: BlockerQuestion, chosenIdx: number): BlockerJudgement {
  const bestIdxs = q.candidates
    .map((c, i) => ({ c, i }))
    .filter(x => x.c.blocks === q.bestBlocks)
    .map(x => x.i)
  return { correct: bestIdxs.includes(chosenIdx), chosenIdx, bestIdxs, candidates: q.candidates, valueCount: q.valueCount }
}

// 学習用の説明 (事実ベース)。最良ブラフが相手バリューを何通り消すかを述べる。
export function explainBlocker(q: BlockerQuestion, j: BlockerJudgement): string {
  const best = q.candidates[j.bestIdxs[0]]
  return `最良のブラフは ${best.label} — 相手のバリュー (ツーペア以上 ${q.valueCount} 通り) のうち ${best.blocks} 通りを自分の2枚で消します。`
    + ` 相手の強い続行レンジを多く握る手ほど、ブラフが通りやすく (相手がその手を持てない)、コールされて負けるリスクも下がります。`
    + ` 逆にバリューを取りたい時は、相手の降りる手をアンブロックする (握らない) のが理想です。`
}
