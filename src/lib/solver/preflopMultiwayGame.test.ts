import { describe, it, expect } from 'vitest'
import { buildPreflopTree, solvePreflopMultiway, DEFAULT_TREE_CONFIG, classMult, CATEGORIES } from './preflopMultiwayGame'

// 合成エクイティ行列(即時・決定的)。CATEGORIES は強→弱でほぼ整列(index 小 = 強)。
// 位置依存オープン幅は木構造(背後人数)とフォールドエクイティが主因なので、単調な代理
// エクイティで CFR を駆動すれば順序検証には十分(実 MC 構築は ~60s で常時テストに不適)。
function syntheticEquity(): number[][] {
  const n = 169
  const eq = Array.from({ length: n }, () => new Array<number>(n).fill(0.5))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const v = Math.min(0.92, 0.5 + (j - i) * 0.0025)
    eq[i][j] = v; eq[j][i] = 1 - v
  }
  return eq
}

describe('preflopMultiwayGame: tree', () => {
  it('5bet-allin (maxRaise=4) tree matches the C2-0 spike structure', () => {
    const t = buildPreflopTree({ ...DEFAULT_TREE_CONFIG, maxRaise: 4 })
    expect(t.decisionCount).toBe(33969)               // info-sets = ×169 = 5.74M
    expect(t.terminalCounts.allin).toBe(29105)
    expect(t.terminalCounts.hu_flop).toBe(1697)
    expect(t.terminalCounts.multiway_flop).toBe(3162)
  })

  it('4bet-cap (maxRaise=3) has no all-in terminals', () => {
    const t = buildPreflopTree({ ...DEFAULT_TREE_CONFIG, maxRaise: 3 })
    expect(t.decisionCount).toBe(4864)
    expect(t.terminalCounts.allin).toBe(0)
  })

  it('the open-raise round is limp-free (fold/raise only at raiseLevel 0)', () => {
    const t = buildPreflopTree(DEFAULT_TREE_CONFIG)
    const root = t.nodes[t.root]
    expect(root.kind).toBe('decision')
    if (root.kind === 'decision') {
      expect(root.player).toBe(0)              // UTG acts first
      expect(root.raiseLevel).toBe(0)
      expect(root.actions).toEqual([0, 2])     // FOLD, RAISE (no CALL/limp)
    }
  })
})

describe('preflopMultiwayGame: classMult (V3 hand-class realization)', () => {
  const mc = (cat: string) => classMult[CATEGORIES.indexOf(cat)]
  it('rewards suited > offsuit, pairs neutral', () => {
    expect(mc('AA')).toBe(1.00)
    expect(mc('AKo')).toBe(0.90)        // offsuit non-pair penalized
    expect(mc('76s')).toBeGreaterThan(mc('76o'))
  })
  it('strong realizers (connected / wheel-ace / suited broadway) get the top tier', () => {
    for (const h of ['76s', '98s', 'JTs', 'KQs', 'A5s', 'A2s']) expect(mc(h)).toBe(1.20)
  })
  it('tapers disconnected low suited trash below good suited', () => {
    expect(mc('T2s')).toBeLessThan(mc('Q9s'))   // T2s trash < Q9s good
    expect(mc('J2s')).toBe(1.05)
    expect(mc('A7s')).toBe(1.13)                 // nut-flush potential
  })
})

describe('preflopMultiwayGame: joint CFR', () => {
  // Phase C(HU縮約)は UTG 63.5% と過広だった。マルチウェイ木は位置依存オープン幅を回復する。
  it('reproduces position-dependent open widths (UTG < MP < CO < BTN, SB widest)', () => {
    const eq = syntheticEquity()
    const r = solvePreflopMultiway({ eq, iters: 100, config: { ...DEFAULT_TREE_CONFIG, maxRaise: 2 } })
    const [utg, mp, co, btn, sb] = r.openPctBySeat
    // 早い位置ほど狭い(背後プレイヤー数が多い)= Phase C が再現できなかった構造。
    expect(utg).toBeLessThan(mp)
    expect(mp).toBeLessThan(co)
    expect(co).toBeLessThan(btn)
    expect(sb).toBeGreaterThan(btn)
    // すべて有限・[0,100] の健全な幅(Phase C の UTG 63.5% のような破綻なし)。
    for (const x of r.openPctBySeat.slice(0, 5)) { expect(Number.isFinite(x)).toBe(true); expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(100) }
  }, 30_000)
})
