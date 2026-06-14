import type { Card, GameState } from '../../types/game'
import { handCategory } from '../../engine/cards/handCategory'
import { RANK_VALUES } from '../../engine/cards/Card'
import { isHeroIP } from '../../engine/game/PositionManager'
import { conceptById } from '../../data/theory/concepts'
import { handTier, boardTexture } from './coachConcepts'
import type { EquityUnavailableReason } from '../equity/opponentRange'

// アクション「前」に出す、答え中立の「考え方・考えるべきこと」ガイド (React 非依存・純TS)。
// ⚠ U8/ルール1: GTO 解の頻度=答えは一切含めない。位置・ハンドクラス・オッズ・相手レンジの
//   定性・ボードテクスチャ等「考える観点」のみを提示する (打った後の答え合わせは別経路)。

export interface Consideration {
  label: string
  value?: string
  note?: string
}

export interface DecisionGuidance {
  situation: string
  considerations: Consideration[]
  conceptIds: string[] // 関連理論 (有効な CONCEPTS id のみ)
  terms: string[]      // 用語チップ (glossary。未知は TermChips が黙って除外)
}

export interface GuidanceContext {
  callAmount: number          // コール額 (0 = 先制局面)
  reqEquity: number           // 必要勝率 (純算術)
  equity: number | null       // 推定勝率 (null = 出せない局面)
  reference?: boolean         // マルチウェイの参考勝率
  equityReason?: EquityUnavailableReason
}

const POS_NOTE: Record<string, string> = {
  UTG: '最前列。後ろ全員に行動される=最もタイトに考える',
  MP: '前寄り。背後が多く慎重に',
  CO: '後方。広めのレンジ・スチールが効く',
  BTN: '最良ポジション。最も広く戦え主導権を取りやすい',
  SB: 'ブラインド。ポストフロップは常に OOP=不利',
  BB: 'ブラインド。投資済みでオッズは良いが OOP',
}

// オープナー位置 → レンジの定性 (頻度=答えではない・タイトさの目安)。
const OPENER_NOTE: Record<string, string> = {
  UTG: 'UTG オープン=最もタイト(強いレンジ)',
  MP: 'MP オープン=タイト寄り',
  CO: 'CO オープン=やや広い',
  BTN: 'BTN オープン=広い(スチール多い)',
  SB: 'SB オープン=広いが OOP',
}

const STREET_JP: Record<string, string> = {
  flop: 'フロップ', turn: 'ターン', river: 'リバー', preflop: 'プリフロップ', showdown: 'ショーダウン',
}

// hero のホールが相手の強コンボを一部消すか (事実=カードリムーバル)。観点のみ・答え(頻度)ではない。
function blockerHint(hole: Card[], board: Card[]): string | null {
  if (board.length < 3 || hole.length < 2) return null
  const suitCount: Record<string, number> = {}
  for (const c of board) suitCount[c.suit] = (suitCount[c.suit] ?? 0) + 1
  // フラッシュ系: 2枚以上同スートのボードで、そのスートの高め(Q+)を持つ → フラッシュを一部ブロック。
  for (const c of hole) {
    if ((suitCount[c.suit] ?? 0) >= 2 && RANK_VALUES[c.rank] >= RANK_VALUES.Q) {
      return 'フラッシュ系の強い組み合わせを一部ブロック (ブラフ価値↑)。'
    }
  }
  // ボードのランクとペア: トリップス/ツーペアを一部ブロック。
  const boardRanks = new Set(board.map(c => c.rank))
  if (hole.some(c => boardRanks.has(c.rank))) {
    return 'ボードに絡む組み合わせ (トリップス/ツーペア) を一部ブロック。'
  }
  // A 保持はトップ級/ナッツのブロッカーになりやすい。
  if (hole.some(c => c.rank === 'A')) {
    return 'A ブロッカー: 相手のトップ級/ナッツの一部を消す。'
  }
  return null
}

// 現局面で「考えるべきこと」を組み立てる。答え(GTO頻度/推奨アクション)は出さない。
// 注: 必要勝率/オッズの数値は OddsGuide が1回だけ出すため、ここの観点には含めない(二重表示回避)。
export function buildDecisionGuidance(state: GameState, heroId: string, ctx: GuidanceContext): DecisionGuidance {
  const hero = state.players.find(p => p.id === heroId)
  const considerations: Consideration[] = []
  const conceptIds: string[] = []
  const terms: string[] = ['ポジション', 'レンジ']

  if (!hero || !hero.holeCards) {
    return { situation: 'この局面の考え方', considerations: [], conceptIds: ['position'], terms }
  }

  const handKey = handCategory(hero.holeCards)
  const tier = handTier(handKey)
  const pos = hero.position
  considerations.push({ label: 'ハンド', value: `${handKey}(${tier.label})` })

  let situation: string

  if (state.street === 'preflop') {
    considerations.push({ label: '位置', value: pos, note: POS_NOTE[pos] })
    conceptIds.push('position')
    const pfRaises = state.actionHistory.filter(a => a.street === 'preflop' && a.action === 'raise')
    const raiseCount = pfRaises.length

    if (raiseCount === 0) {
      situation = `${pos} で未オープン — オープンの判断`
      considerations.push({ label: '主導権', note: 'レイズで入れば主導権+ブラインドを取りに行ける。受動的なリンプは避けるのが原則。' })
      conceptIds.push('rfi-ranges', 'no-limp')
      terms.push('RFI')
    } else {
      const opener = state.players.find(p => p.id === pfRaises[0]?.playerId)
      const openerPos = opener?.position
      if (openerPos && opener?.id !== heroId) {
        considerations.push({ label: '相手レンジ', note: OPENER_NOTE[openerPos] ?? `${openerPos} のレイズに直面` })
      }
      if (raiseCount === 1) {
        situation = openerPos ? `${openerPos} オープンに直面 — 続行の判断` : 'オープンに直面 — 続行の判断'
        conceptIds.push(pos === 'BB' ? 'bb-defense' : 'facing-3bet')
      } else {
        situation = '3bet ポット — 続行の判断'
        conceptIds.push('facing-3bet')
      }
      terms.push('3ベット')
    }

    if (ctx.callAmount > 0) {
      // オッズ数値は OddsGuide が出す(ここでは観点の理論リンクのみ)。
      conceptIds.push('pot-odds')
      terms.push('ポットオッズ', '必要勝率', 'エクイティ')
    }
  } else {
    // ポストフロップ
    const activeSeats = state.players.filter(p => !p.isFolded).map(p => p.seatIndex)
    const ip = isHeroIP(hero.seatIndex, state.buttonSeatIndex, activeSeats)
    considerations.push({
      label: '位置',
      value: ip ? 'IP(後手)' : 'OOP(先手)',
      note: ip ? '相手の行動を見てから決められる=有利' : '先に動く=情報不利。慎重に',
    })
    conceptIds.push('position')

    const bt = boardTexture(state.board)
    considerations.push({ label: 'ボード', value: bt.label, note: bt.note })
    conceptIds.push('board-texture')
    terms.push('ボードテクスチャ')

    // ブロッカー観点 (事実=カードリムーバル。ブラフ/バリューの手選びの材料)。
    const bHint = blockerHint(hero.holeCards, state.board)
    if (bHint) {
      considerations.push({ label: 'ブロッカー', value: handKey, note: bHint })
      conceptIds.push('blockers')
      terms.push('ブロッカー')
    }

    if (ctx.callAmount > 0) {
      situation = `${STREET_JP[state.street]}・${ip ? 'IP' : 'OOP'}でベットに直面 — 続行の判断`
      // オッズ数値は OddsGuide が出す(ここでは観点の理論リンクのみ)。
      conceptIds.push('pot-odds', 'equity-realization')
      terms.push('ポットオッズ', '必要勝率', 'エクイティ')
    } else {
      situation = `${STREET_JP[state.street]}・${ip ? 'IP' : 'OOP'}で先制の判断`
      considerations.push({
        label: '先制',
        note: ip
          ? '自分のレンジ優位か? ボードと位置から「打つ権利」があるかを考える(IP は小サイズ高頻度が効きやすい)。'
          : 'OOP は不利。レンジ優位のボードに絞り、チェックも多く混ぜることを考える。',
      })
      conceptIds.push(ip ? 'cbet-ip' : 'cbet-oop')
      terms.push('Cベット')
      // サイズの使い分け観点 (使い分けの一般原則・GTO頻度ではない)。
      considerations.push({
        label: 'サイズの使い分け',
        note: 'レンジ優位だけなら小さく高頻度 (レンジベット/マージ)。ナッツ優位も明確なら大きく/オーバーベット (ポラライズ)。手の強弱でサイズは変えない。',
      })
      conceptIds.push('bet-sizing', 'polarization')
      terms.push('ポラライズ', 'オーバーベット')
    }
  }

  const validIds = [...new Set(conceptIds)].filter(id => conceptById(id))
  return { situation, considerations, conceptIds: validIds, terms: [...new Set(terms)] }
}
