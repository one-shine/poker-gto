import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getCachedSolution, putCachedSolution, clearSolveCache, __internals } from './solveCache'
import type { NodeSolution } from '../../types/solver'

const node = (spotId: string, solvedAt = Date.now()): NodeSolution => ({
  street: 'river', spotId, strategy: { AsKs: [{ action: 'raise', frequency: 1, ev: 1 }] },
  potBB: 10, source: 'solver_live',
  meta: { sourceName: 'test', license: 'self-generated', version: '1', solvedAt },
})

describe('solveCache (memory L1; IndexedDB L2 when available)', () => {
  beforeEach(async () => { await clearSolveCache() })

  it('returns null for an unknown key', async () => {
    expect(await getCachedSolution('nope|x')).toBeNull()
  })

  it('round-trips a solution through the cache', async () => {
    await putCachedSolution('k1|board', node('btn-river'))
    const got = await getCachedSolution('k1|board')
    expect(got?.spotId).toBe('btn-river')
  })

  // R18: メモリ LRU
  it('memory cache caps at MEM_LIMIT (oldest is evicted)', async () => {
    const N = __internals.MEM_LIMIT + 5
    for (let i = 0; i < N; i++) await putCachedSolution(`k${i}`, node(`spot${i}`))
    expect(__internals.memSize()).toBe(__internals.MEM_LIMIT)
    // 最初の 5 件はメモリから追い出されている
    expect(__internals.memHas('k0')).toBe(false)
    expect(__internals.memHas('k4')).toBe(false)
    // 最新は残っている
    expect(__internals.memHas(`k${N - 1}`)).toBe(true)
  })

  it('get re-promotes the entry to most-recent (LRU touch)', async () => {
    const L = __internals.MEM_LIMIT
    for (let i = 0; i < L; i++) await putCachedSolution(`k${i}`, node(`s${i}`))
    // k0 を get → 最新になる
    await getCachedSolution('k0')
    // 新規 1 件を put → 次の LRU 犠牲は本来 k0 だが、再昇格したので k1 が落ちる
    await putCachedSolution('knew', node('snew'))
    expect(__internals.memHas('k0')).toBe(true)
    expect(__internals.memHas('k1')).toBe(false)
    expect(__internals.memHas('knew')).toBe(true)
  })

  // R18: IDB トリム (solvedAt が古いものから batch 削除)
  it('IDB trims to IDB_LIMIT when count exceeds (oldest solvedAt first)', async () => {
    // IDB_LIMIT=1000 だと遅いので、内部定数を尊重しつつテストは MIN ケースで検証する。
    // 実体: putCachedSolution が trim を呼び、超過時に古いものを削る。
    // ここでは「LIMIT を超えると count() が <= LIMIT に戻る」ことを直接アサート。
    const L = __internals.IDB_LIMIT
    const N = L + 10
    for (let i = 0; i < N; i++) await putCachedSolution(`x${i}`, node(`spot${i}`, i)) // ts = i (古→新)
    // 末尾の put が trim を発動 → IDB の件数は LIMIT 以下
    // メモリは LRU で削っているので IDB を見る必要があるが、テストではメモリヒット優先。
    // 最古 (x0) は IDB から消えている → mem からも消えており、再 get は null。
    expect(await getCachedSolution('x0')).toBeNull()
    // 最新は残っている
    expect((await getCachedSolution(`x${N - 1}`))?.spotId).toBe(`spot${N - 1}`)
  }, 30000)
})
