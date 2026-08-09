import { describe, it, expect } from 'vitest'
import { simulatePosition, liquidationPrice, leverageStudy } from './leverageStudy'

const bar = (close, low = close, high = close) => ({ date: 'd', open: close, high, low, close, volume: 1 })

describe('liquidationPrice', () => {
  it('puts the wipeout level a 1/leverage move away', () => {
    expect(liquidationPrice(100, 'long', 4)).toBe(75)
    expect(liquidationPrice(100, 'short', 4)).toBe(125)
    expect(liquidationPrice(100, 'long', 10)).toBe(90)
  })

  it('makes an unleveraged position unliquidatable', () => {
    expect(liquidationPrice(100, 'long', 1)).toBe(0)
    expect(liquidationPrice(100, 'short', 1)).toBe(Infinity)
  })
})

describe('simulatePosition', () => {
  // The single most important behaviour here: a leveraged position dies the
  // moment price *touches* the level intraday. Scoring on closes would report
  // this trade as a flat survivor.
  it('liquidates on an intraday wick even when the bar closes flat', () => {
    const bars = [bar(100), bar(100, 93), bar(100), bar(100), bar(100), bar(100)]
    const r = simulatePosition(bars, 0, 'long', 20, 5)
    expect(r.liquidated).toBe(true)
    expect(r.returnPct).toBe(-1)
  })

  it('survives a dip that stops short of the level', () => {
    const bars = [bar(100), bar(100, 96), bar(100), bar(100), bar(100), bar(100)]
    const r = simulatePosition(bars, 0, 'long', 20, 5)
    expect(r.liquidated).toBe(false)
    expect(r.returnPct).toBe(0)
  })

  it('liquidates a short on an upward wick', () => {
    const bars = [bar(100), bar(100, 100, 106), bar(100), bar(100), bar(100), bar(100)]
    expect(simulatePosition(bars, 0, 'short', 20, 5).liquidated).toBe(true)
    const safe = [bar(100), bar(100, 100, 104), bar(100), bar(100), bar(100), bar(100)]
    expect(simulatePosition(safe, 0, 'short', 20, 5).liquidated).toBe(false)
  })

  it('multiplies the close-to-close move by the leverage', () => {
    const up = [bar(100), bar(101), bar(101), bar(102), bar(102), bar(103)]
    expect(simulatePosition(up, 0, 'long', 10, 5).returnPct).toBeCloseTo(0.3, 10)
    const down = [bar(100), bar(99), bar(99), bar(98), bar(98), bar(97)]
    expect(simulatePosition(down, 0, 'short', 10, 5).returnPct).toBeCloseTo(0.3, 10)
  })

  it('never loses more than the stake', () => {
    const crash = [bar(100), bar(1, 0.5), bar(1), bar(1), bar(1), bar(1)]
    const r = simulatePosition(crash, 0, 'long', 1, 5)
    expect(r.liquidated).toBe(false)
    expect(r.returnPct).toBeCloseTo(-0.99, 10)
    expect(r.returnPct).toBeGreaterThanOrEqual(-1)
  })

  it('excludes entries without a full forward window rather than half-measuring them', () => {
    expect(simulatePosition([bar(100), bar(101), bar(102)], 0, 'long', 5, 5)).toBeNull()
  })
})

describe('leverageStudy', () => {
  // A flat series degenerates to a bearish score, which is a convenient way to
  // exercise the short path end to end.
  const flat = Array.from({ length: 260 }, () => bar(100))

  it('reports an empty study rather than throwing when nothing qualifies', () => {
    const r = leverageStudy({ bars: flat, capital: 1000, leverage: 10, matchesScore: () => false })
    expect(r.sampleSize).toBe(0)
  })

  it('never liquidates at 1x', () => {
    const r = leverageStudy({ bars: flat, capital: 1000, leverage: 1, matchesScore: () => true })
    expect(r.liquidatedCount).toBe(0)
  })

  it('scales dollar outcomes linearly with the stake', () => {
    const opts = { bars: flat, leverage: 5, matchesScore: () => true }
    const small = leverageStudy({ ...opts, capital: 1000 })
    const large = leverageStudy({ ...opts, capital: 10000 })
    expect(large.avgDollars).toBeCloseTo(small.avgDollars * 10, 6)
    expect(large.avgReturnPct).toBeCloseTo(small.avgReturnPct, 10)
  })

  it('is deterministic', () => {
    const run = () => leverageStudy({ bars: flat, capital: 1000, leverage: 10, matchesScore: () => true })
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})
