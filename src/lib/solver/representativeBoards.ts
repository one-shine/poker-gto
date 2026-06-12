import type { Card, Rank, Suit } from '../../types/game'
import type { Combo } from './riverSolver'
import { spotRanges } from './riverRanges'
import { capRange, capRangeSuitClosed, narrowByRiverStrength } from './rangeNarrowing'
import { boardSuitPerms } from './suitIsomorphism'

// 「代表ボード」事前計算ライブラリの盤面定義 (純データ)。
// 設計ルール1: 事前計算が正直に solver_precomputed と名乗れるのは
//   - river: 後続ストリート無し=厳密 CFR
//   - turn : river ベッティングを織り込む完全チャンスノード CFR (exploit 4〜5%)
//   - flop : turn+river ベッティング織り込み完全チャンスノード CFR (exploit 0.03%・cap100)
// ゲームもドリルもランダム盤面なので、完全一致の事前計算は「こちらが盤面を選ぶ」代表ボードドリルでのみ
// ヒットする。ここで選んだ教科書的テクスチャの解を JSON 同梱し、その問題は live solve 無しで即時・
// オフラインに解答提示する (モバイルのカバー率向上)。

const SUIT_OF: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

// "Ah Kd 7s" → Card[] (読みやすさのため文字列で定義)。
function parseBoard(notation: string): Card[] {
  return notation.trim().split(/\s+/).map(tok => {
    const rank = tok[0] as Rank
    const suit = SUIT_OF[tok[1]]
    if (!suit) throw new Error(`invalid card token: ${tok}`)
    return { rank, suit }
  })
}

export type RepStreet = 'flop' | 'turn' | 'river'

export interface RepresentativeBoard {
  id: string
  street: RepStreet
  board: Card[]
  label: string // テクスチャ名 (日本語・ドリル表示用)
  note: string  // 一言の特徴 (学習用)
}

// 代表テクスチャ。flop(完全チャンスCFR)/turn(完全チャンスCFR)/river(厳密CFR) 各ストリート。
// 各盤面は全 SRP スポット共通で使える (deriveRiverRanges がスポット別レンジを board=デッドカードとして扱うため)。
export const REPRESENTATIVE_BOARDS: RepresentativeBoard[] = [
  // ── フロップ (3枚) ──
  { id: 'flop-ahigh-dry',        street: 'flop', board: parseBoard('Ah Kd 7s'),
    label: 'A高・ドライ (レインボー)', note: 'A-K ハイのバラ柄。アグレッサーのレンジ優位が大きい。' },
  { id: 'flop-mid-twotone',      street: 'flop', board: parseBoard('Th 9h 5s'),
    label: '中位・ツートーン', note: 'ミドルカード+ツートーン。ドロー密度が高くダイナミック。' },
  { id: 'flop-paired',           street: 'flop', board: parseBoard('Qs Qd 6c'),
    label: 'ペアボード', note: 'QQ ペア。トリップス持ちの偏在でブラフが効きにくい。' },
  { id: 'flop-low-connected',    street: 'flop', board: parseBoard('8s 7d 5h'),
    label: '低位・コネクト (ストレーティ)', note: 'ロー寄りの繋がった盤面。ディフェンダー側がヒットしやすい。' },
  { id: 'flop-monotone',         street: 'flop', board: parseBoard('Kh 9h 4h'),
    label: 'モノトーン (フラッシュ3枚)', note: 'ハート3枚のモノトーン。フラッシュ完成で戦略が二極化。' },
  { id: 'flop-broadway-twotone', street: 'flop', board: parseBoard('Qd Jd 8s'),
    label: 'ブロードウェイ・ツートーン', note: 'Q-J ハイのツートーン。ストレート+フラッシュドロー共存。' },
  { id: 'flop-alow-dry',         street: 'flop', board: parseBoard('Ac 7d 2s'),
    label: 'A低・ドライ', note: 'A と低カード2枚。トップペアの強さが均一で c-bet が入りやすい。' },
  { id: 'flop-low-twotone',      street: 'flop', board: parseBoard('6c 5c 4d'),
    label: '低位・コネクト・ツートーン', note: 'ロー繋がり+ツートーン。ストレート・フラッシュドロー密度が最大級。' },
  { id: 'flop-khigh-dry',        street: 'flop', board: parseBoard('Kd Qc 2h'),
    label: 'K高・ドライ', note: 'K-Q ハイのレインボー。アグレッサー有利だが A がなくレンジ差が中程度。' },
  { id: 'flop-mid-dry',          street: 'flop', board: parseBoard('Jh 7s 2d'),
    label: 'J中位・ドライ', note: 'J 高のレインボー。典型的「中間テクスチャ」でベット頻度・サイズが試される。' },

  // ── ターン (4枚) ──
  { id: 'turn-ahigh-dry', street: 'turn', board: parseBoard('Ah Kd 7s 2c'),
    label: 'A高・ドライ (レインボー)', note: 'A-K ハイのバラ柄。アグレッサーのレンジ優位が大きい。' },
  { id: 'turn-mid-twotone', street: 'turn', board: parseBoard('Th 9h 5s 2d'),
    label: '中位・ツートーン (フラッシュドロー)', note: 'ミドルカード+フラッシュドロー。ダイナミックで頻度が割れる。' },
  { id: 'turn-paired', street: 'turn', board: parseBoard('Qs Qd 6c 3h'),
    label: 'ペアボード・ドライ', note: 'QQ ペア。トリップス/オーバーペアが偏在しレンジが薄い。' },
  { id: 'turn-low-connected', street: 'turn', board: parseBoard('8s 7d 5h 4c'),
    label: '低位・コネクト (ストレーティ)', note: 'ロー寄りの繋がった盤面。ディフェンダー側がヒットしやすい。' },

  // ── リバー (5枚) ──
  { id: 'river-ahigh-brick', street: 'river', board: parseBoard('Ah Kd 7s 2c 9h'),
    label: 'A高・ブリック完走', note: 'A高でドローが全て外れた乾いた完走。薄いバリュー/ブラフの判断。' },
  { id: 'river-flush-complete', street: 'river', board: parseBoard('Th 9h 5s 2d 4h'),
    label: 'フラッシュ完成 (ポラライズ)', note: 'ハート3枚でフラッシュ完成。バリューとブラフに二極化。' },
  { id: 'river-paired', street: 'river', board: parseBoard('Qs Qd 6c 3h 8s'),
    label: 'ペアボード完走', note: 'QQ ペア盤の完走。フルハウス/トリップスの存在でコールが締まる。' },
  { id: 'river-broadway-overcard', street: 'river', board: parseBoard('8s 7d 5h 4c Jd'),
    label: 'ロー→オーバーカード完走', note: 'ロー繋がり盤に J 完走。ドロー外れとセカンドバリューの境界。' },
]

export function representativeBoard(id: string): RepresentativeBoard | undefined {
  return REPRESENTATIVE_BOARDS.find(b => b.id === id)
}

// 事前計算が対象とする SRP スポット (= scripts/precompute-postflop.ts と一致)。
export const REPRESENTATIVE_SPOTS = ['bb-vs-btn', 'bb-vs-co', 'btn-open', 'co-open'] as const

// 3bet ポットの代表スポット (3better OOP × caller IP を BB/SB 3bet vs BTN/CO で対)。
export const REPRESENTATIVE_3BET_SPOTS = [
  '3bp-bb-vs-btn', '3bp-btn-vs-bb', '3bp-bb-vs-co', '3bp-co-vs-bb', '3bp-sb-vs-btn', '3bp-btn-vs-sb',
] as const

// 事前計算する pot 種別ごとの設定 (script / drill / getSolution が共有する権威値)。
// pot/stack は postflopDrill.ts の SRP_POT/SRP_STACK・TB_POT/TB_STACK と一致させる。
export interface RepresentativeSpotSet {
  potType: 'srp' | '3bet'
  potBB: number
  effStackBB: number
  spots: readonly string[]
}
export const REPRESENTATIVE_SPOT_SETS: RepresentativeSpotSet[] = [
  { potType: 'srp', potBB: 5.5, effStackBB: 100, spots: REPRESENTATIVE_SPOTS },
  { potType: '3bet', potBB: 22.5, effStackBB: 89, spots: REPRESENTATIVE_3BET_SPOTS },
]

export function representativeSpotSet(potType: 'srp' | '3bet'): RepresentativeSpotSet {
  return REPRESENTATIVE_SPOT_SETS.find(s => s.potType === potType)!
}

// 代表ボード事前計算で hero レンジに適用するコンボ上限 (script と drill で共有=ドリフト防止)。
// この cap/narrow を通った hero コンボだけがテーブルに入る → ドリルは同じ集合から出題し必ずヒットさせる。
export const REP_RIVER_CAP = 200
export const REP_TURN_CAP = 64
// flop CFR は O(combos²×turn_runout×river_runout) で重い。ベンチ確定値 100 で exploit 0.03% を達成。
export const REP_FLOP_CAP = 100

// 代表ボードの hero 側コンボ集合を事前計算と同一手順 (spotRanges → narrow(river) → cap) で再現する。
// ドリルがここから hero ハンドを抽選すれば、その comboKey は必ず JSON テーブルに存在する。
// flop: suitIso 縮約の前提=置換閉性 → capRangeSuitClosed(boardSuitPerms 使用) を使う。
//   capRange では iso 縮約が安全弁で劣化する(orbit を分断した cap だと写像先コンボが欠ける)。
export function representativeHeroCombos(spotId: string, board: Card[], street: RepStreet): Combo[] {
  const ranges = spotRanges(spotId, board)
  if (!ranges) return []
  const rawHero = ranges.heroIsOOP ? ranges.oop : ranges.ip
  if (street === 'flop') {
    const perms = boardSuitPerms(board).filter(Boolean)
    return capRangeSuitClosed(rawHero, REP_FLOP_CAP, perms)
  }
  const narrowed = street === 'river' ? narrowByRiverStrength(rawHero, board) : rawHero
  return capRange(narrowed, undefined, street === 'turn' ? REP_TURN_CAP : REP_RIVER_CAP)
}

// ── 事前計算解の同梱キー (getSolution の参照 / スクリプトの出力で共有) ──

// 盤面のキー文字列 (例 "AhKd7s2c")。getSolution / precompute が同じ直列化を使うため一元化する。
export function boardCode(board: Card[]): string {
  return board.map(c => `${c.rank}${c.suit[0]}`).join('')
}

// 事前計算する hero ノードの種別。v1 は lead(先頭) / facing(被ベット) のみ
// (facingRaise=被レイズは深い稀ノード → 代表ドリルの対象外)。
export type PrecomputePhase = 'lead' | 'facing'

// 事前計算 JSON のファイル名ステム (拡張子なし)。spot__board__phase。
// 例: "bb-vs-btn__AhKd7s2c__lead"。
export function precomputePostflopKey(
  spotId: string, board: Card[], phase: PrecomputePhase,
): string {
  return `${spotId}__${boardCode(board)}__${phase}`
}
