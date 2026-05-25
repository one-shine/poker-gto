import { describe, it, expect } from 'vitest'
import { getCachedSolution, putCachedSolution } from './solveCache'
import type { NodeSolution } from '../../types/solver'

const node = (spotId: string): NodeSolution => ({
  street: 'river', spotId, strategy: { AsKs: [{ action: 'raise', frequency: 1, ev: 1 }] },
  potBB: 10, source: 'solver_live', meta: { sourceName: 'test', license: 'self-generated', version: '1' },
})

describe('solveCache (memory L1; IndexedDB L2 when available)', () => {
  it('returns null for an unknown key', async () => {
    expect(await getCachedSolution('nope|x')).toBeNull()
  })

  it('round-trips a solution through the cache', async () => {
    await putCachedSolution('k1|board', node('btn-river'))
    const got = await getCachedSolution('k1|board')
    expect(got?.spotId).toBe('btn-river')
  })
})
