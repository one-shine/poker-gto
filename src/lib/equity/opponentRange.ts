import type { GameState, Player, Position } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

// --- スポット ID マッピング (権威は spotKey.ts / riverRanges.ts。ここは同じ規約を複製) ---
// 共有分類モジュールへの抽出は別タスクの担当のため、この小さなマップを内側に複製する。
const OPEN_SCENARIO: Partial<Record<Position, string>> = {
  UTG: 'utg-open', MP: 'mp-open', CO: 'co-open', BTN: 'btn-open', SB: 'sb-open',
}
// 非BB防御 (単独オープンへの cold-call)。defender → { opener: scenarioId }。spotKey.ts POS_VS_SPOT と対応。
const POS_VS_SPOT: Partial<Record<Position, Partial<Record<Position, string>>>> = {
  SB: { BTN: 'sb-vs-btn', CO: 'sb-vs-co', MP: 'sb-vs-mp', UTG: 'sb-vs-utg' },
  BTN: { CO: 'btn-vs-co', UTG: 'btn-vs-utg', MP: 'btn-vs-mp' },
  CO: { UTG: 'co-vs-utg', MP: 'co-vs-mp' },
  MP: { UTG: 'mp-vs-utg' },
}
// 3bet ポット (riverRanges.ts THREE_BET_POTS と対応)。
// 3better レンジ = `{3better}-vs-{opener}` の raise(3bet頻度)。
// caller(=opener) レンジ = `{opener}-vs-{3better}-3bet` の call(対3betコール頻度)。
// 注意: 既存の `*-3bet` シナリオは opener の 4bet/call/fold 応答であり 3better のレンジではない。
const THREE_BET_POTS: { threeBetter: Position; opener: Position }[] = [
  { threeBetter: 'SB', opener: 'BTN' },
  { threeBetter: 'BB', opener: 'BTN' },
  { threeBetter: 'SB', opener: 'CO' },
  { threeBetter: 'BB', opener: 'CO' },
  { threeBetter: 'BTN', opener: 'CO' },
]
const lc = (p: Position) => p.toLowerCase()
function isThreeBetPot(threeBetter: Position, opener: Position): boolean {
  return THREE_BET_POTS.some(p => p.threeBetter === threeBetter && p.opener === opener)
}

// シナリオの指定アクション頻度を満たすハンドカテゴリを返す。未収録シナリオは [] (→ 呼出側で null 化)。
function categories(scenarioId: string, pick: (raise: number, call: number) => boolean): string[] {
  const sc = PREFLOP_SCENARIOS.find(s => s.id === scenarioId)
  if (!sc) return []
  return Object.entries(sc.cells).filter(([, c]) => pick(c.raise, c.call)).map(([h]) => h)
}

interface PreflopLine {
  raiseCount: number
  openerId: string | null
  threeBetterId: string | null
}

// villain の preflop ライン分類: レイズ回数・1st/2nd レイザー (= opener/3better) を抽出。
function classifyPreflopLine(state: GameState): PreflopLine {
  const raises = state.actionHistory.filter(a => a.street === 'preflop' && a.action === 'raise')
  return {
    raiseCount: raises.length,
    openerId: raises[0]?.playerId ?? null,
    threeBetterId: raises[1]?.playerId ?? null,
  }
}

// エクイティを出せない理由 (UI で「なぜ出ないか」を1行明示するため)。
//  - no_opponent: 相手0人 (全員フォールド/ショーダウン直前)
//  - limped: リンプ (レイズ0)。RFI 前提が崩れるため相手レンジ不明
//  - fourbet_plus: 4bet 以上の応酬 (未対応)
//  - uncovered_line: 未収録の対戦ライン (3bet 直面コールド参加・未収録ペア等)
//  - sampling_failed: 有効な相手ハンド割当が存在しない (極稀・ブロッカーで全消し)
export type EquityUnavailableReason =
  | 'no_opponent' | 'limped' | 'fourbet_plus' | 'uncovered_line' | 'sampling_failed'

function isReason(x: string[] | EquityUnavailableReason): x is EquityUnavailableReason {
  return !Array.isArray(x)
}

// villain 1人の想定継続レンジ(カテゴリ)を、その実プリフロップラインから推定。
// 成功=string[] / 失敗=EquityUnavailableReason。
// still approximate input ranges (hand-crafted scenarios), not solver-exact
//  - レイズ0 (リンプ) → 'limped'
//  - レイズ1 (SRP): villain=opener → '{villain}-open' raise
//                   villain=BB defender → 'bb-vs-{opener}' continue(raise+call)
//                   villain=非BB defender(cold-call) → '{villain}-vs-{opener}' call
//  - レイズ2 (3bet ポット): villain=3better → '{villain}-vs-{opener}' raise(3bet頻度・THREE_BET_POTS のみ)
//                          villain=opener が 3bet をコール → '{villain}-vs-{3better}-3bet' call
//  - レイズ3以上 (4bet+) → 'fourbet_plus' / 未対応ライン → 'uncovered_line'
function villainCategories(state: GameState, villain: Player): string[] | EquityUnavailableReason {
  const line = classifyPreflopLine(state)
  const vp = villain.position
  const nonEmpty = (cats: string[]): string[] | EquityUnavailableReason =>
    cats.length > 0 ? cats : 'uncovered_line'

  if (line.raiseCount === 0) return 'limped'

  if (line.raiseCount === 1) {
    if (line.openerId === villain.id) {
      const id = OPEN_SCENARIO[vp]
      if (!id) return 'uncovered_line'
      return nonEmpty(categories(id, r => r > 0))
    }
    // villain はレイズしていない (defender)。opener は hero か別席 (= villain がコールド参加)。
    const openerPos = state.players.find(p => p.id === line.openerId)?.position
    if (!openerPos) return 'uncovered_line'
    if (vp === 'BB') {
      return nonEmpty(categories(`bb-vs-${lc(openerPos)}`, (r, c) => r > 0 || c > 0))
    }
    const id = POS_VS_SPOT[vp]?.[openerPos]
    if (!id) return 'uncovered_line'
    return nonEmpty(categories(id, (_r, c) => c > 0))
  }

  if (line.raiseCount === 2) {
    const openerPos = state.players.find(p => p.id === line.openerId)?.position
    const threeBetterPos = state.players.find(p => p.id === line.threeBetterId)?.position
    if (!openerPos || !threeBetterPos) return 'uncovered_line'
    if (line.threeBetterId === villain.id) {
      // villain が 3bet。'{villain}-vs-{opener}' の raise = 3bet レンジ (THREE_BET_POTS のみ収録)。
      if (!isThreeBetPot(vp, openerPos)) return 'uncovered_line'
      return nonEmpty(categories(`${lc(vp)}-vs-${lc(openerPos)}`, r => r > 0))
    }
    if (line.openerId === villain.id) {
      // villain=opener が 3bet を浴びてコール。'{villain}-vs-{3better}-3bet' の call。
      return nonEmpty(categories(`${lc(vp)}-vs-${lc(threeBetterPos)}-3bet`, (_r, c) => c > 0))
    }
    // villain がレイザーでない (3bet 直面でのコールド参加) → 未対応。
    return 'uncovered_line'
  }

  return 'fourbet_plus' // 4bet 以上の応酬は未対応
}

export interface ResolvedRanges {
  ranges: string[][]
  // true = マルチウェイ(相手2人以上)の参考値。HU(相手1人)は false で厳密な相手レンジ。
  // 設計ルール4: マルチウェイは HU 厳密解の対象外だが、エクイティは「参考」として出す。
  reference: boolean
}

// 理由付きの解決結果 (UI 透明性用)。成功 = ResolvedRanges / 失敗 = { reason }。
export type OpponentRangesResult = ResolvedRanges | { reason: EquityUnavailableReason }

export function isResolved(r: OpponentRangesResult): r is ResolvedRanges {
  return 'ranges' in r
}

// アクティブな相手(降りていない非hero)全員の想定レンジを、失敗理由付きで返す。
//  - 相手0人 → { reason: 'no_opponent' }
//  - 相手1人(HU) → reference:false(厳密)
//  - 相手2人以上(マルチウェイ) → 全員のレンジをラインから推定できた場合のみ reference:true。
//    一人でも推定不能なら最初の理由を返す(参考値も出さない=偽値を避ける・ルール1)。
export function resolveOpponentRangesResult(state: GameState, heroId: string): OpponentRangesResult {
  const hero = state.players.find(p => p.id === heroId)
  if (!hero) return { reason: 'no_opponent' }
  const villains = state.players.filter(p => p.id !== heroId && !p.isFolded)
  if (villains.length === 0) return { reason: 'no_opponent' }
  const ranges: string[][] = []
  for (const v of villains) {
    const cats = villainCategories(state, v)
    if (isReason(cats)) return { reason: cats } // 一人でもレンジ不明ならエクイティは出せない
    ranges.push(cats)
  }
  return { ranges, reference: villains.length > 1 }
}

// 後方互換: ranges|null を返す従来 API (理由不要の経路・テスト)。
export function resolveOpponentRangesEx(state: GameState, heroId: string): ResolvedRanges | null {
  const r = resolveOpponentRangesResult(state, heroId)
  return isResolved(r) ? r : null
}

// エクイティ計算用に、アクティブな相手の想定レンジ配列を返す(HU=相手1人のみ・厳密)。
// マルチウェイ/レンジ不明は null。後方互換のため resolveOpponentRangesEx に委譲する。
export function resolveOpponentRanges(state: GameState, heroId: string): string[][] | null {
  const r = resolveOpponentRangesEx(state, heroId)
  return r && !r.reference ? r.ranges : null
}
