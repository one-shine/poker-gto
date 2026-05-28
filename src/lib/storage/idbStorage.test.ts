import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { idbStorage } from './idbStorage'

describe('idbStorage', () => {
  beforeEach(() => {
    // 各テストで clean な IDB を使うため fake-indexeddb をリセット
    localStorage.clear()
  })

  it('roundtrips set/get/remove', async () => {
    await idbStorage.setItem('k1', 'hello')
    expect(await idbStorage.getItem('k1')).toBe('hello')
    await idbStorage.removeItem('k1')
    expect(await idbStorage.getItem('k1')).toBeNull()
  })

  it('returns null for missing keys', async () => {
    expect(await idbStorage.getItem('not-there')).toBeNull()
  })

  it('migrates from localStorage on first read (one-time)', async () => {
    // 旧データが localStorage にだけ存在する状態を作る
    localStorage.setItem('legacy-key', '{"v":42}')
    const first = await idbStorage.getItem('legacy-key')
    expect(first).toBe('{"v":42}')
    // 移行後 localStorage は削除されている
    expect(localStorage.getItem('legacy-key')).toBeNull()
    // 2回目以降は IDB から取得
    const second = await idbStorage.getItem('legacy-key')
    expect(second).toBe('{"v":42}')
  })

  it('falls back to localStorage when IDB is unavailable', async () => {
    // indexedDB 一時的に無効化
    const orig = globalThis.indexedDB
    // @ts-expect-error: testing fallback
    delete globalThis.indexedDB
    // モジュールはキャッシュしているので動的 import で再評価
    vi.resetModules()
    const fresh = await import('./idbStorage')
    await fresh.idbStorage.setItem('fb-key', 'fallback-val')
    expect(localStorage.getItem('fb-key')).toBe('fallback-val')
    expect(await fresh.idbStorage.getItem('fb-key')).toBe('fallback-val')
    globalThis.indexedDB = orig
  })
})
