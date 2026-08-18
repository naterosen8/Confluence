import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DISCLAIMER_VERSION,
  DISCLAIMER_POINTS,
  readAcceptance,
  writeAcceptance,
  clearAcceptance,
  hasAccepted,
} from './disclaimer.js'

// A minimal localStorage, so the storage rules can be tested including the
// case where the browser refuses to cooperate.
function installStorage({ throws = false } = {}) {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => {
      if (throws) throw new Error('blocked')
      return store.has(k) ? store.get(k) : null
    },
    setItem: (k, v) => {
      if (throws) throw new Error('blocked')
      store.set(k, v)
    },
    removeItem: (k) => {
      if (throws) throw new Error('blocked')
      store.delete(k)
    },
  }
  return store
}

describe('disclaimer acceptance', () => {
  beforeEach(() => installStorage())

  it('starts unaccepted', () => {
    expect(readAcceptance()).toBeNull()
    expect(hasAccepted()).toBe(false)
  })

  it('records the version and the moment', () => {
    const rec = writeAcceptance(new Date('2026-08-18T12:00:00Z'))
    expect(rec.version).toBe(DISCLAIMER_VERSION)
    expect(rec.at).toBe('2026-08-18T12:00:00.000Z')
    expect(hasAccepted()).toBe(true)
  })

  it('survives a reload', () => {
    writeAcceptance()
    expect(hasAccepted(readAcceptance())).toBe(true)
  })

  // Consent to one set of terms is not consent to a different set.
  it('re-prompts when the terms have moved on', () => {
    localStorage.setItem('confluence.disclaimer', JSON.stringify({ version: DISCLAIMER_VERSION - 1, at: 'x' }))
    expect(hasAccepted()).toBe(false)
  })

  it('accepts a record from a later version', () => {
    localStorage.setItem('confluence.disclaimer', JSON.stringify({ version: DISCLAIMER_VERSION + 1, at: 'x' }))
    expect(hasAccepted()).toBe(true)
  })

  it('can be withdrawn', () => {
    writeAcceptance()
    clearAcceptance()
    expect(hasAccepted()).toBe(false)
  })

  it('treats corrupt storage as not accepted', () => {
    localStorage.setItem('confluence.disclaimer', 'not json')
    expect(readAcceptance()).toBeNull()
    expect(hasAccepted()).toBe(false)
  })

  it('treats a record with no version as not accepted', () => {
    localStorage.setItem('confluence.disclaimer', JSON.stringify({ at: 'x' }))
    expect(hasAccepted()).toBe(false)
  })

  // Safari private mode throws on access rather than returning null. Failing
  // toward "ask again" is the safe direction; failing toward a crash is not.
  it('asks again rather than throwing when storage is blocked', () => {
    installStorage({ throws: true })
    expect(() => readAcceptance()).not.toThrow()
    expect(() => writeAcceptance()).not.toThrow()
    expect(() => clearAcceptance()).not.toThrow()
    expect(hasAccepted()).toBe(false)
  })
})

describe('the terms themselves', () => {
  it('states the things this site is actually on the hook for', () => {
    const keys = DISCLAIMER_POINTS.map((p) => p.key)
    for (const required of ['not-advice', 'no-edge', 'simulated', 'past', 'yours']) {
      expect(keys, `missing ${required}`).toContain(required)
    }
  })

  it('says plainly that the site finds no edge', () => {
    const noEdge = DISCLAIMER_POINTS.find((p) => p.key === 'no-edge')
    expect(noEdge.text).toMatch(/no predictive edge/i)
  })

  it('warns that the simulator flatters leveraged outcomes', () => {
    const sim = DISCLAIMER_POINTS.find((p) => p.key === 'simulated')
    expect(sim.text).toMatch(/funding/)
    expect(sim.text).toMatch(/slippage/)
  })

  it('has no duplicate keys', () => {
    const keys = DISCLAIMER_POINTS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
