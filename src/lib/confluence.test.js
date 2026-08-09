import { describe, it, expect } from 'vitest'
import { detectBreakout, technicalLayer, earningsTrend, fundamentalLayer, macroLayer, combineLayers } from './confluence'

const bar = (date, close, volume = 1e6, high = close * 1.005, low = close * 0.995) => ({
  date,
  open: close,
  high,
  low,
  close,
  volume,
})
const day = (i) => new Date(Date.UTC(2023, 0, 2) + i * 86400000).toISOString().slice(0, 10)
const build = (n, fn) => Array.from({ length: n }, (_, i) => fn(i))

describe('detectBreakout', () => {
  it('requires volume confirmation to call a breakout confirmed', () => {
    // Ranges 100..110 for 150 sessions, then breaks out on heavy volume.
    const base = build(150, (i) => bar(day(i), 100 + (i % 20 === 10 ? 10 : (i % 7) * 0.5)))
    const breakoutHeavy = [...base, bar(day(150), 125, 5e6)]
    const breakoutThin = [...base, bar(day(150), 125, 3e5)]

    const heavy = detectBreakout(breakoutHeavy)
    const thin = detectBreakout(breakoutThin)
    expect(heavy.isBreakout).toBe(true)
    expect(heavy.volumeConfirmed).toBe(true)
    expect(thin.isBreakout).toBe(true)
    expect(thin.volumeConfirmed).toBe(false)
  })

  it('reports distance to the nearest support below', () => {
    const bars = build(150, (i) => bar(day(i), 100 + Math.sin(i / 6) * 8))
    const r = detectBreakout(bars)
    if (r.support) {
      expect(r.distanceToSupportPct).toBeGreaterThanOrEqual(0)
      expect(r.support.price).toBeLessThan(r.price)
    }
  })

  it('returns null without enough history rather than guessing', () => {
    expect(detectBreakout(build(10, (i) => bar(day(i), 100)))).toBeNull()
  })
})

describe('technicalLayer', () => {
  it('is unavailable on a short series', () => {
    const r = technicalLayer(build(20, (i) => bar(day(i), 100)))
    expect(r.available).toBe(false)
    expect(r.reason).toBeTruthy()
  })

  it('leans bullish in a sustained uptrend', () => {
    const r = technicalLayer(build(250, (i) => bar(day(i), 100 * 1.004 ** i)))
    expect(r.available).toBe(true)
    expect(r.score).toBeGreaterThan(0)
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('leans bearish in a sustained downtrend', () => {
    const r = technicalLayer(build(250, (i) => bar(day(i), 300 * 0.996 ** i)))
    expect(r.score).toBeLessThan(0)
  })
})

describe('earningsTrend', () => {
  const q = (asOf, revenue, netIncome) => ({ asOf, revenue, netIncome })

  it('compares year over year, not against the previous quarter', () => {
    // Seasonal pattern: Q4 always spikes. A sequential comparison would call
    // Q1 a collapse; the year-over-year one correctly sees growth.
    const quarters = [
      q('2023-03-31', 100, 10),
      q('2023-06-30', 110, 11),
      q('2023-09-30', 120, 12),
      q('2023-12-31', 200, 20),
      q('2024-03-31', 110, 12),
    ]
    const t = earningsTrend(quarters)
    expect(t.revenueYoY).toBeCloseTo(10, 6) // 110 vs 100
    expect(t.incomeYoY).toBeCloseTo(20, 6) // 12 vs 10
  })

  it('handles a swing from loss to profit without dividing by zero', () => {
    const quarters = [
      q('2023-03-31', 100, -50),
      q('2023-06-30', 100, -40),
      q('2023-09-30', 100, -30),
      q('2023-12-31', 100, -20),
      q('2024-03-31', 100, 25),
    ]
    const t = earningsTrend(quarters)
    // Uses |base| so a negative starting point still yields a sensible sign.
    expect(t.incomeYoY).toBeGreaterThan(0)
  })

  it('needs five quarters to make a year-over-year comparison', () => {
    expect(earningsTrend([q('2024-03-31', 1, 1)])).toBeNull()
  })
})

describe('fundamentalLayer', () => {
  const quarters = [
    { asOf: '2023-03-31', shares: 1000, assets: 5000, liabilities: 3000, equity: 2000, currentAssets: 2500, cash: 900, debt: 400, revenue: 100, netIncome: 10 },
    { asOf: '2023-06-30', shares: 1000, assets: 5000, liabilities: 3000, equity: 2000, currentAssets: 2500, cash: 900, debt: 400, revenue: 105, netIncome: 11 },
    { asOf: '2023-09-30', shares: 1000, assets: 5000, liabilities: 3000, equity: 2000, currentAssets: 2500, cash: 900, debt: 400, revenue: 110, netIncome: 12 },
    { asOf: '2023-12-31', shares: 1000, assets: 5000, liabilities: 3000, equity: 2000, currentAssets: 2500, cash: 900, debt: 400, revenue: 115, netIncome: 13 },
    { asOf: '2024-03-31', shares: 1000, assets: 5000, liabilities: 3000, equity: 2000, currentAssets: 2500, cash: 900, debt: 400, revenue: 130, netIncome: 15 },
  ]

  it('reads growing revenue and income as improving', () => {
    const r = fundamentalLayer({ company: { quarters }, price: 4 })
    expect(r.available).toBe(true)
    expect(r.score).toBeGreaterThan(0)
    expect(r.reasons.some((x) => /Revenue up/.test(x.text))).toBe(true)
  })

  it('reads shrinking revenue as deteriorating', () => {
    const shrinking = quarters.map((q, i) => (i === 4 ? { ...q, revenue: 60, netIncome: 2 } : q))
    const r = fundamentalLayer({ company: { quarters: shrinking }, price: 4 })
    expect(r.score).toBeLessThan(0)
  })

  it('is unavailable — not neutral — when nothing is synced', () => {
    expect(fundamentalLayer({ company: null, price: 4 }).available).toBe(false)
    expect(fundamentalLayer({ company: { quarters: [] }, price: 4 }).available).toBe(false)
  })
})

describe('macroLayer', () => {
  const rising = build(120, (i) => bar(day(i), 100 * 1.002 ** i))
  const falling = build(120, (i) => bar(day(i), 100 * 0.998 ** i))

  it('reads rising bonds and credit as easing conditions', () => {
    const r = macroLayer({ tltBars: rising, hygBars: rising })
    expect(r.available).toBe(true)
    expect(r.score).toBe(2)
    expect(r.lean).toBe('points up')
  })

  it('reads falling bonds and credit as tightening', () => {
    const r = macroLayer({ tltBars: falling, hygBars: falling })
    expect(r.score).toBe(-2)
    expect(r.lean).toBe('points down')
  })

  it('reports a split between rates and credit as mixed', () => {
    expect(macroLayer({ tltBars: rising, hygBars: falling }).score).toBe(0)
  })

  it('is unavailable when the proxies have not synced', () => {
    expect(macroLayer({ tltBars: null, hygBars: null }).available).toBe(false)
  })
})

describe('combineLayers', () => {
  const layer = (score) => ({ available: true, score, lean: 'x', reasons: [] })
  const absent = { available: false, reason: 'not synced' }

  it('calls it aligned only when every available layer agrees', () => {
    const r = combineLayers({ technical: layer(2), fundamental: layer(1), macro: layer(3) })
    expect(r.alignment).toBe('aligned-up')
    expect(r.complete).toBe(true)
    expect(r.availableCount).toBe(3)
  })

  it('flags genuine disagreement instead of averaging it away', () => {
    const r = combineLayers({ technical: layer(3), fundamental: layer(-2), macro: layer(1) })
    expect(r.alignment).toBe('conflicting')
    expect(r.bullish).toBe(2)
    expect(r.bearish).toBe(1)
  })

  // The property that matters most: two layers agreeing while the third is
  // simply absent must never be presentable as a three-layer confluence.
  it('never treats a missing layer as agreement', () => {
    const r = combineLayers({ technical: layer(2), fundamental: absent, macro: layer(2) })
    expect(r.alignment).toBe('aligned-up')
    expect(r.complete).toBe(false)
    expect(r.availableCount).toBe(2)
    expect(r.missing).toEqual(['Fundamental'])
  })

  it('reports unknown when nothing is available', () => {
    const r = combineLayers({ technical: absent, fundamental: absent, macro: absent })
    expect(r.alignment).toBe('unknown')
    expect(r.complete).toBe(false)
    expect(r.missing).toHaveLength(3)
  })
})

describe('volume availability is distinct from volume failure', () => {
  // A feed that reports no volume (spot crypto here) must not be described as
  // "unconfirmed" — that implies participation was measured and found weak.
  const noVolume = build(200, (i) => ({ ...bar(day(i), 100 + (i > 190 ? 30 : (i % 9) * 0.4)), volume: 0 }))
  const withVolume = build(200, (i) => bar(day(i), 100 + (i > 190 ? 30 : (i % 9) * 0.4), 1e6))

  it('reports volume as unavailable rather than unconfirmed', () => {
    const r = detectBreakout(noVolume)
    expect(r.volumeAvailable).toBe(false)
    expect(r.volumeConfirmed).toBe(false)
    const layer = technicalLayer(noVolume)
    const text = layer.reasons.map((x) => x.text).join(' ')
    if (r.isBreakout) {
      expect(text).toMatch(/no volume data/i)
      expect(text).not.toMatch(/unconfirmed/i)
    }
  })

  it('still measures participation when volume exists', () => {
    expect(detectBreakout(withVolume).volumeAvailable).toBe(true)
  })
})

describe('earningsTrend aligns year-over-year by date, not array position', () => {
  const q = (asOf, revenue, netIncome) => ({ asOf, revenue, netIncome })

  it('skips gaps correctly instead of comparing against the wrong quarter', () => {
    // Real filings have gaps: fiscal-year-end quarters usually report revenue
    // only inside the annual total. Position-based indexing would compare the
    // latest quarter against five or six quarters back and call it YoY.
    const quarters = [
      q('2024-09-30', 100, 10),
      q('2024-12-31', null, null), // FY-end gap
      q('2025-03-31', 110, 11),
      q('2025-06-30', 120, 12),
      q('2025-09-30', 130, 13),
    ]
    const t = earningsTrend(quarters)
    // 2025-09-30 vs 2024-09-30 = +30%, not against 2025-03-31.
    expect(t.revenueYoY).toBeCloseTo(30, 6)
    expect(t.revenuePeriod).toBe('2024-09-30 → 2025-09-30')
  })

  it('reports unavailable rather than comparing across the wrong span', () => {
    const quarters = [
      q('2022-09-30', 100, 10),
      q('2025-03-31', 110, 11),
      q('2025-06-30', 120, 12),
      q('2025-09-30', 130, 13),
      q('2025-12-31', 140, 14),
    ]
    // Nothing sits within 45 days of one year before 2025-12-31.
    expect(earningsTrend(quarters).revenueYoY).toBeNull()
  })

  it('handles a metric present while the other is entirely missing', () => {
    const quarters = [
      q('2024-12-31', null, 10),
      q('2025-03-31', null, 11),
      q('2025-06-30', null, 12),
      q('2025-09-30', null, 13),
      q('2025-12-31', null, 14),
    ]
    const t = earningsTrend(quarters)
    expect(t.revenueYoY).toBeNull()
    // 2025-12-31 vs 2024-12-31 = +40%
    expect(t.incomeYoY).toBeCloseTo(40, 6)
  })
})
