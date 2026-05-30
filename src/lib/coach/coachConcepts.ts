import type { Card, HandRank, Rank } from '../../types/game'
import type { MistakeCategory } from '../../types/stats'
import { RANK_VALUES } from '../../engine/cards/Card'
import { conceptsForMistake } from '../../data/theory/concepts'

// コーチ/ドリル共通の説明エンジン (React 非依存・純TS)。
// approximate スポットでも安全な「一般原則」のみを述べ、ソルバー解の断定はしない。
// ドリルの PRINCIPLE/explain テーブルと整合させ、文言を一箇所に集約する。

// ── プリフロップ ハンドクラス ────────────────────────────────────────────────
export type HandTierKey = 'premium' | 'broadway' | 'suited_ace' | 'pair' | 'suited_connector' | 'junk'

interface HandTier {
  tier: HandTierKey
  label: string
}

const TIER_LABEL: Record<HandTierKey, string> = {
  premium: 'プレミアム',
  broadway: 'ブロードウェイ',
  suited_ace: 'スーテッドエース',
  pair: 'ポケットペア',
  suited_connector: 'スーテッドコネクター',
  junk: '低価値',
}

// 169 レンジ表記 ("AA"/"AKs"/"72o") を堅牢にパースする。不正入力は junk 扱い。
function parseHandKey(handKey: string): { hi: Rank; lo: Rank; suited: boolean; pair: boolean } | null {
  const m = /^([2-9TJQKA])([2-9TJQKA])(s|o)?$/.exec(handKey.trim())
  if (!m) return null
  const r1 = m[1] as Rank
  const r2 = m[2] as Rank
  const pair = r1 === r2
  const [hi, lo] = RANK_VALUES[r1] >= RANK_VALUES[r2] ? [r1, r2] : [r2, r1]
  const suited = m[3] === 's'
  // ペアに s/o が付くのは不正だが寛容に扱う (s/o を無視)。
  return { hi, lo, suited, pair }
}

// プリフロップ ハンドの強さクラスを日本語ラベル付きで返す。169 のどのキーにも応答する。
export function handTier(handKey: string): HandTier {
  const p = parseHandKey(handKey)
  if (!p) return { tier: 'junk', label: TIER_LABEL.junk }
  const { hi, lo, suited, pair } = p
  const hiV = RANK_VALUES[hi]
  const loV = RANK_VALUES[lo]

  if (pair) {
    // QQ+ はプレミアム、それ以外のペアはポケットペア。
    if (hiV >= RANK_VALUES.Q) return { tier: 'premium', label: TIER_LABEL.premium }
    return { tier: 'pair', label: TIER_LABEL.pair }
  }

  // AK はブロードウェイ最上位 (実質プレミアム級だが分類はブロードウェイ)。
  const bothBroadway = hiV >= RANK_VALUES.T && loV >= RANK_VALUES.T
  // A5s〜A2s (ホイール領域のスーテッドエース) — 4bet/3bet ブラフの主役。
  const wheelSuitedAce = hi === 'A' && suited && loV <= 5

  if (wheelSuitedAce) return { tier: 'suited_ace', label: TIER_LABEL.suited_ace }
  // AK/AQ/AJ などブロードウェイ2枚。
  if (bothBroadway) return { tier: 'broadway', label: TIER_LABEL.broadway }
  // A 絡みのスーテッド (A9s〜A6s など) もスーテッドエースに含める。
  if (hi === 'A' && suited) return { tier: 'suited_ace', label: TIER_LABEL.suited_ace }
  // スーテッドコネクター/1ギャッパー (差 ≤ 2・スーテッド・両方 9 以下寄り)。
  if (suited && hiV - loV <= 2) return { tier: 'suited_connector', label: TIER_LABEL.suited_connector }

  return { tier: 'junk', label: TIER_LABEL.junk }
}

// ── ミスカテゴリ解説 (全14) ──────────────────────────────────────────────────
interface CategoryExplain {
  label: string // 短い日本語ラベル
  why: string   // 1文: リーク + 原則
}

// 全 MistakeCategory を網羅。label は短く、why は「漏れ + あるべき原則」を1文で。
export const CATEGORY_EXPLAIN: Record<MistakeCategory, CategoryExplain> = {
  preflop_too_wide: {
    label: 'オープン広すぎ',
    why: '前ポジションで弱い手まで開きすぎ。後に行動される不利を考え、レンジを締める必要があります。',
  },
  preflop_too_tight: {
    label: 'オープン硬すぎ',
    why: '良いポジションでも降りすぎ。後ろの席ほど広くオープンして主導権とブラインドを取りに行くべきです。',
  },
  preflop_passive: {
    label: 'プリフロップ受動的',
    why: 'レイズすべき手をコール/リンプで処理。主導権を取れる手は受動的に入らずレイズで開くのが原則です。',
  },
  preflop_sizing: {
    label: 'プリフロップサイズ',
    why: 'アクションは正しいがサイズが標準から逸脱。GTOは手の強弱でサイズを変えず一定値に統一します。',
  },
  fold_to_3bet: {
    label: '3betに降りすぎ',
    why: 'オープン後の3betに降りすぎ。4bet/コールの続行レンジを一定持たないとブラフ3betに搾取されます。',
  },
  call_3bet_oop: {
    label: 'OOPで3betコール過多',
    why: 'OOPで3betを広くコール。ポジション不利でエクイティ実現が下がるため、難しい手は4betか降りが基本です。',
  },
  blind_defense_wide: {
    label: 'BB防御ワイド',
    why: 'BBで弱い手まで守りすぎ。良いオッズでも実現率の低い手は無理に守らず降りるべきです。',
  },
  blind_defense_tight: {
    label: 'BB防御タイト',
    why: '相手のオープンに対し降りすぎ。BBは既にブラインドを払っており、良いオッズで広く守る必要があります。',
  },
  sb_limp: {
    label: 'SBリンプ',
    why: 'SBからリンプで入っている。主導権を取れずOOPで戦うため、SBはレイズか降りるかが原則です。',
  },
  missed_cbet_ip: {
    label: 'IP Cベット見送り',
    why: 'IPかつレンジ優位の局面でCベットを見送り。多くのフロップで小さく高頻度に打てる権利を放棄しています。',
  },
  cbet_oop_too_wide: {
    label: 'OOP Cベット広すぎ',
    why: 'OOPで全ボードに打ちすぎ。位置不利のため、レンジ優位のあるボードに絞りチェックを多く混ぜるべきです。',
  },
  check_ip_missed_value: {
    label: 'IPバリュー逃し',
    why: 'IPでバリューの取れる手をチェックして回している。薄いバリューでも打てる場面で取りこぼしています。',
  },
  oop_donk_bet: {
    label: 'OOPドンクベット',
    why: 'コール側が先にリードで打っている。レンジ優位はアグレッサー側にあり、大半の局面でドンクは不要です。',
  },
  bluff_frequency: {
    label: 'ブラフ頻度の逸脱',
    why: 'ブラフの量が適正比から外れている。バリューとブラフを適正比で混ぜ、相手のコール/降りを無差別にします。',
  },
  value_bet_missed: {
    label: 'バリューベット逃し',
    why: 'より弱い手にコールされる手をチェック。続行レンジに負ける手があるならバリューを取りに打つべきです。',
  },
}

// ── 一般原則 (プリフロップ / ポストフロップ) ────────────────────────────────
export type PrincipleAction = 'raise' | 'call' | 'check' | 'fold'

// アクションの揺れ (allin/bet 等) を 4 バケットへ正規化。
function bucketAction(action: string): PrincipleAction {
  if (action === 'raise' || action === 'allin' || action === 'bet') return 'raise'
  if (action === 'call') return 'call'
  if (action === 'fold') return 'fold'
  return 'check'
}

// プリフロップの1行原則。位置 + 推奨アクション + ハンドクラスで一般論を述べる
// (preflopDrill.explainPreflop と整合)。approximate 前提のため定性的な指針に留める。
export function preflopPrinciple(handKey: string, position: string, recommendedAction: string): string {
  const tier = handTier(handKey)
  const bucket = bucketAction(recommendedAction)
  const isBlind = position === 'SB' || position === 'BB'
  switch (bucket) {
    case 'raise':
      if (tier.tier === 'suited_ace') return `${tier.label}。Aブロッカーを活かしレイズ候補 (バリュー/ブラフ両面)。`
      if (tier.tier === 'premium' || tier.tier === 'broadway') return `${tier.label}。主導権を取りに行く十分な強さ。レイズ。`
      return `${tier.label}。${position} のレンジに入る強さ。受動的に入らずレイズ。`
    case 'call':
      return `${tier.label}。レイズには届かないがオッズに見合う。コールで受ける。`
    case 'fold':
      if (isBlind) return `${tier.label}。このディフェンスには入らない強さ。フォールド。`
      return `${tier.label}。${position} のオープンレンジ外。フォールド。`
    default:
      return `${tier.label}。${position} ではチェックで様子を見る。`
  }
}

export type MadeTier = 'strong' | 'medium' | 'weak'

// HandRank → 役の強さ階層 (postflopDrill の TIER と一致)。
const RANK_TIER: Record<HandRank, MadeTier> = {
  royal_flush: 'strong', straight_flush: 'strong', four_of_a_kind: 'strong', full_house: 'strong',
  flush: 'strong', straight: 'strong', three_of_a_kind: 'strong', two_pair: 'strong',
  one_pair: 'medium', high_card: 'weak',
}

// postflopDrill.PRINCIPLE と同一の指針 (文言を共有)。
const POSTFLOP_PRINCIPLE: Record<MadeTier, Record<PrincipleAction, string>> = {
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

// ポストフロップの1行原則。HandRank か MadeTier を直接渡せる。
export function postflopPrinciple(madeRankOrTier: HandRank | MadeTier, recommendedAction: string): string {
  const tier: MadeTier = madeRankOrTier in RANK_TIER
    ? RANK_TIER[madeRankOrTier as HandRank]
    : (madeRankOrTier as MadeTier)
  return POSTFLOP_PRINCIPLE[tier][bucketAction(recommendedAction)]
}

// ── ボードテクスチャ分類 ─────────────────────────────────────────────────────
interface BoardTexture {
  label: string
  note: string // 1行の戦略メモ
}

// flop/turn/river いずれの長さも受ける。最も支配的な特徴を1つラベルにする。
export function boardTexture(board: Card[]): BoardTexture {
  if (board.length < 3) return { label: '判定不可', note: 'フロップ以降のボードで判定します。' }

  const ranks = board.map(c => RANK_VALUES[c.rank])
  const suits = board.map(c => c.suit)
  const uniqueRanks = new Set(ranks)
  const paired = uniqueRanks.size < board.length

  // スート集中度。
  const suitCounts: Record<string, number> = {}
  for (const s of suits) suitCounts[s] = (suitCounts[s] ?? 0) + 1
  const maxSuit = Math.max(...Object.values(suitCounts))
  const monotone = maxSuit === board.length
  const twoTone = !monotone && maxSuit >= 2 && board.length === 3

  // 連結度 (ソート済みの隣接差で判定)。フロップ3枚で隣接ギャップが小さいほど連結。
  const sorted = [...new Set(ranks)].sort((a, b) => a - b)
  let connected = false
  for (let i = 0; i + 1 < sorted.length; i++) {
    if (sorted[i + 1] - sorted[i] <= 2) { connected = true; break }
  }
  const highCard = Math.max(...ranks)
  const acePresent = ranks.includes(RANK_VALUES.A)

  // 優先順位: ペア > モノトーン > 連結(ウェット) > Aハイドライ > その他ドライ。
  if (paired) {
    return { label: 'ペアボード', note: 'トリップス/フルハウスの脅威は限定的。レンジ優位側が高頻度に小さく打てます。' }
  }
  if (monotone) {
    return { label: 'モノトーン', note: 'フラッシュが完成しうる。サイズを抑え、フラッシュブロッカーをブラフに選びます。' }
  }
  if (connected) {
    return { label: 'ウェット (連結)', note: 'ストレート/ドローが多く刺さりやすい。ベット頻度を落としチェックも混ぜます。' }
  }
  if (twoTone) {
    return { label: 'ツートーン', note: 'フラッシュドローを含む。ナッツ級にはプロテクション、弱いドローはセミブラフ候補。' }
  }
  if (highCard >= RANK_VALUES.T) {
    const hi = acePresent ? 'Aハイ' : 'ハイカード'
    return { label: `ドライ (${hi})`, note: 'アグレッサーのレンジ優位が明確。小サイズで高頻度のCベットが効きます。' }
  }
  return { label: 'ドライ (ローカード)', note: 'コネクトしにくく主導権側が有利。小さく打って安く降ろせます。' }
}

// ── 理論コンセプトへのディープリンク解決 ─────────────────────────────────────
// 既存の conceptsForMistake の先頭を再利用し、coach/drill が theory へ deep-link できる。
export function conceptIdForCategory(category: MistakeCategory): string | null {
  const concepts = conceptsForMistake(category)
  return concepts[0]?.id ?? null
}
