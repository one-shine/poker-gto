import { describe, it, expect } from 'vitest'
import { generateBlockerQuestion, judgeBlocker, explainBlocker } from './blockerDrill'

// 再現可能な seeded RNG (mulberry32)。
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cardStr = (c: { rank: string; suit: string }) => `${c.rank}${c.suit}`

describe('blockerDrill', () => {
  it('generates a well-formed river question across many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const q = generateBlockerQuestion(mulberry32(seed))
      expect(q.board).toHaveLength(5)
      expect(q.candidates.length).toBeGreaterThanOrEqual(3)
      expect(q.candidates.length).toBeLessThanOrEqual(4)
      expect(q.valueCount).toBeGreaterThan(0)
      // bestBlocks は候補中の最大ブロック数。
      const maxBlocks = Math.max(...q.candidates.map(c => c.blocks))
      expect(q.bestBlocks).toBe(maxBlocks)
      // 全候補のカードは盤面と重複せず、候補同士も重複しない (有効な別ハンド)。
      const boardKeys = new Set(q.board.map(cardStr))
      const seen = new Set<string>()
      for (const cand of q.candidates) {
        for (const c of cand.cards) {
          const k = cardStr(c)
          expect(boardKeys.has(k)).toBe(false)
          expect(seen.has(k)).toBe(false)
          seen.add(k)
        }
        expect(cand.blocks).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('has a strictly-best blocker (at least one distractor blocks fewer)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const q = generateBlockerQuestion(mulberry32(seed))
      const minBlocks = Math.min(...q.candidates.map(c => c.blocks))
      // 正解より少なくブロックする distractor が必ず存在する (区別可能な問題)。
      expect(minBlocks).toBeLessThan(q.bestBlocks)
    }
  })

  it('judges the highest-blocking candidate as correct and a lower one as incorrect', () => {
    const q = generateBlockerQuestion(mulberry32(7))
    const bestIdx = q.candidates.findIndex(c => c.blocks === q.bestBlocks)
    const worstIdx = q.candidates.reduce(
      (acc, c, i) => (c.blocks < q.candidates[acc].blocks ? i : acc),
      0,
    )
    expect(judgeBlocker(q, bestIdx).correct).toBe(true)
    expect(judgeBlocker(q, worstIdx).correct).toBe(false)
    // bestIdxs は最大ブロック数の候補のみ。
    const j = judgeBlocker(q, bestIdx)
    for (const i of j.bestIdxs) expect(q.candidates[i].blocks).toBe(q.bestBlocks)
  })

  it('is deterministic for a given seed', () => {
    const a = generateBlockerQuestion(mulberry32(123))
    const b = generateBlockerQuestion(mulberry32(123))
    expect(a.board.map(cardStr)).toEqual(b.board.map(cardStr))
    expect(a.candidates.map(c => c.label)).toEqual(b.candidates.map(c => c.label))
    expect(a.candidates.map(c => c.blocks)).toEqual(b.candidates.map(c => c.blocks))
  })

  it('explainBlocker references the best candidate and value count', () => {
    const q = generateBlockerQuestion(mulberry32(5))
    const j = judgeBlocker(q, q.candidates.findIndex(c => c.blocks === q.bestBlocks))
    const text = explainBlocker(q, j)
    expect(text).toContain(q.candidates[j.bestIdxs[0]].label)
    expect(text).toContain(String(q.valueCount))
  })
})
