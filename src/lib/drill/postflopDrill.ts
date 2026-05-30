import type { Card, HandRank, PlayerAction, Rank } from '../../types/game'
import { RANKS, SUITS } from '../../engine/cards/Card'
import { evaluateBestHand } from '../../engine/cards/HandEvaluator'
import type { ActionSolution, SolutionSource, SpotKey } from '../../types/solver'
import { getSolution } from '../solver/getSolution'
import { comboKey, expandRange, heroRangeSpec } from '../solver/riverRanges'
import { boardTexture } from '../coach/coachConcepts'

// ポストフロップ ドリル (R23 + R16 3betポット)。HU の単一レイズド/3betポットを自前 CFR で
// 都度求解し、solver_live 解を出題基準にする。turn/flop は showdown をエクイティ近似 (賭け未考慮)。
// 依存方向: drill ← solver。求解は async (Worker CFR) のため UI 側でローディングを持つ。

export type PostflopStreet = 'flop' | 'turn' | 'river'
export type PotType = 'srp' | '3bet'

interface DrillSpot {
  id: string
  label: string
  heroIsOOP: boolean
  potType: PotType
  potBB: number
  effStackBB: number
}

// シングルレイズドポット (2.5x open + call): ストリート開始ポット ≈ 5.5BB / 残り 100BB。
const SRP_POT = 5.5
const SRP_STACK = 100
// 3bet ポット (open 2.5 → 3bet 11 → call): ポット ≈ 22.5BB / 残り ≈ 89BB。
const TB_POT = 22.5
const TB_STACK = 89

// 出題対象スポット。deriveRiverRanges が対応する HU のみ (マルチウェイは未対応)。
const SPOTS: DrillSpot[] = [
  // シングルレイズドポット
  { id: 'bb-vs-btn', label: 'BB ディフェンス vs BTN', heroIsOOP: true, potType: 'srp', potBB: SRP_POT, effStackBB: SRP_STACK },
  { id: 'bb-vs-co', label: 'BB ディフェンス vs CO', heroIsOOP: true, potType: 'srp', potBB: SRP_POT, effStackBB: SRP_STACK },
  { id: 'btn-open', label: 'BTN オープン vs BB', heroIsOOP: false, potType: 'srp', potBB: SRP_POT, effStackBB: SRP_STACK },
  { id: 'co-open', label: 'CO オープン vs BB', heroIsOOP: false, potType: 'srp', potBB: SRP_POT, effStackBB: SRP_STACK },
  // 3bet ポット (hero = 3better=アグレッサー or caller=ディフェンダー)
  { id: '3bp-bb-vs-btn', label: 'BB 3betポット vs BTN (3better)', heroIsOOP: true, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-btn-vs-bb', label: 'BTN 3betをコール vs BB (IP)', heroIsOOP: false, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-bb-vs-co', label: 'BB 3betポット vs CO (3better)', heroIsOOP: true, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-co-vs-bb', label: 'CO 3betをコール vs BB (IP)', heroIsOOP: false, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-sb-vs-btn', label: 'SB 3betポット vs BTN (3better)', heroIsOOP: true, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-btn-vs-sb', label: 'BTN 3betをコール vs SB (IP)', heroIsOOP: false, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-sb-vs-co', label: 'SB 3betポット vs CO (3better)', heroIsOOP: true, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-co-vs-sb', label: 'CO 3betをコール vs SB (IP)', heroIsOOP: false, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-co-vs-btn', label: 'CO 3betポット vs BTN (OOP)', heroIsOOP: true, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
  { id: '3bp-btn-vs-co', label: 'BTN 3betポット vs CO (IP・3better)', heroIsOOP: false, potType: '3bet', potBB: TB_POT, effStackBB: TB_STACK },
]

const BOARD_LEN: Record<PostflopStreet, number> = { flop: 3, turn: 4, river: 5 }
const BET_FRAC = 0.66
const RAISE_FRAC = 0.5 // getSolution が渡す raiseSizes と一致させる
const MIXED_THRESHOLD = 0.10

// 被レイズ節の hero リードベット額 と 相手のレイズ to 額 (riverSolver の facingBet と同式)。
function raiseSizing(potBB: number): { heroBet: number; raiseTo: number } {
  const heroBet = +(potBB * BET_FRAC).toFixed(2)
  const raiseTo = +(heroBet + (potBB + 2 * heroBet) * RAISE_FRAC).toFixed(1)
  return { heroBet: +heroBet.toFixed(1), raiseTo }
}

export interface PostflopQuestion {
  baseSpotId: string
  baseLabel: string
  street: PostflopStreet
  board: Card[]
  heroCards: [Card, Card]
  heroHand: string // カテゴリ表記 (AKs/AKo/AA)
  heroIsOOP: boolean
  facing: boolean // true=被ベット (call/fold/raise) / false=先頭 (check/bet)
  facingRaise: boolean // true=hero の(チェック)ベットがレイズされた節 (fold/call のみ) — R16 深いノード
  potType: PotType
  potBB: number   // このストリート開始時のポット (この街のベット前)
  effStackBB?: number // ストリート開始時の有効スタック (省略時 100)
  facedBetBB?: number // facing=true のとき hero が直面している相手のベット額
  heroBetBB?: number  // facingRaise=true のとき hero 自身のリードベット額
  raiseToBB?: number  // facingRaise=true のとき相手のレイズ to 額
  prompt: string
}

export interface PostflopActionInfo {
  action: PlayerAction
  label: string
  sizeBB?: number
  freq: number
  ev: number
}

export interface PostflopJudgement {
  correct: boolean
  chosen: PlayerAction
  best: PostflopActionInfo[]
  all: PostflopActionInfo[]
  source: SolutionSource | null
}

const ACTION_JP: Record<PlayerAction, string> = {
  fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'ベット/レイズ', allin: 'オールイン',
}

// アクション + サイズから表示ラベルを作る。ベットはポット比 (%) を併記して
// 「何を基準にした額か」が学習者に分かるようにする。被ベット時の raise=レイズ。
function actionLabel(a: ActionSolution, q: PostflopQuestion): string {
  if (a.action === 'raise' && a.sizeBB != null && a.sizeBB > 0) {
    if (q.facing) return `レイズ ${a.sizeBB.toFixed(1)}BB` // 被ベットからの raise = チェックレイズ/レイズ
    const pct = Math.round((a.sizeBB / q.potBB) * 100) // リードベットはポット比で決まる
    return `ベット ${a.sizeBB.toFixed(1)}BB (ポットの${pct}%)`
  }
  return ACTION_JP[a.action]
}

// 52枚デッキから dead を除いてシャッフル (Fisher-Yates, rng 注入で再現可能)。
function shuffledDeck(rng: () => number, dead: Card[] = []): Card[] {
  const deck: Card[] = []
  for (const r of RANKS) for (const s of SUITS) {
    if (!dead.some(d => d.rank === r && d.suit === s)) deck.push({ rank: r, suit: s })
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// コンボ 2枚をカテゴリ表記に変換 (AsKs→AKs, AsKd→AKo, AsAd→AA)。
function comboToCategory(cards: [Card, Card]): string {
  const order = (r: Rank) => RANKS.indexOf(r)
  const [hi, lo] = order(cards[0].rank) >= order(cards[1].rank) ? [cards[0], cards[1]] : [cards[1], cards[0]]
  if (hi.rank === lo.rank) return `${hi.rank}${lo.rank}`
  const suited = hi.suit === lo.suit
  return `${hi.rank}${lo.rank}${suited ? 's' : 'o'}`
}

function promptFor(q: Pick<PostflopQuestion, 'baseLabel' | 'street' | 'heroIsOOP' | 'facing' | 'facingRaise'>): string {
  const streetJP = q.street === 'flop' ? 'フロップ' : q.street === 'turn' ? 'ターン' : 'リバー'
  const posJP = q.heroIsOOP ? 'OOP' : 'IP'
  const sit = q.facingRaise
    ? 'あなたのベットがレイズされました'
    : q.facing
    ? '相手のベットに直面しています'
    : q.heroIsOOP ? 'あなたが先に行動します' : '相手がチェックしました'
  return `${q.baseLabel} · ${streetJP} (${posJP}) — ${sit}`
}

// ランダムなポストフロップ問題を生成。レンジ内 hero ハンド + ランダムボードを保証。
export function generatePostflopQuestion(
  rng: () => number = Math.random,
  street?: PostflopStreet,
  potType: PotType = 'srp',
): PostflopQuestion {
  // ボード長が決まらないと hero レンジ展開ができないので street を先に確定。
  const st: PostflopStreet = street ?? (['flop', 'turn', 'river'] as const)[(rng() * 3) | 0]
  const pool = SPOTS.filter(s => s.potType === potType)
  // 有効な (レンジに手が残る) スポットが出るまで試行。HU は必ず成立するので実質1回。
  for (let attempt = 0; attempt < 20; attempt++) {
    const spot = pool[(rng() * pool.length) | 0]
    const ref = heroRangeSpec(spot.id)
    if (!ref) continue
    const deck = shuffledDeck(rng)
    const board = deck.slice(0, BOARD_LEN[st])
    const heroRange = expandRange(ref.scenarioId, ref.pick, board)
    if (heroRange.length === 0) continue
    const hero = heroRange[(rng() * heroRange.length) | 0]
    // 先頭(check/bet) / 被ベット(fold/call/raise) / 被レイズ(fold/call・深いノード) の3択。
    const roll = rng()
    const facing = roll < 0.4
    const facingRaise = roll >= 0.4 && roll < 0.65
    const sizing = raiseSizing(spot.potBB)
    return {
      baseSpotId: spot.id,
      baseLabel: spot.label,
      street: st,
      board,
      heroCards: hero.cards,
      heroHand: comboToCategory(hero.cards),
      heroIsOOP: spot.heroIsOOP,
      facing,
      facingRaise,
      potType: spot.potType,
      potBB: spot.potBB,
      effStackBB: spot.effStackBB,
      facedBetBB: facing ? +(spot.potBB * BET_FRAC).toFixed(1) : undefined,
      heroBetBB: facingRaise ? sizing.heroBet : undefined,
      raiseToBB: facingRaise ? sizing.raiseTo : undefined,
      prompt: promptFor({ baseLabel: spot.label, street: st, heroIsOOP: spot.heroIsOOP, facing, facingRaise }),
    }
  }
  // フォールバック: 単純な BTN open flop (到達しないはず)。
  const deck = shuffledDeck(rng)
  const board = deck.slice(0, 3)
  const range = expandRange('btn-open', 'raise', board)
  const hero = range[0]
  return {
    baseSpotId: 'btn-open', baseLabel: 'BTN オープン vs BB', street: 'flop', board,
    heroCards: hero.cards, heroHand: comboToCategory(hero.cards), heroIsOOP: false,
    facing: false, facingRaise: false, potType: 'srp', potBB: SRP_POT, effStackBB: SRP_STACK,
    prompt: promptFor({ baseLabel: 'BTN オープン vs BB', street: 'flop', heroIsOOP: false, facing: false, facingRaise: false }),
  }
}

function toSpotKey(q: PostflopQuestion): SpotKey {
  return {
    baseSpotId: q.baseSpotId,
    street: q.street,
    board: q.board,
    heroCards: q.heroCards,
    potBB: q.potBB,
    effStackBB: q.effStackBB ?? 100,
    heroIsOOP: q.heroIsOOP,
    // facingRaise も riverBetBB に hero 自身のリードベット額を入れて betFrac を確定させる。
    riverBetBB: q.facing || q.facingRaise ? +(q.potBB * BET_FRAC).toFixed(2) : 0,
    facingRaise: q.facingRaise,
  }
}

// 自前 CFR で求解し hero ハンドの戦略を返す。null = 未対応スポット (UI でスキップ)。
export async function solvePostflopQuestion(
  q: PostflopQuestion,
): Promise<{ all: PostflopActionInfo[]; source: SolutionSource } | null> {
  const sol = await getSolution(toSpotKey(q), { allowLiveSolve: true })
  if (!sol) return null
  const acts = sol.strategy[comboKey(q.heroCards)] ?? []
  if (acts.length === 0) return null
  const all: PostflopActionInfo[] = acts.map(a => ({
    action: a.action,
    label: actionLabel(a, q),
    sizeBB: a.sizeBB,
    freq: a.frequency,
    ev: a.ev,
  }))
  return { all, source: sol.source }
}

// ── 短い説明文 (なぜこの推奨か) ──────────────────────────────────────────────
// hero の「実際のメイド役」(HandEvaluator で算出=事実) と、推奨アクション
// (ソルバー解) を一般原則で結ぶ。ソルバーの厳密な導出ではなく学習用の解釈。
const HAND_JP: Record<HandRank, string> = {
  royal_flush: 'ロイヤルフラッシュ', straight_flush: 'ストレートフラッシュ', four_of_a_kind: 'フォーカード',
  full_house: 'フルハウス', flush: 'フラッシュ', straight: 'ストレート', three_of_a_kind: 'スリーカード',
  two_pair: 'ツーペア', one_pair: 'ワンペア', high_card: 'ノーペア',
}
type Tier = 'strong' | 'medium' | 'weak'
const TIER: Record<HandRank, Tier> = {
  royal_flush: 'strong', straight_flush: 'strong', four_of_a_kind: 'strong', full_house: 'strong',
  flush: 'strong', straight: 'strong', three_of_a_kind: 'strong', two_pair: 'strong',
  one_pair: 'medium', high_card: 'weak',
}
type ActBucket = 'raise' | 'call' | 'check' | 'fold'
const PRINCIPLE: Record<Tier, Record<ActBucket, string>> = {
  strong: {
    raise: 'バリューを取りに積極的にベット/レイズ。', call: 'レイズで飛ばさずコールで価値を引き出す。',
    check: 'チェックで相手のベットやブラフを誘う。', fold: '強い手だが状況により撤退。',
  },
  medium: {
    raise: '中程度の強さ。薄いバリュー＋プレッシャーでベット。', call: 'ポットを膨らませずコールで受ける。',
    check: 'ポットを抑えてショーダウンを目指す。', fold: '分が悪く、フォールドが無難。',
  },
  weak: {
    raise: 'ブラフ/セミブラフでフォールドエクイティを取る。', call: 'ドローやオッズを見込んでコール。',
    check: '無駄な投資を避けチェック。', fold: '勝ち目が薄く、フォールドが損失最小。',
  },
}

// ポジションごとのCベット観点 (一般原則・solver_live は簡易求解=参考値)。
function positionNote(q: PostflopQuestion): string {
  return q.heroIsOOP
    ? 'OOP (先に行動・位置不利) のため、レンジ優位の無いボードはチェックを多めに混ぜる。'
    : 'IP (後に行動・位置有利) のため、レンジ優位のあるボードは小さく高頻度に打てる。'
}

// 推奨(最高頻度)アクションと hero の役・ボードテクスチャ・位置から説明を作る。
// solver_live (簡易求解) 基準なので、サイジング/頻度は一般原則として述べ厳密値とは称さない。
export function explainPostflop(q: PostflopQuestion, all: PostflopActionInfo[]): string {
  const made = evaluateBestHand([...q.heroCards, ...q.board])
  const tier = TIER[made.rank]
  const top = [...all].sort((a, b) => b.freq - a.freq)[0]
  const bucket: ActBucket = !top ? 'check'
    : top.action === 'raise' || top.action === 'allin' ? 'raise'
    : top.action === 'call' ? 'call' : top.action === 'fold' ? 'fold' : 'check'

  const texture = boardTexture(q.board)
  const sentences = [
    `${HAND_JP[made.rank]}。${PRINCIPLE[tier][bucket]}`,
    `ボードは「${texture.label}」: ${texture.note}`,
    positionNote(q),
  ]
  // 自分が先頭でベットする節のみサイジング根拠を添える (被ベット時のレイズ額は別ロジック)。
  if (!q.facing && !q.facingRaise && bucket === 'raise') {
    sentences.push('サイズはポットの約2/3 (≈67%) が基準で、手の強弱で変えず一定にする (読まれないため)。')
  }
  return sentences.join(' ')
}

export function judgePostflop(
  all: PostflopActionInfo[],
  source: SolutionSource | null,
  chosen: PlayerAction,
): PostflopJudgement {
  const best = all.filter(a => a.freq >= MIXED_THRESHOLD)
  const chosenFreq = all.find(a => a.action === chosen)?.freq ?? 0
  return { correct: chosenFreq >= MIXED_THRESHOLD, chosen, best, all, source }
}

export { ACTION_JP }
