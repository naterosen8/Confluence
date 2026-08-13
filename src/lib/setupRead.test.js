import { describe, it, expect } from 'vitest'
import { readSetup } from './setupRead.js'
import { computeSignals } from './indicators.js'
import { readCommittedBars } from './testBars.js'
import { TICKERS } from './tickers.js'

// Builds a synthetic series with a controllable shape.
function series({ n = 260, start = 100, drift = 0, wobble = 0.5, last }) {
  const bars = []
  let price = start
  for (let i = 0; i < n; i++) {
    price = price + drift + (i % 2 ? wobble : -wobble)
    bars.push({
      date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      open: price, high: price + 1, low: price - 1, close: price, volume: 1e6,
    })
  }
  if (last) Object.assign(bars[bars.length - 1], last)
  return bars
}

describe('readSetup', () => {
  it('names a downtrend as broken structure, not a dip', () => {
    const bars = series({ drift: -0.4 })
    const r = readSetup(bars, computeSignals(bars))
    expect(r.key).toBe('breakdown')
    expect(r.read).toMatch(/below both its 50-day and 200-day/)
  })

  it('names a clean uptrend, and says why that is not an edge', () => {
    const bars = series({ drift: 0.4 })
    const r = readSetup(bars, computeSignals(bars))
    expect(['trend-intact', 'extended']).toContain(r.key)
    // The read must not stop at "it is going up".
    expect(r.read).toMatch(/crowded|stretched|paying up/i)
  })

  it('always ships a falsifying condition, so a read can be checked', () => {
    const bars = readCommittedBars()
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = readSetup(b, computeSignals(b))
      expect(r, t.symbol).toBeTruthy()
      expect(r.name, t.symbol).toBeTruthy()
      expect(r.read.length, t.symbol).toBeGreaterThan(80)
      // A description nobody can check is just an opinion with extra steps.
      expect(r.invalidation, `${t.symbol} has no invalidation`).toBeTruthy()
      expect(r.invalidation.text.length, t.symbol).toBeGreaterThan(10)
    }
  })

  it('never claims to predict, on any ticker', () => {
    const bars = readCommittedBars()
    // The one thing this must not become. If a future edit slips predictive
    // or directive language in, this fails rather than shipping it.
    const banned = /\b(buy|sell|should|will (rise|fall|go)|recommend|target price|guaranteed|expect(ed)? to (rise|fall))\b/i
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = readSetup(b, computeSignals(b))
      expect(r.read, `${t.symbol}: ${r.read}`).not.toMatch(banned)
      expect(r.caveat).toMatch(/not a forecast/i)
    }
  })

  it('classifies with a spread rather than collapsing onto one label', () => {
    // A classifier that answers the same thing for everything is describing
    // its own bug, not the market. The first version put 13 of 24 into
    // "failed breakout" because the test was trivially true.
    const bars = readCommittedBars()
    const seen = {}
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = readSetup(b, computeSignals(b))
      seen[r.key] = (seen[r.key] ?? 0) + 1
    }
    const total = Object.values(seen).reduce((a, b) => a + b, 0)
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(4)
    expect(Math.max(...Object.values(seen)) / total).toBeLessThan(0.5)
  })

  it('returns null rather than guessing without data', () => {
    expect(readSetup([], null)).toBeNull()
    expect(readSetup(null, {})).toBeNull()
  })
})

describe('marketRead', () => {
  it('describes the tape without predicting it', async () => {
    const { marketRead } = await import('./marketRead.js')
    const m = marketRead({ barsBySymbol: readCommittedBars(), tickers: TICKERS })
    expect(m).toBeTruthy()
    expect(m.headline.length).toBeGreaterThan(5)
    expect(m.read.length).toBeGreaterThan(120)
    const banned = /\b(buy|sell|should|will (rise|fall|go)|recommend|target price|guaranteed|expect(ed)? to (rise|fall))\b/i
    expect(m.read).not.toMatch(banned)
    expect(m.caveat).toMatch(/not a forecast/i)
  })

  it('measures breadth across tracked names, excluding macro proxies', async () => {
    const { breadthOf } = await import('./marketRead.js')
    const b = breadthOf({ barsBySymbol: readCommittedBars(), tickers: TICKERS })
    const nonMacro = TICKERS.filter((t) => t.kind !== 'macro').length
    expect(b.counted).toBeLessThanOrEqual(nonMacro)
    expect(b.above).toBeLessThanOrEqual(b.counted)
    expect(b.pct).toBeCloseTo((b.above / b.counted) * 100, 6)
  })

  it('calls out an index holding up while its internals are not', async () => {
    const { marketRead } = await import('./marketRead.js')
    // A rising index with most names below their own 50-day is the divergence
    // no single ticker page can show, and the reason the read exists.
    const rising = (n, drift) => Array.from({ length: n }, (_, i) => {
      const c = 100 + i * drift
      return { date: `d${i}`, open: c, high: c + 1, low: c - 1, close: c, volume: 1e6 }
    })
    const falling = rising(260, 0.4).map((b, i, arr) =>
      i > arr.length - 30 ? { ...b, close: b.close - 30, high: b.high - 30, low: b.low - 30 } : b
    )
    const bars = { SPY: rising(260, 0.4) }
    const tickers = [{ symbol: 'SPY', kind: 'etf' }]
    for (let k = 0; k < 8; k++) {
      bars[`W${k}`] = falling
      tickers.push({ symbol: `W${k}`, kind: 'stock' })
    }
    const m = marketRead({ barsBySymbol: bars, tickers })
    expect(m.read).toMatch(/carried by a few of them/)
  })

  it('returns null rather than a read it cannot support', async () => {
    const { marketRead } = await import('./marketRead.js')
    expect(marketRead({ barsBySymbol: {}, tickers: TICKERS })).toBeNull()
  })
})
