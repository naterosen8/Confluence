import { describe, it, expect } from 'vitest'
import {
  dollarVolumes,
  liquidityRead,
  MARKET_IMPACT_SHARE,
  LIQUIDITY_LOOKBACK,
  THIN_ABSORBABLE,
} from './liquidityRead.js'

const bars = (volumes, close = 100) =>
  volumes.map((volume, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close,
    low: close,
    close,
    volume,
  }))

describe('dollarVolumes', () => {
  it('multiplies close by volume over the lookback window', () => {
    const v = dollarVolumes(bars(Array(30).fill(1000)), 20)
    expect(v).toHaveLength(20)
    expect(v[0]).toBe(100_000)
  })

  // The distinction the whole module turns on: this feed reports no volume at
  // all for currency pairs, and reading that as zero would label the most
  // liquid instruments here untradeable.
  it('reports nothing at all when the feed carries no volume', () => {
    expect(dollarVolumes(bars(Array(30).fill(0)))).toEqual([])
    expect(dollarVolumes(bars(Array(30).fill(null)))).toEqual([])
  })

  it('refuses a window where most sessions are missing volume', () => {
    const mixed = [...Array(14).fill(0), ...Array(6).fill(1000)]
    expect(dollarVolumes(bars(mixed), 20)).toEqual([])
  })

  it('accepts a window where most sessions have it', () => {
    const mixed = [...Array(5).fill(0), ...Array(15).fill(1000)]
    expect(dollarVolumes(bars(mixed), 20)).toHaveLength(15)
  })

  it('has nothing to say about no bars', () => {
    expect(dollarVolumes([])).toEqual([])
    expect(dollarVolumes(null)).toEqual([])
  })
})

describe('liquidityRead', () => {
  it('reports the unreported case as a data gap, not as thinness', () => {
    const r = liquidityRead({ bars: bars(Array(30).fill(0)), symbol: 'BTC/USD' })
    expect(r.reported).toBe(false)
    expect(r.headline).toMatch(/not reported/i)
    expect(r.read).toMatch(/not a statement that the instrument is thin/i)
    // No number is invented to fill the hole.
    expect(r.medianDollarVolume).toBeUndefined()
    expect(r.absorbable).toBeUndefined()
  })

  it('takes the median session, not the mean, so one spike does not set it', () => {
    const quiet = Array(19).fill(1_000_000)
    const r = liquidityRead({ bars: bars([...quiet, 500_000_000]), symbol: 'AAA' })
    // Mean would be ~$27M a session; median is $100M of traded value.
    expect(r.medianDollarVolume).toBe(100_000_000)
  })

  it('sizes against a quiet session as well as a typical one', () => {
    // A steadily thinning tape: the tenth-percentile day is far below median.
    const vols = Array.from({ length: 20 }, (_, i) => (i + 1) * 100_000)
    const r = liquidityRead({ bars: bars(vols), symbol: 'AAA' })
    expect(r.quietDollarVolume).toBeLessThan(r.medianDollarVolume)
    expect(r.absorbableQuiet).toBeLessThan(r.absorbable)
    expect(r.absorbableQuiet).toBeCloseTo(r.quietDollarVolume * MARKET_IMPACT_SHARE, 6)
  })

  it('applies the impact share to arrive at an absorbable size', () => {
    const r = liquidityRead({ bars: bars(Array(20).fill(1_000_000)), symbol: 'AAA' })
    expect(r.absorbable).toBeCloseTo(r.medianDollarVolume * MARKET_IMPACT_SHARE, 6)
  })

  it('flags a name where a real position would be a share of the day', () => {
    // 1% of this is well under the threshold.
    const thin = liquidityRead({ bars: bars(Array(20).fill(1000), 10), symbol: 'THIN' })
    expect(thin.absorbable).toBeLessThan(THIN_ABSORBABLE)
    expect(thin.thin).toBe(true)
    expect(thin.headline).toMatch(/^Thin/)
    expect(thin.read).toMatch(/assumes fills at the screen price/i)
  })

  it('does not flag a deeply traded name', () => {
    const deep = liquidityRead({ bars: bars(Array(20).fill(10_000_000)), symbol: 'DEEP' })
    expect(deep.thin).toBe(false)
    expect(deep.headline).toMatch(/Absorbs about/)
  })

  it('never states a direction', () => {
    for (const b of [bars(Array(20).fill(1_000_000)), bars(Array(20).fill(1000), 10), bars(Array(20).fill(0))]) {
      const r = liquidityRead({ bars: b, symbol: 'AAA' })
      const text = `${r.headline} ${r.read} ${r.caveat}`
      expect(text).not.toMatch(/\b(buy|sell|long|short|bullish|bearish|should)\b/i)
    }
  })

  it('defaults to a one-month window', () => {
    expect(LIQUIDITY_LOOKBACK).toBe(20)
    const r = liquidityRead({ bars: bars(Array(300).fill(1_000_000)), symbol: 'AAA' })
    expect(r.sessions).toBe(20)
  })
})
