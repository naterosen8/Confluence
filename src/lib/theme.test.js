import { describe, it, expect, beforeEach } from 'vitest'
import { readTheme, writeTheme, resolveTheme, applyTheme, nextTheme, THEMES } from './theme.js'

function installStorage({ throws = false } = {}) {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => { if (throws) throw new Error('blocked'); return store.has(k) ? store.get(k) : null },
    setItem: (k, v) => { if (throws) throw new Error('blocked'); store.set(k, v) },
    removeItem: (k) => { if (throws) throw new Error('blocked'); store.delete(k) },
  }
}
const matcher = (light) => () => ({ matches: light })

describe('theme preference', () => {
  beforeEach(() => installStorage())

  it('follows the system until a choice is made', () => {
    expect(readTheme()).toBe('system')
  })

  it('stores an explicit choice', () => {
    writeTheme('light')
    expect(readTheme()).toBe('light')
  })

  // "System" is the absence of a preference, so choosing it clears storage
  // rather than recording a third value that would then outrank the machine.
  it('clears storage when returning to system', () => {
    writeTheme('dark')
    writeTheme('system')
    expect(localStorage.getItem('confluence.theme')).toBeNull()
    expect(readTheme()).toBe('system')
  })

  it('ignores junk in storage', () => {
    localStorage.setItem('confluence.theme', 'neon')
    expect(readTheme()).toBe('system')
  })

  it('falls back to system when storage is blocked', () => {
    installStorage({ throws: true })
    expect(() => readTheme()).not.toThrow()
    expect(() => writeTheme('dark')).not.toThrow()
    expect(readTheme()).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('honours an explicit choice over the machine', () => {
    expect(resolveTheme('light', matcher(false))).toBe('light')
    expect(resolveTheme('dark', matcher(true))).toBe('dark')
  })

  it('follows the machine when no choice is made', () => {
    expect(resolveTheme('system', matcher(true))).toBe('light')
    expect(resolveTheme('system', matcher(false))).toBe('dark')
  })

  it('defaults to dark where no matcher exists', () => {
    expect(resolveTheme('system', null)).toBe('dark')
  })
})

describe('nextTheme', () => {
  it('steps in a fixed order', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  // The first version resolved 'system' against the machine and jumped to its
  // opposite, which on a dark machine meant explicit dark was unreachable —
  // a two-state toggle with a three-state label, and no way to pin dark so
  // the page stops changing at sunrise.
  it('reaches every state regardless of what the machine is doing', () => {
    for (const machineIsLight of [true, false]) {
      globalThis.window = { matchMedia: matcher(machineIsLight) }
      const seen = new Set()
      let t = 'system'
      for (let i = 0; i < THEMES.length; i++) { seen.add(t); t = nextTheme(t) }
      expect(seen, `machine light=${machineIsLight}`).toEqual(new Set(THEMES))
      expect(t).toBe('system')
    }
  })

  it('recovers from an unrecognised value', () => {
    expect(THEMES).toContain(nextTheme('neon'))
  })
})

describe('applyTheme', () => {
  it('marks the root element and sets color-scheme', () => {
    const root = { setAttribute: (k, v) => (root[k] = v), style: {} }
    applyTheme('light', root)
    expect(root['data-theme']).toBe('light')
    expect(root.style.colorScheme).toBe('light')
  })

  it('does nothing without a document rather than throwing', () => {
    expect(() => applyTheme('dark', null)).not.toThrow()
  })
})
