import type { Card } from '../../types/game'
import { parseCards } from '../../engine/cards/Card'

// ベット判断ドリル (戦略学習拡張 Tier1・B10 追補)。ベットの使い分け
// (レンジベット/ポラライズ/オーバーベット) + バリュー/ポットコントロールの「考え方」を学ぶ。
// heuristic: not GTO-exact — 現ソルバーは単一サイズしか解かないため、ここは
// **一般原則(理論)ベースの整理**であり GTO 頻度の採点ではない。各設問は教科書的原則で
// 正解を1つに定めた curated シナリオ(具体的な自分の手札つき)。正直表示(ルール1): UI で明示する。

export type Approach = 'range_bet' | 'polarize' | 'thin_value' | 'pot_control'

export const APPROACH_JP: Record<Approach, string> = {
  range_bet: '小サイズ高頻度 (レンジベット/マージ)',
  polarize: '大サイズ/オーバーベット (ポラライズ)',
  thin_value: '薄いバリュー (中サイズ)',
  pot_control: 'チェック / ポットコントロール',
}

export type SizingStreet = 'flop' | 'turn' | 'river'

interface RawScenario {
  id: string
  board: string        // "As 7d 2c"
  hero: string         // "Kd Qc" (具体的な自分の2枚)
  street: SizingStreet
  position: string     // 表示用
  heroLabel: string    // ハンドクラスの説明
  situation: string
  correct: Approach
  options: Approach[]   // 正解を含む 3 択
  explain: string
  conceptId: string     // 理論への deep-link (実在 id)
  terms: string[]
}

// 教科書的に正解が一意に定まる curated 設問。アプローチを archetype で対応付け(混同回避):
//   レンジベット=盤面を支配する側の“ノーヒット含むレンジ全体”/ ポラライズ=ナッツ(優位)/
//   薄バリュー=乾いた盤の中位メイド / ポットコントロール=優位の無い盤 or 怖い盤の中位手。
const SCENARIOS: RawScenario[] = [
  {
    id: 'ahigh-dry-ip', board: 'As 7d 2c', hero: 'Kd Qc', street: 'flop', position: 'BTN (PFR・IP)',
    heroLabel: 'KQ (オーバーカード・ノーヒット)', situation: '乾いた A ハイ。あなたがプリフロップレイザーで IP。',
    correct: 'range_bet', options: ['range_bet', 'polarize', 'pot_control'],
    explain: 'A ハイのドライ盤はレイザーのレンジ優位が明確。KQ のような“当たっていない”手も含め、レンジ全体を小サイズ(約1/3)で高頻度に打てる(レンジベット)。チェックは優位の放棄、オーバーベットは根拠(ナッツ優位)不足。',
    conceptId: 'cbet-ip', terms: ['レンジベット', 'レンジ優位', 'Cベット'],
  },
  {
    id: 'akq-river-nutadv', board: 'Ah Ks Qd 7c 2s', hero: 'Jc Tc', street: 'river', position: 'BTN (PFR・IP)',
    heroLabel: 'JT (ナッツ・ストレート)', situation: '高カードが自分のレンジに集中=ナッツ優位が明確なリバー。',
    correct: 'polarize', options: ['polarize', 'thin_value', 'range_bet'],
    explain: 'JT は A-K-Q-J-T のブロードウェイ=ナッツ。ナッツ優位が明確なリバーは、強いバリュー+ブラフに二極化して大サイズ/オーバーベット。小〜中サイズではナッツの取り分を落とす。',
    conceptId: 'polarization', terms: ['ポラライズ', 'ナッツ優位', 'オーバーベット'],
  },
  {
    id: 'jt8-wet-oop-midpair', board: 'Jh Td 8s', hero: 'Th 9d', street: 'flop', position: 'BB (OOP)',
    heroLabel: 'T9 (ミドルペア)', situation: 'ウェットな連結ボード・OOP・中程度の手。',
    correct: 'pot_control', options: ['pot_control', 'polarize', 'thin_value'],
    explain: 'ミドルペアは中途半端な強さ。ウェットな連結ボード・OOP では打つと強い手に育てられ難しいポットを量産。ポットを膨らませずチェック/コールで管理する。',
    conceptId: 'cbet-oop', terms: ['ポットコントロール', 'エクイティ実現'],
  },
  {
    id: 'a85-river-toppair-weak', board: 'Ad 8c 5h 9d 2s', hero: 'Ac 4c', street: 'river', position: 'IP',
    heroLabel: 'A4 (トップペア・弱キッカー)', situation: 'より弱い Ax やミドルペアにコールされうるリバー。',
    correct: 'thin_value', options: ['thin_value', 'polarize', 'pot_control'],
    explain: '弱いキッカーのトップペアは、より弱い Ax やミドルペアからコールを得られる → 薄いバリューを小〜中サイズで取りに行く。大きく打つと弱い手が降り、自分が負ける手だけ残る。',
    conceptId: 'thin-value', terms: ['シンバリュー', 'バリューベット'],
  },
  {
    id: 'qq6-paired-rangebet', board: 'Qs Qd 6c', hero: 'Ah Kh', street: 'flop', position: 'CO (PFR・IP)',
    heroLabel: 'AK (オーバーカード・ノーヒット)', situation: 'ペアボード・トリップス/フルの脅威は限定的・レンジ優位側。',
    correct: 'range_bet', options: ['range_bet', 'polarize', 'pot_control'],
    explain: 'ペアボードは強い組合せが限られ脅威が小さく、レンジ優位側が有利。AK の“当たっていない”手も含めレンジ全体を小サイズで高頻度に打てる。',
    conceptId: 'board-texture', terms: ['レンジベット', 'ボードテクスチャ'],
  },
  {
    id: 'low-connected-check', board: '8s 7d 5h', hero: 'Ac Kd', street: 'flop', position: 'BTN (PFR・IP)',
    heroLabel: 'AK (オーバーカード・ノーヒット)', situation: '低い連結ボードは守備側のストレート/2ペアが多くレンジ優位が薄れる。',
    correct: 'pot_control', options: ['pot_control', 'range_bet', 'polarize'],
    explain: '同じ AK ノーヒットでも、低い連結ボードは守備側に刺さりレンジ優位が薄れる。乾いた盤のように打つと搾取される → 頻度を落としチェックを多めに。',
    conceptId: 'range-advantage', terms: ['レンジ優位', 'ボードテクスチャ'],
  },
  {
    id: 'monotone-river-nutflush', board: 'Kh 9h 4h 2h 7s', hero: 'Ah Qs', street: 'river', position: 'IP',
    heroLabel: 'ナッツフラッシュ (Aハイ)', situation: '4枚ハートの完成フラッシュボード。Ah=ナッツを握る。',
    correct: 'polarize', options: ['polarize', 'thin_value', 'range_bet'],
    explain: '4枚ハートの盤で Ah=ナッツフラッシュ。ナッツ優位+ブロッカーが効く → ポラライズして大きく(バリュー+ブラフ)。中途半端なフラッシュは薄いバリューで別扱い。',
    conceptId: 'blockers', terms: ['ポラライズ', 'ブロッカー', 'ナッツ優位'],
  },
  {
    id: 'lowdry-turn-thinvalue', board: 'Td 7s 4c 2h', hero: 'Th 9h', street: 'turn', position: 'IP',
    heroLabel: 'T9 (トップペア)', situation: '乾いた低めの盤のトップペア。',
    correct: 'thin_value', options: ['thin_value', 'polarize', 'pot_control'],
    explain: '乾いた低めの盤のトップペアは、より弱い Tx・ドローからコールを得られる → 中サイズで薄く厚くバリュー。ナッツ優位ではないのでオーバーベットは過剰。',
    conceptId: 'bet-sizing', terms: ['シンバリュー', 'バリューベット'],
  },
  {
    id: 'scare-river-potcontrol', board: 'Ah Kd 5c 7s Qh', hero: 'Kc Jd', street: 'river', position: 'IP',
    heroLabel: 'KJ (セカンドペア)', situation: 'A・Q が並びフラッシュも完成しうる怖いリバー・中程度の手。',
    correct: 'pot_control', options: ['pot_control', 'thin_value', 'polarize'],
    explain: 'A・Q が並びフラッシュも完成しうる怖いリバー。セカンドペア(K)は薄く打っても強い手にしか呼ばれない → チェックで見せ合いに行き EV を守る。',
    conceptId: 'thin-value', terms: ['ポットコントロール', 'シンバリュー'],
  },
  {
    id: 'q63-turn-thinvalue', board: 'Qd 6s 3h 8c', hero: 'Kc Qh', street: 'turn', position: 'IP',
    heroLabel: 'KQ (トップペア・good kicker)', situation: '明確なトップペア。より弱い Qx やドローからバリューを取れる。',
    correct: 'thin_value', options: ['thin_value', 'polarize', 'pot_control'],
    explain: '良いキッカーのトップペアは、より弱い Qx・ドローからコールを得られる → 中サイズで厚く薄くバリュー。ナッツ優位ではないのでオーバーベットは不要。',
    conceptId: 'value-bluff-balance', terms: ['バリューベット', 'シンバリュー'],
  },
]

export { SCENARIOS as SIZING_SCENARIOS }

export interface SizingQuestion {
  id: string
  board: Card[]
  heroCards: Card[]
  street: SizingStreet
  position: string
  heroLabel: string
  situation: string
  options: Approach[]   // シャッフル済み
  correct: Approach
  explain: string
  conceptId: string
  terms: string[]
}

export interface SizingJudgement {
  correct: boolean
  chosen: Approach
  correctApproach: Approach
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateSizingQuestion(rng: () => number = Math.random): SizingQuestion {
  const sc = SCENARIOS[(rng() * SCENARIOS.length) | 0]
  return {
    id: sc.id,
    board: parseCards(sc.board),
    heroCards: parseCards(sc.hero),
    street: sc.street,
    position: sc.position,
    heroLabel: sc.heroLabel,
    situation: sc.situation,
    options: shuffle(sc.options, rng),
    correct: sc.correct,
    explain: sc.explain,
    conceptId: sc.conceptId,
    terms: sc.terms,
  }
}

export function judgeSizing(q: SizingQuestion, chosen: Approach): SizingJudgement {
  return { correct: chosen === q.correct, chosen, correctApproach: q.correct }
}
