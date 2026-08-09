import { describe, it, expect } from 'vitest'
import { leanFor, leanByKey, leanDirection, LEAN_BANDS, LEAN_COLORS } from './lean'
import { computeSignals } from './indicators'

describe('lean bands', () => {
  it('maps scores to the documented bands', () => {
    expect(leanFor(6).key).toBe('aligned-up')
    expect(leanFor(3).key).toBe('aligned-up')
    expect(leanFor(2).key).toBe('leaning-up')
    expect(leanFor(1).key).toBe('leaning-up')
    expect(leanFor(0).key).toBe('split')
    expect(leanFor(-1).key).toBe('leaning-down')
    expect(leanFor(-2).key).toBe('leaning-down')
    expect(leanFor(-3).key).toBe('aligned-down')
    expect(leanFor(-6).key).toBe('aligned-down')
  })

  it('uses no directional trading vocabulary anywhere in its labels', () => {
    // The whole point of the rename: the badge describes indicator agreement,
    // not an expected price direction.
    const banned = /bullish|bearish|buy|sell|neutral/i
    for (const b of LEAN_BANDS) {
      expect(banned.test(b.label), `${b.key} label`).toBe(false)
      expect(banned.test(b.short), `${b.key} short`).toBe(false)
      expect(banned.test(b.blurb), `${b.key} blurb`).toBe(false)
    }
  })

  it('has a colour for every band', () => {
    for (const b of LEAN_BANDS) expect(LEAN_COLORS[b.key]).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('backward compatibility with logged history', () => {
  // The track record holds entries written before the rename. They are real
  // published history and must keep resolving rather than being rewritten.
  it('resolves pre-rename labels to their bands', () => {
    expect(leanByKey('Strong Bullish').key).toBe('aligned-up')
    expect(leanByKey('Bullish').key).toBe('leaning-up')
    expect(leanByKey('Neutral').key).toBe('split')
    expect(leanByKey('Bearish').key).toBe('leaning-down')
    expect(leanByKey('Strong Bearish').key).toBe('aligned-down')
  })

  it('scores direction identically for old labels and new keys', () => {
    expect(leanDirection('Strong Bullish')).toBe(leanDirection('aligned-up'))
    expect(leanDirection('Bearish')).toBe(leanDirection('leaning-down'))
    expect(leanDirection('Neutral')).toBe('none')
  })

  it('returns null for an unrecognised value rather than guessing', () => {
    expect(leanByKey('nonsense')).toBeNull()
    expect(leanDirection('nonsense')).toBe('none')
  })
})

describe('computeSignals emits the band', () => {
  const bars = Array.from({ length: 260 }, (_, i) => {
    const c = 100 * 1.004 ** i
    return { date: `d${i}`, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 }
  })

  it('returns a stable key in verdict and the full band in lean', () => {
    const s = computeSignals(bars)
    expect(LEAN_BANDS.some((b) => b.key === s.verdict)).toBe(true)
    expect(s.lean.key).toBe(s.verdict)
    expect(s.lean.key).toBe(leanFor(s.score).key)
  })
})
