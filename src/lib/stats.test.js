import { describe, it, expect } from 'vitest'
import {
  wilsonInterval,
  distinguishableFromChance,
  sampleSizeToDistinguish,
  independentCount,
  meanWithInterval,
} from './stats'

describe('wilsonInterval', () => {
  it('matches an independent computation of the plain Wilson interval', () => {
    // 8 successes in 10 trials, 95% two-sided. Cross-checked against a
    // separate implementation: [0.490162, 0.943318]. Note this is the plain
    // score interval, not the continuity-corrected variant, which is
    // materially wider at [0.442, 0.965] — the two are easy to confuse.
    const ci = wilsonInterval(8, 10)
    expect(ci.lower).toBeCloseTo(0.490162, 6)
    expect(ci.upper).toBeCloseTo(0.943318, 6)
    expect(ci.point).toBe(0.8)
  })

  it('stays inside [0,1] at the extremes where the normal approximation fails', () => {
    // p = 1 would give a zero-width normal interval, and p near 0 sends the
    // normal approximation below zero. Wilson does neither.
    const perfect = wilsonInterval(10, 10)
    expect(perfect.lower).toBeGreaterThan(0)
    expect(perfect.lower).toBeLessThan(1)
    // Exactly 1 in exact arithmetic; 1 - 1e-16 in floating point. Asserting
    // closeness rather than fudging the formula with an epsilon.
    expect(perfect.upper).toBeCloseTo(1, 12)

    const none = wilsonInterval(0, 10)
    expect(none.lower).toBe(0)
    expect(none.upper).toBeLessThan(1)
    expect(none.upper).toBeGreaterThan(0)
  })

  it('narrows as the sample grows', () => {
    const small = wilsonInterval(6, 10)
    const large = wilsonInterval(600, 1000)
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower)
  })

  it('widens as confidence rises', () => {
    const a = wilsonInterval(60, 100, 0.9)
    const b = wilsonInterval(60, 100, 0.99)
    expect(b.upper - b.lower).toBeGreaterThan(a.upper - a.lower)
  })

  it('returns null on an empty sample instead of dividing by zero', () => {
    expect(wilsonInterval(0, 0)).toBeNull()
    expect(wilsonInterval(3, -1)).toBeNull()
  })
})

describe('distinguishableFromChance', () => {
  it('calls a thin sample inconclusive even when the point estimate looks strong', () => {
    // 6/10 = 60% "win rate" — the number this app would previously have shown
    // as an edge. Its interval spans 50%, so it is not distinguishable from a
    // coin flip.
    const r = distinguishableFromChance(6, 10)
    expect(r.point).toBe(0.6)
    expect(r.distinguishable).toBe(false)
    expect(r.direction).toBe('inconclusive')
  })

  it('recognises the same rate as real once the sample is large enough', () => {
    const r = distinguishableFromChance(600, 1000)
    expect(r.distinguishable).toBe(true)
    expect(r.direction).toBe('above')
  })

  it('detects a genuinely bearish record', () => {
    const r = distinguishableFromChance(300, 1000)
    expect(r.distinguishable).toBe(true)
    expect(r.direction).toBe('below')
  })

  it('treats an exact coin flip as inconclusive', () => {
    expect(distinguishableFromChance(500, 1000).distinguishable).toBe(false)
  })
})

describe('sampleSizeToDistinguish', () => {
  it('demands more data for smaller effects', () => {
    expect(sampleSizeToDistinguish(0.55)).toBeGreaterThan(sampleSizeToDistinguish(0.8))
  })

  it('is symmetric about a coin flip', () => {
    expect(sampleSizeToDistinguish(0.6)).toBe(sampleSizeToDistinguish(0.4))
  })

  it('returns null when there is no effect to detect', () => {
    expect(sampleSizeToDistinguish(0.5)).toBeNull()
  })

  it('gives a sane figure for a modest edge', () => {
    // A 60/40 split needs roughly a hundred independent observations.
    const n = sampleSizeToDistinguish(0.6)
    expect(n).toBeGreaterThan(80)
    expect(n).toBeLessThan(120)
  })
})

describe('independentCount', () => {
  it('collapses overlapping forward windows', () => {
    // Five consecutive signals with a 5-session window overlap almost
    // entirely — they are nearer one observation than five.
    expect(independentCount([0, 1, 2, 3, 4], 5)).toBe(1)
  })

  it('counts well-separated occurrences in full', () => {
    expect(independentCount([0, 10, 20, 30], 5)).toBe(4)
  })

  it('counts a window that ends exactly as the next begins', () => {
    expect(independentCount([0, 5, 10], 5)).toBe(3)
  })

  it('is order independent', () => {
    expect(independentCount([30, 0, 20, 10], 5)).toBe(independentCount([0, 10, 20, 30], 5))
  })

  it('handles empty input', () => {
    expect(independentCount([], 5)).toBe(0)
    expect(independentCount(null, 5)).toBe(0)
  })
})

describe('meanWithInterval', () => {
  it('uses the sample variance and reports a symmetric interval', () => {
    const r = meanWithInterval([1, 2, 3, 4, 5])
    expect(r.mean).toBe(3)
    // sample sd = sqrt(2.5) -> stderr = sqrt(2.5/5) = 0.7071
    expect(r.stderr).toBeCloseTo(0.7071, 4)
    expect(r.upper - r.mean).toBeCloseTo(r.mean - r.lower, 12)
  })

  it('calls a noisy positive mean indistinguishable from zero', () => {
    const r = meanWithInterval([-5, 6, -4, 7, -3, 5])
    expect(r.mean).toBeGreaterThan(0)
    expect(r.distinguishableFromZero).toBe(false)
  })

  it('recognises a consistent effect', () => {
    const r = meanWithInterval(Array.from({ length: 60 }, () => 2))
    expect(r.distinguishableFromZero).toBe(true)
  })

  it('returns null when there is nothing to estimate', () => {
    expect(meanWithInterval([])).toBeNull()
    expect(meanWithInterval([1])).toBeNull()
  })
})

describe('effect size is not the same question as significance', () => {
  it('a large sample makes a trivial effect statistically detectable', () => {
    // The trap the signal check has to avoid: with enough observations, a
    // correlation far too small to act on still excludes zero.
    const tiny = Array.from({ length: 400 }, (_, i) => (i % 2 ? 0.06 : 0.05))
    const r = meanWithInterval(tiny)
    expect(r.distinguishableFromZero).toBe(true) // significant
    expect(Math.abs(r.mean)).toBeLessThan(0.1) // and yet negligible
  })
})

describe('sampleSizeToDistinguish at the edges', () => {
  // The formula's p(1-p) term vanishes at a perfect record and it returned 0,
  // which reads as "enough data already" for the one case that needs the most.
  it('refuses to answer for a flawless or hopeless record', () => {
    expect(sampleSizeToDistinguish(1)).toBeNull()
    expect(sampleSizeToDistinguish(0)).toBeNull()
  })

  it('still refuses when there is no effect to detect', () => {
    expect(sampleSizeToDistinguish(0.5)).toBeNull()
  })

  it('asks for more data the closer a rate sits to a coin flip', () => {
    const near = sampleSizeToDistinguish(0.55)
    const far = sampleSizeToDistinguish(0.8)
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
  })
})
