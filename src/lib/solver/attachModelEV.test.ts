/// <reference types="node" />
// node 型は app の tsconfig.types に含めない (attachHeuristicEV.test.ts と同じ理由で局所参照)。
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parsePostflopEvModel, heroValueMatrix,
  computeModelEV, computeDefenderModelEV, computeOpenerFacing3betModelEV,
  type PostflopEvModel,
} from './attachModelEV'
import {
  computeHeuristicEV, computeDefenderHeuristicEV, computeOpenerFacing3betEV,
  buildCallerCallFreq, buildOpenerRaiseFreq, buildOpenerResponseFreqs,
} from './attachHeuristicEV'
import { CATEGORIES } from './pushFold'
import { buildEquityMatrix } from './preflopEquity'
import { PREFLOP_SCENARIOS } from '../../data/ranges/preflop'
import { ALL_CONFIGS } from '../../../scripts/build-postflop-ev'
import type { RangeScenario } from '../../types/ranges'
import type { NodeSolution } from '../../types/solver'

const NCAT = CATEGORIES.length

let EQ_CACHE: number[][] | null = null
function eqMatrix(): number[][] {
  if (EQ_CACHE) return EQ_CACHE
  const cached = resolve(__dirname, '../../../scripts/.cache/preflop-equity-400-1.json')
  if (existsSync(cached)) {
    EQ_CACHE = JSON.parse(readFileSync(cached, 'utf8')) as number[][]
  } else {
    EQ_CACHE = buildEquityMatrix(60, 1)
  }
  return EQ_CACHE
}
beforeAll(() => { eqMatrix() }, 30000)

const SC = (id: string) => {
  const s = PREFLOP_SCENARIOS.find(x => x.id === id)
  if (!s) throw new Error(`scenario not found: ${id}`)
  return s
}

function fullMatrix(fn: (ci: number, cj: number) => number | null): (number | null)[][] {
  return CATEGORIES.map((_, ci) => CATEGORIES.map((__, cj) => fn(ci, cj)))
}

// ベットゼロ相当の合成 V (= eq × pot): 契約フレームの恒等基準 (テスト③の核)。
const zeroBetMatrix = (pot: number) => fullMatrix((ci, cj) => eqMatrix()[ci][cj] * pot)

function makeModel(over: Partial<PostflopEvModel> = {}): PostflopEvModel {
  return {
    schema: 'flop-ev-matrix@1',
    potKey: 'srp-btn-bb',
    potType: 'srp',
    potBB: 5.5, // BTN 2.5x open + BB call + dead SB = 2*2.5 + 0.5
    effStackBB: 100,
    oopId: 'bb-vs-btn',
    ipId: 'btn-open',
    vOop: fullMatrix(() => 0),
    vIp: fullMatrix(() => 0),
    flopSample: [{ board: 'AhKd7s', weight: 1, exploitPct: 0.02 }],
    coverage: { oop: new Array<number>(NCAT).fill(1), ip: new Array<number>(NCAT).fill(1) },
    meta: { sourceName: 'synthetic fixture', license: 'self-generated', version: '1' },
    ...over,
  }
}

const heroScn = (cells: Record<string, [number, number, number]>): RangeScenario => ({
  id: 'btn-open', label: 'test opener', position: 'BTN', raiseSize: 2.5,
  cells: Object.fromEntries(
    Object.entries(cells).map(([h, [r, c, fo]]) => [h, { hand: h, raise: r, call: c, fold: fo }]),
  ),
})

const ones = () => new Float64Array(NCAT).fill(1)
const evOf = (node: NodeSolution, hand: string, action: string) =>
  node.strategy[hand]?.find(a => a.action === action)?.ev

describe('parsePostflopEvModel / heroValueMatrix', () => {
  it('valid JSON roundtrips and hero side resolves by scenario id (not position)', () => {
    const m = parsePostflopEvModel(JSON.parse(JSON.stringify(makeModel())))
    expect(m.potKey).toBe('srp-btn-bb')
    expect(heroValueMatrix(m, 'btn-open')).toBe(m.vIp)
    expect(heroValueMatrix(m, 'bb-vs-btn')).toBe(m.vOop)
    expect(heroValueMatrix(m, 'co-open')).toBeNull()
  })

  it('rejects unknown schema and wrong matrix dimensions', () => {
    expect(() => parsePostflopEvModel({ ...makeModel(), schema: 'flop-ev-matrix@9' })).toThrow(/schema/)
    expect(() => parsePostflopEvModel({ ...makeModel(), vOop: [[0]] })).toThrow(/vOop/)
    expect(() => parsePostflopEvModel({ ...makeModel(), potType: 'omaha' })).toThrow(/potType/)
  })
})

describe('computeModelEV — opener (テスト①③)', () => {
  it('① 単調性: ベットゼロ合成 V (eq×pot) で AA > KK > QQ > 72o、AA 正 / 72o 負', () => {
    const model = makeModel({ vIp: zeroBetMatrix(5.5) })
    const hero = heroScn({ AA: [1, 0, 0], KK: [1, 0, 0], QQ: [1, 0, 0], '72o': [1, 0, 0] })
    const node = computeModelEV(hero, eqMatrix(), ones(), model)
    expect(node.source).toBe('approximate_with_ev')
    const ev = (h: string) => evOf(node, h, 'raise')!
    expect(ev('AA')).toBeGreaterThan(ev('KK'))
    expect(ev('KK')).toBeGreaterThan(ev('QQ'))
    expect(ev('QQ')).toBeGreaterThan(ev('72o'))
    expect(ev('AA')).toBeGreaterThan(0)
    expect(ev('72o')).toBeLessThan(0)
  })

  it('③ 規約整合: q≡1 では EV_model = (pot/F)·EV_heur + pot/2 − cPre が厳密に成り立つ', () => {
    // (eq−0.5)×F ⟷ V−cPre の橋渡し式。V=eq×pot なら両者は avgEq の一次式として等価。
    const pot = 5.5, F = 30, cPre = 2.5
    const hero = heroScn({ AA: [1, 0, 0], KK: [1, 0, 0], TT: [1, 0, 0], '72o': [1, 0, 0], A5s: [1, 0, 0] })
    const model = makeModel({ vIp: zeroBetMatrix(pot) })
    const m = computeModelEV(hero, eqMatrix(), ones(), model)
    const h = computeHeuristicEV(hero, eqMatrix(), ones())
    for (const hand of Object.keys(hero.cells)) {
      const expected = (pot / F) * evOf(h, hand, 'raise')! + pot / 2 - cPre
      expect(evOf(m, hand, 'raise')!).toBeCloseTo(expected, 2)
    }
  })

  it('③ 方向一致: 実 caller 頻度 (bb-vs-btn) でも heuristic と強さ順位が一致する', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-btn'))
    const model = makeModel({ vIp: zeroBetMatrix(5.5) })
    const m = computeModelEV(SC('btn-open'), eq, callerQ, model)
    const h = computeHeuristicEV(SC('btn-open'), eq, callerQ)
    const order = (n: NodeSolution) =>
      ['AA', 'KK', 'QQ', 'JJ'].map(x => evOf(n, x, 'raise')!).every((v, i, a) => i === 0 || a[i - 1] > v)
    expect(order(m)).toBe(true)
    expect(order(h)).toBe(true)
    expect(m.meta.sourceName).toMatch(/flop-ev-matrix@1/)
  })

  it('④ AVAIL 重み: ブロッカー期待値 (AA vs AA=1, AA vs KK=6) で加重平均される', () => {
    // q≡1・V は AA 行の [AA],[KK] 以外 null → EV(raise) = (1·v_AA + 6·v_KK)/7 − 2.5 が厳密値。
    const iAA = CATEGORIES.indexOf('AA'), iKK = CATEGORIES.indexOf('KK')
    const hero = heroScn({ AA: [1, 0, 0] })
    const mk = (vAA: number, vKK: number) => makeModel({
      vIp: fullMatrix((ci, cj) => ci === iAA && cj === iAA ? vAA : ci === iAA && cj === iKK ? vKK : null),
    })
    const evA = evOf(computeModelEV(hero, eqMatrix(), ones(), mk(10, 0)), 'AA', 'raise')!
    const evB = evOf(computeModelEV(hero, eqMatrix(), ones(), mk(0, 10)), 'AA', 'raise')!
    expect(evA).toBeCloseTo((1 * 10 + 6 * 0) / 7 - 2.5, 3)
    expect(evB).toBeCloseTo((1 * 0 + 6 * 10) / 7 - 2.5, 3)
    expect(evB).toBeGreaterThan(evA) // AVAIL 非考慮なら evA=evB になるはず
  })

  it('② フォールバック: model 未指定 / id 不一致は heuristic 経路と完全一致 (meta で区別)', () => {
    const eq = eqMatrix()
    const callerQ = buildCallerCallFreq(SC('bb-vs-btn'))
    const h = computeHeuristicEV(SC('btn-open'), eq, callerQ)
    const noModel = computeModelEV(SC('btn-open'), eq, callerQ, undefined)
    expect(noModel.strategy).toEqual(h.strategy)
    expect(noModel.meta.sourceName).toMatch(/heuristic fallback/)
    const mismatch = computeModelEV(SC('btn-open'), eq, callerQ, makeModel({ oopId: 'x', ipId: 'y' }))
    expect(mismatch.strategy).toEqual(h.strategy)
    expect(mismatch.meta.sourceName).toMatch(/heuristic fallback/)
  })
})

describe('computeDefenderModelEV — defender (テスト②③)', () => {
  const threeBetOpts = () => ({
    openerResponse: buildOpenerResponseFreqs(SC('btn-vs-bb-3bet')),
    openerOpenFreq: buildOpenerRaiseFreq(SC('btn-open')),
    openBB: 2.5, threeBetBB: 11, heroBlindPosted: 1.0,
    threeBetFactor: 45, fourBetFactor: 60,
  })
  const srpModel = () => makeModel({ vOop: zeroBetMatrix(5.5) })
  const tbModel = () => makeModel({
    potKey: '3bet-btn-bb', potType: '3bet', potBB: 22.5, // 2*11 + dead SB 0.5
    oopId: 'bb-vs-btn', ipId: 'btn-vs-bb-3bet', vOop: zeroBetMatrix(22.5),
  })

  it('③ 規約整合: call EV_model = (pot/F)·EV_heur + pot/2 − openBB (真のポットオッズ化)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const m = computeDefenderModelEV(SC('bb-vs-btn'), openerQ, eq, { srp: srpModel() }, { openBB: 2.5 })
    const h = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq)
    for (const hand of ['99', '66', '22']) {
      const expected = (5.5 / 30) * evOf(h, hand, 'call')! + 5.5 / 2 - 2.5
      expect(evOf(m, hand, 'call')!).toBeCloseTo(expected, 2)
    }
    // 単調性と fold EV (−1) は維持
    expect(evOf(m, '99', 'call')!).toBeGreaterThan(evOf(m, '66', 'call')!)
    expect(evOf(m, '66', 'call')!).toBeGreaterThan(evOf(m, '22', 'call')!)
    const fold = Object.values(m.strategy).flat().find(a => a.action === 'fold')
    expect(fold?.ev).toBeCloseTo(-1)
  })

  it('② 部分フォールバック: srp モデルのみ → 3bet EV は heuristic と一致し call EV はモデル化', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const m = computeDefenderModelEV(SC('bb-vs-btn'), openerQ, eq, { srp: srpModel() }, threeBetOpts())
    const h = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq, threeBetOpts())
    expect(evOf(m, 'AA', 'raise')).toBe(evOf(h, 'AA', 'raise')) // 4bet/3bet 枝は旧式のまま (演算順も同一)
    expect(evOf(m, '99', 'call')).not.toBe(evOf(h, '99', 'call'))
    expect(m.meta.sourceName).toMatch(/3bet-call=heuristic/)
    expect(m.meta.sourceName).toMatch(/call=model\(srp-btn-bb\)/)
  })

  it('3bet モデルあり: 3bet→call 枝が V_3bet−threeBetBB になり AA>KK の単調性を保つ', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const m = computeDefenderModelEV(SC('bb-vs-btn'), openerQ, eq, { srp: srpModel(), threeBet: tbModel() }, threeBetOpts())
    const h = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq, threeBetOpts())
    expect(evOf(m, 'AA', 'raise')!).toBeGreaterThan(0)
    expect(evOf(m, 'AA', 'raise')!).toBeGreaterThan(evOf(m, 'KK', 'raise')!)
    expect(evOf(m, 'AA', 'raise')).not.toBe(evOf(h, 'AA', 'raise'))
    expect(m.meta.sourceName).toMatch(/3bet-call=model\(3bet-btn-bb\)/)
  })

  it('② 全フォールバック: モデル無しは heuristic 経路と完全一致 (meta で区別)', () => {
    const eq = eqMatrix()
    const openerQ = buildOpenerRaiseFreq(SC('btn-open'))
    const m = computeDefenderModelEV(SC('bb-vs-btn'), openerQ, eq, {}, threeBetOpts())
    const h = computeDefenderHeuristicEV(SC('bb-vs-btn'), openerQ, eq, threeBetOpts())
    expect(m.strategy).toEqual(h.strategy)
    expect(m.meta.sourceName).toMatch(/heuristic fallback/)
  })
})

describe('computeOpenerFacing3betModelEV — facing-3bet (テスト②③)', () => {
  const opts = () => ({
    openBB: 2.5, threeBetBB: 11, openerBlind: 0, threeBetterBlind: 1.0,
    threeBetFactor: 45, fourBetFactor: 60, foldToFourBet: 0.55,
  })
  const tbModel = () => makeModel({
    potKey: '3bet-btn-bb', potType: '3bet', potBB: 22.5,
    oopId: 'bb-vs-btn', ipId: 'btn-vs-bb-3bet', vIp: zeroBetMatrix(22.5),
  })

  it('③ 規約整合: call EV_model = (pot/F3)·EV_heur + pot/2 − (t−openerBlind)、4bet/fold は旧式のまま', () => {
    const eq = eqMatrix()
    const villainQ = buildOpenerRaiseFreq(SC('bb-vs-btn'))
    const m = computeOpenerFacing3betModelEV(SC('btn-vs-bb-3bet'), villainQ, eq, { threeBet: tbModel() }, opts())
    const h = computeOpenerFacing3betEV(SC('btn-vs-bb-3bet'), villainQ, eq, opts())
    let checked = 0
    for (const hand of Object.keys(m.strategy)) {
      const mc = evOf(m, hand, 'call')
      if (mc == null) continue
      const expected = (22.5 / 45) * evOf(h, hand, 'call')! + 22.5 / 2 - 11
      expect(mc).toBeCloseTo(expected, 2)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
    // 4bet 枝は v1 モデル外 → heuristic と同値。fold は −(open) = −2.5。
    expect(evOf(m, 'AA', 'raise')).toBe(evOf(h, 'AA', 'raise'))
    const fold = Object.values(m.strategy).flat().find(a => a.action === 'fold')
    expect(fold?.ev).toBeCloseTo(-2.5)
  })

  it('② フォールバック: 3bet モデル無しは heuristic 経路と完全一致 (meta で区別)', () => {
    const eq = eqMatrix()
    const villainQ = buildOpenerRaiseFreq(SC('bb-vs-btn'))
    const m = computeOpenerFacing3betModelEV(SC('btn-vs-bb-3bet'), villainQ, eq, {}, opts())
    const h = computeOpenerFacing3betEV(SC('btn-vs-bb-3bet'), villainQ, eq, opts())
    expect(m.strategy).toEqual(h.strategy)
    expect(m.meta.sourceName).toMatch(/heuristic fallback/)
  })

  // 回帰: support < MIN_SUPPORT(0.5) のカテゴリは尾手ノイズとして model を使わず heuristic に落とす。
  // 過去バグ: cap で 1〜2 ボードしか残らない尾手(98s 等)の値が ±70BB のノイズになり facing-3bet
  // の相関を 0.28 まで破壊していた (support ゲートで 0.96 へ回復)。
  it('support ゲート: support<0.5 の手は heuristic、support≥0.5 の手は model を使う', () => {
    const eq = eqMatrix()
    const villainQ = buildOpenerRaiseFreq(SC('bb-vs-btn'))
    const h = computeOpenerFacing3betEV(SC('btn-vs-bb-3bet'), villainQ, eq, opts())
    // support 未付与 = ゲートなし(全 model)。call 手を1つ選ぶ。
    const mFull = computeOpenerFacing3betModelEV(SC('btn-vs-bb-3bet'), villainQ, eq, { threeBet: tbModel() }, opts())
    const callHand = Object.keys(mFull.strategy).find(hd => evOf(mFull, hd, 'call') != null)!
    const ci = CATEGORIES.indexOf(callHand)
    // 当該手のみ support を 0 に (他は 1.0)
    const sup = { oop: new Array<number>(NCAT).fill(1), ip: new Array<number>(NCAT).fill(1) }
    sup.ip[ci] = 0
    const gatedModel = makeModel({
      potKey: '3bet-btn-bb', potType: '3bet', potBB: 22.5,
      oopId: 'bb-vs-btn', ipId: 'btn-vs-bb-3bet', vIp: zeroBetMatrix(22.5), support: sup,
    })
    const mGated = computeOpenerFacing3betModelEV(SC('btn-vs-bb-3bet'), villainQ, eq, { threeBet: gatedModel }, opts())
    // ゲートされた手 → heuristic と一致 / model 版とは異なる (モデルが効いている証拠)
    expect(evOf(mGated, callHand, 'call')).toBeCloseTo(evOf(h, callHand, 'call')!, 2)
    expect(evOf(mFull, callHand, 'call')).not.toBeCloseTo(evOf(h, callHand, 'call')!, 2)
  })
})

// 回帰: 生産側 (build-postflop-ev.ALL_CONFIGS) の oopId/ipId が消費側 (heroValueMatrix が
// hero.id と完全一致照合する) の RangeScenario id であることを固定する。
// 過去バグ: 3bet config の oopId/ipId に spotId(3bp-*) を入れてしまい、全 3bet 枝が静かに
// heuristic フォールバックしていた (spotRanges は spotId で解決するため solve は正しかった)。
describe('producer↔consumer id 契約 (回帰: 3bp-* spotId 混入防止)', () => {
  const scenarioIds = new Set(PREFLOP_SCENARIOS.map(s => s.id))

  it('全 PotConfig の oopId/ipId は RangeScenario id で、heroValueMatrix が両側を引ける', () => {
    expect(ALL_CONFIGS.length).toBeGreaterThan(0)
    for (const cfg of ALL_CONFIGS) {
      expect(scenarioIds.has(cfg.oopId), `${cfg.potKey}: oopId=${cfg.oopId} は RangeScenario id でない`).toBe(true)
      expect(scenarioIds.has(cfg.ipId), `${cfg.potKey}: ipId=${cfg.ipId} は RangeScenario id でない`).toBe(true)
      expect(cfg.oopId.startsWith('3bp-'), `${cfg.potKey}: oopId に spotId(3bp-*) が混入`).toBe(false)
      expect(cfg.ipId.startsWith('3bp-'), `${cfg.potKey}: ipId に spotId(3bp-*) が混入`).toBe(false)
      // end-to-end: 消費側は oopId→vOop / ipId→vIp を引けねばならない (マーカー値で区別)
      const model = makeModel({
        potKey: cfg.potKey, potType: cfg.potType, potBB: cfg.potBB, effStackBB: cfg.effStackBB,
        oopId: cfg.oopId, ipId: cfg.ipId,
        vOop: fullMatrix(() => 1), vIp: fullMatrix(() => 2),
      })
      expect(heroValueMatrix(model, cfg.oopId)?.[0]?.[0]).toBe(1)
      expect(heroValueMatrix(model, cfg.ipId)?.[0]?.[0]).toBe(2)
    }
  })

  it('3bet config の ipId は facing-3bet シナリオ(…-3bet)・oopId は 3better(非 …-3bet)', () => {
    const threeBet = ALL_CONFIGS.filter(c => c.potType === '3bet')
    expect(threeBet.length).toBeGreaterThan(0)
    for (const cfg of threeBet) {
      expect(cfg.ipId.endsWith('-3bet'), `${cfg.potKey}: ipId は facing-3bet (…-3bet) であるべき`).toBe(true)
      expect(cfg.oopId.endsWith('-3bet'), `${cfg.potKey}: oopId(3better=OOP) は …-3bet でないべき`).toBe(false)
    }
  })
})
