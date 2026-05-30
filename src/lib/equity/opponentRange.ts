import type { GameState, Player, Position } from '../../types/game'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'

// --- スポット ID マッピング (権威は spotKey.ts / riverRanges.ts。ここは同じ規約を複製) ---
// 共有分類モジュールへの抽出は別タスクの担当のため、この小さなマップを内側に複製する。
const OPEN_SCENARIO: Partial<Record<Position, string>> = {
  UTG: 'utg-open', MP: 'mp-open', CO: 'co-open', BTN: 'btn-open', SB: 'sb-open',
}
// 非BB防御 (単独オープンへの cold-call)。defender → { opener: scenarioId }。spotKey.ts POS_VS_SPOT と対応。
const POS_VS_SPOT: Partial<Record<Position, Partial<Record<Position, string>>>> = {
  SB: { BTN: 'sb-vs-btn', CO: 'sb-vs-co' },
  BTN: { CO: 'btn-vs-co', UTG: 'btn-vs-utg', MP: 'btn-vs-mp' },
  CO: { UTG: 'co-vs-utg' },
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

// villain 1人の想定継続レンジ(カテゴリ)を、その実プリフロップラインから推定。
// still approximate input ranges (hand-crafted scenarios), not solver-exact
//  - レイズ0 (リンプ) → null (RFI 前提が崩れる)
//  - レイズ1 (SRP): villain=opener → '{villain}-open' raise
//                   villain=BB defender → 'bb-vs-{opener}' continue(raise+call)
//                   villain=非BB defender(cold-call) → '{villain}-vs-{opener}' call
//  - レイズ2 (3bet ポット): villain=3better → '{villain}-vs-{opener}' raise(3bet頻度・THREE_BET_POTS のみ)
//                          villain=opener が 3bet をコール → '{villain}-vs-{3better}-3bet' call
//  - レイズ3以上 (4bet+)・未対応 cold-call → null
function villainCategories(state: GameState, villain: Player): string[] | null {
  const line = classifyPreflopLine(state)
  const vp = villain.position

  if (line.raiseCount === 0) return null

  if (line.raiseCount === 1) {
    if (line.openerId === villain.id) {
      const id = OPEN_SCENARIO[vp]
      if (!id) return null
      const cats = categories(id, r => r > 0)
      return cats.length > 0 ? cats : null
    }
    // villain はレイズしていない (defender)。opener は hero か別席 (= villain がコールド参加)。
    const openerPos = state.players.find(p => p.id === line.openerId)?.position
    if (!openerPos) return null
    if (vp === 'BB') {
      const cats = categories(`bb-vs-${lc(openerPos)}`, (r, c) => r > 0 || c > 0)
      return cats.length > 0 ? cats : null
    }
    const id = POS_VS_SPOT[vp]?.[openerPos]
    if (!id) return null
    const cats = categories(id, (_r, c) => c > 0)
    return cats.length > 0 ? cats : null
  }

  if (line.raiseCount === 2) {
    const openerPos = state.players.find(p => p.id === line.openerId)?.position
    const threeBetterPos = state.players.find(p => p.id === line.threeBetterId)?.position
    if (!openerPos || !threeBetterPos) return null
    if (line.threeBetterId === villain.id) {
      // villain が 3bet。'{villain}-vs-{opener}' の raise = 3bet レンジ (THREE_BET_POTS のみ収録)。
      if (!isThreeBetPot(vp, openerPos)) return null
      const cats = categories(`${lc(vp)}-vs-${lc(openerPos)}`, r => r > 0)
      return cats.length > 0 ? cats : null
    }
    if (line.openerId === villain.id) {
      // villain=opener が 3bet を浴びてコール。'{villain}-vs-{3better}-3bet' の call。
      const cats = categories(`${lc(vp)}-vs-${lc(threeBetterPos)}-3bet`, (_r, c) => c > 0)
      return cats.length > 0 ? cats : null
    }
    // villain がレイザーでない (3bet 直面でのコールド参加) → 未対応。
    return null
  }

  return null // 4bet 以上の応酬は未対応
}

// エクイティ計算用に、アクティブな相手(降りていない非hero)の想定レンジ配列を返す。
// HU(相手1人)のみ対応。マルチウェイ/レンジ不明は null(表示しない)。
export function resolveOpponentRanges(state: GameState, heroId: string): string[][] | null {
  const hero = state.players.find(p => p.id === heroId)
  if (!hero) return null
  const villains = state.players.filter(p => p.id !== heroId && !p.isFolded)
  if (villains.length !== 1) return null
  const cats = villainCategories(state, villains[0])
  return cats ? [cats] : null
}
