import { describe, it, expect, beforeEach } from 'vitest'
import { exportAll, importAll, EXPORT_VERSION, STORAGE_KEYS } from './dataTransfer'
import { idbStorage } from './idbStorage'

// zustand エンベロープ風のダミー
const envelope = (state: object) => JSON.stringify({ state, version: 0 })

describe('dataTransfer', () => {
  beforeEach(async () => {
    localStorage.clear()
    await idbStorage.removeItem(STORAGE_KEYS.session)
  })

  it('exportAll bundles all three stores into a versioned payload', async () => {
    localStorage.setItem(STORAGE_KEYS.settings, envelope({ appMode: 'study' }))
    localStorage.setItem(STORAGE_KEYS.progress, envelope({ progress: { xp: 42 } }))
    await idbStorage.setItem(STORAGE_KEYS.session, envelope({ sessionHandCount: 7 }))

    const json = await exportAll()
    const parsed = JSON.parse(json)
    expect(parsed.app).toBe('poker-gto')
    expect(parsed.version).toBe(EXPORT_VERSION)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.data.settings.state.appMode).toBe('study')
    expect(parsed.data.progress.state.progress.xp).toBe(42)
    expect(parsed.data.session.state.sessionHandCount).toBe(7)
  })

  it('round-trips: export then import writes the values back', async () => {
    localStorage.setItem(STORAGE_KEYS.settings, envelope({ appMode: 'play', aiSpeed: 'fast' }))
    await idbStorage.setItem(STORAGE_KEYS.session, envelope({ sessionHandCount: 3 }))
    const json = await exportAll()

    localStorage.clear()
    await idbStorage.removeItem(STORAGE_KEYS.session)

    const res = await importAll(json)
    expect(res.ok).toBe(true)
    expect(res.errors).toEqual([])
    expect(res.applied).toContain('settings')
    expect(res.applied).toContain('session')

    const back = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!)
    expect(back.state.aiSpeed).toBe('fast')
    const sess = JSON.parse((await idbStorage.getItem(STORAGE_KEYS.session))!)
    expect(sess.state.sessionHandCount).toBe(3)
  })

  it('rejects invalid JSON', async () => {
    const res = await importAll('{ not json')
    expect(res.ok).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
  })

  it('rejects a file from a different app', async () => {
    const res = await importAll(JSON.stringify({ app: 'something-else', version: 1, data: {} }))
    expect(res.ok).toBe(false)
  })

  it('rejects a future export version', async () => {
    const res = await importAll(JSON.stringify({ app: 'poker-gto', version: EXPORT_VERSION + 1, data: {} }))
    expect(res.ok).toBe(false)
  })

  it('applies a partial backup (missing keys skipped)', async () => {
    const res = await importAll(JSON.stringify({
      app: 'poker-gto', version: EXPORT_VERSION, exportedAt: 'x',
      data: { settings: { state: { appMode: 'study' }, version: 0 }, progress: null, session: null },
    }))
    expect(res.ok).toBe(true)
    expect(res.applied).toEqual(['settings'])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!).state.appMode).toBe('study')
  })
})
