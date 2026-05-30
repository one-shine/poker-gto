import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureError, initErrorReporting } from './reporter'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('captureError', () => {
  it('logs to console exactly once and never throws (no DSN = local only)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(import.meta.env.VITE_SENTRY_DSN).toBeUndefined()

    expect(() => captureError(new Error('x'), { a: 1 })).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('[crash]', expect.any(Error), { a: 1 })
  })

  it('does not perform any network request when no DSN is set', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // global fetch をスパイ。DSN 無しでは一切呼ばれてはならない。
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      captureError('plain string error')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('accepts non-Error values without throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => captureError(undefined)).not.toThrow()
    expect(() => captureError({ weird: true })).not.toThrow()
  })
})

describe('initErrorReporting', () => {
  it('is idempotent: a double call does not break or double-register', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    expect(() => {
      initErrorReporting()
      initErrorReporting()
    }).not.toThrow()
    // 2回目以降は何も登録しない (登録回数は最大でも初回分のみ)。
    expect(addSpy.mock.calls.length).toBeLessThanOrEqual(2)
  })
})
