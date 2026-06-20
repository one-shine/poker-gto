import { describe, it, expect } from 'vitest'
import { decideFishAction } from './fishHeuristic'
import type { ActionRecord, GameState, Player, PlayerAction, Street } from '../../types/game'

// button=seat0。postflop で最後に行動=IP。seat0=BTN(offset0→IP)・seat2=BB(OOP)・seat4=MP(中間)。
function mkPlayer(id: string, seatIndex: number, over: Partial<Player> = {}): Player {
  return {
    id, position: seatIndex === 0 ? 'BTN' : seatIndex === 2 ? 'BB' : 'MP', seatIndex,
    stackBB: 100, holeCards: null, isHero: false, agentType: 'fish_ai',
    isFolded: false, isAllIn: false, currentBetBB: 0, ...over,
  }
}

function pf(playerId: string, action: PlayerAction): ActionRecord {
  const amt = action === 'raise' ? 2.5 : action === 'allin' ? 100 : action === 'call' ? 1 : 0
  return {
    handId: 'h', street: 'preflop', playerId, heroPosition: 'BTN', villainPositions: [],
    action, amountBB: amt, potBB: 1.5, isIP: false, timestamp: 0,
  }
}

function mkState(opts: {
  aggressor?: string         // 単独プリフロップレイザーの id (簡便指定)
  history?: ActionRecord[]   // 明示指定 (リンプ/allin 等)
  street?: Street
  players?: Player[]
  pot?: number
} = {}): GameState {
  const history = opts.history ?? (opts.aggressor ? [pf(opts.aggressor, 'raise')] : [])
  return {
    handId: 'h', street: opts.street ?? 'flop',
    players: opts.players ?? [mkPlayer('ip', 0), mkPlayer('oop', 2)],
    board: [], pot: { mainPotBB: opts.pot ?? 6, sidePots: [] },
    actionHistory: history, currentActorId: null, buttonSeatIndex: 0,
    bigBlindBB: 1, smallBlindBB: 0.5, handNumber: 1, isHandComplete: false,
  }
}

const FREE: PlayerAction[] = ['check', 'raise']          // callAmount=0 (先頭/チェック回し)
const FACING: PlayerAction[] = ['fold', 'call', 'raise'] // 被ベット

function lead(state: GameState, playerId: string, profile: 'fish' | 'gto', rng: () => number) {
  return decideFishAction(state, playerId, FREE, 0, 1, profile, rng)
}

describe('fishHeuristic postflop — donk suppression', () => {
  it('GTO: OOP 非アグレッサーは先頭でほぼチェック (ドンクしない)', () => {
    const state = mkState({ aggressor: 'ip' }) // aggressor=IP → OOP がドンク候補
    expect(lead(state, 'oop', 'gto', () => 0.10).action).toBe('check') // 0.10 > donk 0.04
    expect(lead(state, 'oop', 'gto', () => 0.5).action).toBe('check')
  })

  it('GTO: ドンクは閾値未満でのみ稀に出る', () => {
    expect(lead(mkState({ aggressor: 'ip' }), 'oop', 'gto', () => 0.01).action).toBe('raise') // 0.01 < 0.04
  })

  it('fish はドンクをより漏らす (0.10 で打つ・gto は打たない)', () => {
    const state = mkState({ aggressor: 'ip' }) // fish donk 0.12 / gto 0.04
    expect(lead(state, 'oop', 'fish', () => 0.10).action).toBe('raise')
    expect(lead(state, 'oop', 'gto', () => 0.10).action).toBe('check')
  })

  it('ドンク頻度は後ストリートほど上がる (C ベットと逆方向)', () => {
    // gto donk flop 0.04 / river 0.08。rng=0.05 は flop でチェック, river で打つ。
    expect(lead(mkState({ aggressor: 'ip', street: 'flop' }), 'oop', 'gto', () => 0.05).action).toBe('check')
    expect(lead(mkState({ aggressor: 'ip', street: 'river' }), 'oop', 'gto', () => 0.05).action).toBe('raise')
  })
})

describe('fishHeuristic postflop — c-bet / stab', () => {
  it('アグレッサーは先頭で C ベットを打つ (OOP でも)', () => {
    const state = mkState({ aggressor: 'oop' }) // gto cbet 0.60
    expect(lead(state, 'oop', 'gto', () => 0.5).action).toBe('raise')
    expect(lead(state, 'oop', 'gto', () => 0.7).action).toBe('check')
  })

  it('fish は C ベットを打ち損ねる (gto より低頻度)', () => {
    const state = mkState({ aggressor: 'oop' }) // gto 0.60 / fish 0.52
    expect(lead(state, 'oop', 'gto', () => 0.55).action).toBe('raise') // 0.55 < 0.60
    expect(lead(state, 'oop', 'fish', () => 0.55).action).toBe('check') // 0.55 > 0.52
  })

  it('IP 非アグレッサーは相手チェックにスタブする (ドンクより高頻度)', () => {
    const state = mkState({ aggressor: 'oop' }) // IP は非アグレッサー → stab 0.42
    expect(lead(state, 'ip', 'gto', () => 0.3).action).toBe('raise')
    expect(lead(state, 'ip', 'gto', () => 0.5).action).toBe('check')
  })

  it('fish はスタブも控えめ (gto より低頻度)', () => {
    const state = mkState({ aggressor: 'oop' }) // gto stab 0.42 / fish 0.37
    expect(lead(state, 'ip', 'gto', () => 0.40).action).toBe('raise') // 0.40 < 0.42
    expect(lead(state, 'ip', 'fish', () => 0.40).action).toBe('check') // 0.40 > 0.37
  })

  it('後ストリートほど C ベット頻度は下がる', () => {
    expect(lead(mkState({ aggressor: 'oop', street: 'flop' }), 'oop', 'gto', () => 0.5).action).toBe('raise')
    expect(lead(mkState({ aggressor: 'oop', street: 'river' }), 'oop', 'gto', () => 0.5).action).toBe('check')
  })
})

describe('fishHeuristic postflop — リンプ(アグレッサー不在)ポット', () => {
  const limped = () => mkState({ history: [pf('oop', 'call')] }) // 誰もレイズしていない

  it('OOP はドンク扱いせず中庸にリードする', () => {
    // 限ポット OOP gto 0.30。ドンク(0.04)なら 0.10 はチェックのはず → 区別できる。
    expect(lead(limped(), 'oop', 'gto', () => 0.10).action).toBe('raise')
    expect(lead(limped(), 'oop', 'gto', () => 0.5).action).toBe('check')
  })

  it('IP は OOP より高頻度でリードする', () => {
    // 限ポット IP gto 0.40。
    expect(lead(limped(), 'ip', 'gto', () => 0.35).action).toBe('raise')
    expect(lead(limped(), 'ip', 'gto', () => 0.5).action).toBe('check')
  })

  it('プリフロップ allin はアグレッサー扱い (C ベットする)', () => {
    const state = mkState({ history: [pf('ip', 'allin')] })
    expect(lead(state, 'ip', 'gto', () => 0.5).action).toBe('raise')  // aggressor → cbet 0.60
    expect(lead(state, 'oop', 'gto', () => 0.10).action).toBe('check') // 非アグレッサー → donk 0.04
  })
})

describe('fishHeuristic postflop — マルチウェイ IP 判定', () => {
  // 3人 active: BTN(seat0,IP)・BB(seat2)・MP(seat4)。aggressor=MP。
  const state = () => mkState({
    players: [mkPlayer('btn', 0), mkPlayer('bb', 2), mkPlayer('mp', 4)],
    history: [pf('mp', 'raise')],
  })

  it('最後に行動する1席のみ IP (BTN=stab・中間/OOP=donk抑制・aggressor=cbet)', () => {
    expect(lead(state(), 'btn', 'gto', () => 0.3).action).toBe('raise')   // IP 非アグレッサー stab 0.42
    expect(lead(state(), 'bb', 'gto', () => 0.10).action).toBe('check')   // 非IP非アグレッサー donk 0.04
    expect(lead(state(), 'mp', 'gto', () => 0.5).action).toBe('raise')    // aggressor cbet 0.60
  })
})

describe('fishHeuristic postflop — リードサイズ', () => {
  it('ポット ~60% サイズ (min レイズ額ではない)', () => {
    const d = lead(mkState({ aggressor: 'oop', pot: 6 }), 'oop', 'gto', () => 0.0) // 0.6*6=3.6→3.5
    expect(d.action).toBe('raise')
    expect(d.amount).toBe(3.5)
  })

  it('オールインでキャップ (持ち分を超えない)', () => {
    const state = mkState({
      aggressor: 'oop', pot: 20,
      players: [mkPlayer('ip', 0), mkPlayer('oop', 2, { stackBB: 2 })],
    })
    const d = decideFishAction(state, 'oop', FREE, 0, 1, 'gto', () => 0.0)
    expect(d.action).toBe('raise')
    expect(d.amount).toBe(2) // 0.6*20=12 だが持ち分2でキャップ
  })

  it('min レイズ額でフロア (小ポットでも最小ベットを下回らない)', () => {
    const state = mkState({ aggressor: 'oop', pot: 1 })
    const d = decideFishAction(state, 'oop', FREE, 0, 4, 'gto', () => 0.0) // minRaiseTo=4
    expect(d.action).toBe('raise')
    expect(d.amount).toBe(4) // max(4, 0.6*1=0.5)
  })
})

describe('fishHeuristic postflop — 被ベット (facing a bet)', () => {
  const facing = (profile: 'fish' | 'gto', rng: () => number, valid: PlayerAction[] = FACING) =>
    decideFishAction(mkState({ aggressor: 'ip' }), 'oop', valid, 3, 4, profile, rng)

  it('GTO の全分岐 (fold 0.32 / raise [0.32,0.42) / call)', () => {
    expect(facing('gto', () => 0.05).action).toBe('fold')
    expect(facing('gto', () => 0.38).action).toBe('raise')
    expect(facing('gto', () => 0.60).action).toBe('call')
  })

  it('fish の全分岐 (fold 0.18 / raise [0.18,0.24) / call) — 降りなさすぎ', () => {
    expect(facing('fish', () => 0.10).action).toBe('fold')
    expect(facing('fish', () => 0.20).action).toBe('raise')
    expect(facing('fish', () => 0.50).action).toBe('call')
  })

  it('raise レンジでも raise 不可なら call にフォールバック', () => {
    expect(facing('gto', () => 0.38, ['fold', 'call']).action).toBe('call')
  })

  it('fish はコーリングステーション (gto が降りる頻度でもコール)', () => {
    // rng=0.28: gto fold(0.28<0.32) / fish は fold+raise=0.24 を超え call
    expect(facing('gto', () => 0.28).action).toBe('fold')
    expect(facing('fish', () => 0.28).action).toBe('call')
  })
})
