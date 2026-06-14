import type { Card } from '../../types/game'
import { parseCards } from '../../engine/cards/Card'

// ベット判断ドリル (戦略学習拡張 Tier1・B10 追補)。ベットの使い分け
// (レンジベット/ポラライズ/オーバーベット) + バリュー/ポットコントロールの「考え方」を学ぶ。
// heuristic: not GTO-exact — 現ソルバーは単一サイズしか解かないため、ここは
// **一般原則(理論)ベースの整理**であり GTO 頻度の採点ではない。各設問は教科書的原則で
// 正解を1つに定めた curated シナリオ。正直表示(ルール1): UI で「GTO採点ではない」と明示する。

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
  street: SizingStreet
  position: string     // 表示用
  heroLabel: string    // ハンドクラスの説明 (combo 固定ではない=原則レベル)
  situation: string
  correct: Approach
  options: Approach[]   // 正解を含む 3 択
  explain: string
  conceptId: string     // 理論への deep-link (実在 id)
  terms: string[]
}

// 教科書的に正解が一意に定まる curated 設問。4 アプローチを全て学べるよう分散。
const SCENARIOS: RawScenario[] = [
  {
    id: 'ahigh-dry-ip', board: 'As 7d 2c', street: 'flop', position: 'BTN (PFR・IP)',
    heroLabel: 'レンジ全体 (主導権側)', situation: '乾いたAハイ。あなたがプリフロップレイザーで IP。',
    correct: 'range_bet', options: ['range_bet', 'polarize', 'pot_control'],
    explain: 'ドライ&レンジ優位が明確 → レンジ全体を小サイズ(約1/3)で高頻度に。ナッツ優位は突出しないのでオーバーベットは過剰、チェックは優位の放棄。',
    conceptId: 'cbet-ip', terms: ['レンジベット', 'レンジ優位', 'Cベット'],
  },
  {
    id: 'akq-river-nutadv', board: 'Ah Ks Qd 7c 2s', street: 'river', position: 'BTN (PFR・IP)',
    heroLabel: 'セット/AK 等のナッツ級 + ブロッカー付きブラフ', situation: '高カードが自分のレンジに集中=ナッツ優位が明確なリバー。',
    correct: 'polarize', options: ['polarize', 'thin_value', 'range_bet'],
    explain: 'ナッツ優位が明確 → 強いバリューとブラフに二極化し大サイズ/オーバーベット。小〜中サイズでは取りこぼす。',
    conceptId: 'polarization', terms: ['ポラライズ', 'ナッツ優位', 'オーバーベット'],
  },
  {
    id: 'jt8-wet-oop-midpair', board: 'Jh Td 8s', street: 'flop', position: 'BB (OOP)',
    heroLabel: 'ミドルペア (例 T9)', situation: 'ウェットな連結ボード・OOP・中程度の手。',
    correct: 'pot_control', options: ['pot_control', 'polarize', 'thin_value'],
    explain: '優位が薄いウェットボード+中途半端な手+OOP → ポットを膨らませずチェック/コールで管理。打つと強い手に育てられ難しいポットを量産。',
    conceptId: 'cbet-oop', terms: ['ポットコントロール', 'エクイティ実現'],
  },
  {
    id: 'a85-river-toppair-weak', board: 'Ad 8c 5h 2s 9d', street: 'river', position: 'IP',
    heroLabel: 'トップペア弱キッカー (例 A4)', situation: 'より弱い Ax やミドルペアにコールされうるリバー。',
    correct: 'thin_value', options: ['thin_value', 'polarize', 'pot_control'],
    explain: 'より弱い続行手にコールされる → 薄いバリューを小〜中サイズで取りに行く。大きく打つと弱い手が降り、自分が負ける手だけ残る。',
    conceptId: 'thin-value', terms: ['シンバリュー', 'バリューベット'],
  },
  {
    id: 'qq6-paired-rangebet', board: 'Qs Qd 6c', street: 'flop', position: 'CO (PFR・IP)',
    heroLabel: 'レンジ全体', situation: 'ペアボード・トリップス/フルの脅威は限定的・レンジ優位側。',
    correct: 'range_bet', options: ['range_bet', 'polarize', 'pot_control'],
    explain: 'ペアボードは強い手の組合せが限られ脅威が小さい → レンジ優位側が小サイズで高頻度に打てる。',
    conceptId: 'board-texture', terms: ['レンジベット', 'ボードテクスチャ'],
  },
  {
    id: 'low-connected-check', board: '8s 7d 5h', street: 'flop', position: 'BTN (PFR・IP)',
    heroLabel: 'オーバーカード (例 AK)', situation: '低い連結ボードは守備側のストレート/2ペアが多くレンジ優位が薄れる。',
    correct: 'pot_control', options: ['pot_control', 'range_bet', 'polarize'],
    explain: '相手に刺さる低連結ボードはレンジ優位が薄れる → Cベット頻度を落としチェック多め。乾いたボード感覚で打つと搾取される。',
    conceptId: 'range-advantage', terms: ['レンジ優位', 'ボードテクスチャ'],
  },
  {
    id: 'monotone-river-nutflush', board: 'Kh 9h 4h 2h 7s', street: 'river', position: 'IP',
    heroLabel: 'ナッツフラッシュ(Ah) または Ah ブロッカーのブラフ', situation: 'フラッシュ完成ボード。ナッツを握る/ナッツをブロックする。',
    correct: 'polarize', options: ['polarize', 'thin_value', 'range_bet'],
    explain: 'ナッツ優位+ブロッカーが効くフラッシュ盤 → ポラライズして大きく(バリュー+Ah ブロッカーのブラフ)。中途半端なフラッシュは薄いバリューで別扱い。',
    conceptId: 'blockers', terms: ['ポラライズ', 'ブロッカー', 'ナッツ優位'],
  },
  {
    id: 'k83-turn-merge', board: 'Ks 8c 3d 2h', street: 'turn', position: 'CO (PFR・IP)',
    heroLabel: 'Kx/Ax/ポケット等のレンジ', situation: 'Kハイ乾き。レンジ優位はあるがナッツ優位は突出しない。',
    correct: 'range_bet', options: ['range_bet', 'polarize', 'pot_control'],
    explain: 'レンジ優位はあるがナッツ優位が拮抗 → 中程度の手まで含むマージレンジで小〜中サイズ高頻度。オーバーベットの根拠(ナッツ優位)は弱い。',
    conceptId: 'polarization', terms: ['マージ', 'レンジ優位'],
  },
  {
    id: 'scare-river-potcontrol', board: 'Ah Kd 5c 7s Qh', street: 'river', position: 'IP',
    heroLabel: 'セカンドペア (例 Kx)', situation: 'オーバーカード/フラッシュが完成しうる怖いリバー・中程度の手。',
    correct: 'pot_control', options: ['pot_control', 'thin_value', 'polarize'],
    explain: 'ボードが伸びて中程度の手の価値が下がるリバー → 薄く打っても強い手にしか呼ばれない。チェックで見せ合いに行き EV を守る。',
    conceptId: 'thin-value', terms: ['ポットコントロール', 'シンバリュー'],
  },
  {
    id: 'q63-turn-thinvalue', board: 'Qd 6s 3h 8c', street: 'turn', position: 'IP',
    heroLabel: 'トップペア (例 KQ)', situation: '明確なトップペア。より弱い Qx やドローからバリューを取れる。',
    correct: 'thin_value', options: ['thin_value', 'polarize', 'pot_control'],
    explain: '明確なバリュー手で、より弱い Qx・ドローからコールを得られる → 中サイズで厚く薄くバリュー。ナッツ優位ではないのでオーバーベットは過剰。',
    conceptId: 'thin-value', terms: ['バリューベット', 'シンバリュー'],
  },
]

export { SCENARIOS as SIZING_SCENARIOS }

export interface SizingQuestion {
  id: string
  board: Card[]
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
