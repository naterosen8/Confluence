import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readPrefs, writePrefs, clearPrefs } from './sizingPrefs.js'

const store = new Map()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  })
})

describe('sizingPrefs', () => {
  // The whole point: no suggested risk budget, ever.
  it('starts with nothing, not with a default risk budget', () => {
    expect(readPrefs()).toEqual({ equity: null, riskPct: null })
  })

  it('round-trips what was entered', () => {
    writePrefs({ equity: 250_000, riskPct: 0.75 })
    expect(readPrefs()).toEqual({ equity: 250_000, riskPct: 0.75 })
  })

  it('rejects values that are not usable sizes', () => {
    writePrefs({ equity: 0, riskPct: -1 })
    expect(readPrefs()).toEqual({ equity: null, riskPct: null })
    writePrefs({ equity: 'lots', riskPct: NaN })
    expect(readPrefs()).toEqual({ equity: null, riskPct: null })
  })

  it('survives corrupt storage rather than taking the page down', () => {
    store.set('confluence.sizing.v1', '{not json')
    expect(readPrefs()).toEqual({ equity: null, riskPct: null })
  })

  it('survives storage being unavailable entirely', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readPrefs()).toEqual({ equity: null, riskPct: null })
    expect(() => writePrefs({ equity: 1000, riskPct: 1 })).not.toThrow()
    expect(() => clearPrefs()).not.toThrow()
  })

  it('forgets on request — an account size should be removable', () => {
    writePrefs({ equity: 100_000, riskPct: 1 })
    clearPrefs()
    expect(readPrefs()).toEqual({ equity: null, riskPct: null })
  })
})
