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

describe('readPosition', () => {
  const bars = Array.from({ length: 300 }, (_, i) => {
    const c = 100 + Math.sin(i / 9) * 3
    return { date: `d${i}`, open: c, high: c + 1.2, low: c - 1.2, close: c, volume: 1e6 }
  })

  it('measures the gap to liquidation in daily ranges, not just percent', async () => {
    const { readPosition } = await import('./positionRead.js')
    const price = bars.at(-1).close
    const r = readPosition({
      bars,
      trade: { symbol: 'T', direction: 'long', leverage: 50 },
      result: { asOfPrice: price, liquidationAt: price * 0.98 },
    })
    expect(r.gapPct).toBeCloseTo(2, 1)
    expect(r.gapAtr).toBeGreaterThan(0)
    expect(r.read).toMatch(/times T's recent average daily range/)
  })

  // The bands are cut in ATR, not percent, so which band a given percentage
  // gap lands in depends on the instrument's own volatility — that is the
  // whole point of the read. What must hold for any instrument is that the
  // severity is monotonic in the gap.
  it('escalates the headline as the gap closes', async () => {
    const { readPosition } = await import('./positionRead.js')
    const price = bars.at(-1).close
    const SEVERITY = ['wide', 'moderate', 'tight', 'critical']
    const at = (mult) =>
      readPosition({
        bars,
        trade: { symbol: 'T', direction: 'long', leverage: 20 },
        result: { asOfPrice: price, liquidationAt: price * mult },
      })

    expect(at(0.999).key).toBe('critical')

    const gaps = [0.999, 0.99, 0.97, 0.94, 0.9, 0.8, 0.5]
    const ranks = gaps.map((m) => SEVERITY.indexOf(at(m).key))
    expect(ranks.every((r) => r >= 0)).toBe(true)
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1])
    // And it does actually traverse the range rather than sitting in one band.
    expect(ranks.at(-1)).toBe(0)
    expect(at(0.5).gapAtr).toBeGreaterThan(at(0.9).gapAtr)
  })

  it('says there is nothing to liquidate without borrowing', async () => {
    const { readPosition } = await import('./positionRead.js')
    const r = readPosition({
      bars,
      trade: { symbol: 'T', direction: 'long', leverage: 1 },
      result: { asOfPrice: 100, liquidationAt: null },
    })
    expect(r.key).toBe('unlevered')
    expect(r.read).toMatch(/cannot be closed out against you/)
  })

  it('counts past sessions without claiming a probability', async () => {
    const { readPosition } = await import('./positionRead.js')
    const price = bars.at(-1).close
    const r = readPosition({
      bars,
      trade: { symbol: 'T', direction: 'long', leverage: 50 },
      result: { asOfPrice: price, liquidationAt: price * 0.98 },
    })
    expect(r.sessionsCounted).toBeGreaterThan(200)
    expect(r.caveat).toMatch(/not a probability/i)
    expect(r.read).not.toMatch(/\b(chance|likely|probability|odds)\b/i)
  })
})

describe('readFundamentals', () => {
  it('leads with capital structure when the balance sheet is levered', async () => {
    const { readFundamentals } = await import('./fundamentalRead.js')
    const r = readFundamentals({
      valuation: { netCashPctOfMarketCap: -45, priceToBook: 3, marketCap: 1e9, asOf: '2026-06-30' },
      trend: { revenueYoY: 10, incomeYoY: 10 },
    })
    expect(r.key).toBe('levered')
    expect(r.read).toMatch(/thin end of this capital structure/)
  })

  it('separates growth that reaches the bottom line from growth that does not', async () => {
    const { readFundamentals } = await import('./fundamentalRead.js')
    const base = { netCashPctOfMarketCap: 2, priceToBook: 3, marketCap: 1e9, asOf: '2026-06-30' }
    expect(readFundamentals({ valuation: base, trend: { revenueYoY: 20, incomeYoY: 25 } }).key).toBe('compounding')
    expect(readFundamentals({ valuation: base, trend: { revenueYoY: 20, incomeYoY: -10 } }).key).toBe('margin-squeeze')
    expect(readFundamentals({ valuation: base, trend: { revenueYoY: -8, incomeYoY: -12 } }).key).toBe('contracting')
    expect(readFundamentals({ valuation: base, trend: { revenueYoY: -8, incomeYoY: 12 } }).key).toBe('cost-cutting')
  })

  it('always names the filing date it is speaking from', async () => {
    const { readFundamentals } = await import('./fundamentalRead.js')
    const r = readFundamentals({
      valuation: { netCashPctOfMarketCap: 2, priceToBook: 8, marketCap: 1e9, asOf: '2026-06-30' },
      trend: null,
    })
    expect(r.caveat).toContain('2026-06-30')
    expect(r.caveat).toMatch(/quarter behind/)
  })

  it('returns null rather than inventing a read without a balance sheet', async () => {
    const { readFundamentals } = await import('./fundamentalRead.js')
    expect(readFundamentals({ valuation: null, trend: null })).toBeNull()
  })
})

describe('macroQuadrant', () => {
  const q = async (r, c) => (await import('./macroRead.js')).macroQuadrant({ ratesChangePct: r, creditChangePct: c })

  it('names all four states distinctly', async () => {
    expect((await q(6, 4)).key).toBe('easing')
    expect((await q(6, -4)).key).toBe('flight-to-quality')
    expect((await q(-6, 4)).key).toBe('reflation')
    expect((await q(-6, -4)).key).toBe('tightening')
  })

  // The reason this module exists. The confluence layer scores rates +1 and
  // credit −1 and sums them to zero, reporting "split" for the single most
  // informative configuration on the board.
  it('does not net a flight to quality down to neutral', async () => {
    const r = await q(8, -8)
    expect(r.key).toBe('flight-to-quality')
    expect(r.read).toMatch(/money leaving risk for safety/)
    expect(r.read).not.toMatch(/neutral backdrop/)
  })

  it('refuses to read a direction into drift', async () => {
    const r = await q(0.4, -0.6)
    expect(r.key).toBe('quiet')
    expect(r.read).toMatch(/would be inventing one/)
  })

  it('flags a quadrant that only one leg is carrying', async () => {
    const r = await q(0.3, -7)
    expect(r.key).toBe('flight-to-quality')
    expect(r.note).toMatch(/rates leg .* small enough to be drift/)
    expect((await q(9, -8)).note).toBeNull()
  })

  it('returns null rather than half a quadrant', async () => {
    expect(await q(null, 4)).toBeNull()
    expect(await q(4, null)).toBeNull()
  })

  it('gives the screener and the ticker page the same taxonomy', async () => {
    const { macroQuadrant } = await import('./macroRead.js')
    const { marketRead } = await import('./marketRead.js')
    const bars = (drift) =>
      Array.from({ length: 260 }, (_, i) => {
        const c = 100 * (1 + (drift * i) / 259 / 100)
        return { date: `d${i}`, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 }
      })
    const barsBySymbol = { SPY: bars(30), TLT: bars(9), HYG: bars(-9), AAA: bars(30) }
    const tickers = [
      { symbol: 'SPY', kind: 'etf' },
      { symbol: 'AAA', kind: 'stock' },
    ]
    const m = marketRead({ barsBySymbol, tickers })
    expect(m.macro.key).toBe('flight-to-quality')
    expect(m.read).toContain(macroQuadrant({ ratesChangePct: m.ratesChangePct, creditChangePct: m.creditChangePct }).short)
  })
})

describe('macroRead adapter', () => {
  it('reads the confluence macro layer', async () => {
    const { macroRead } = await import('./macroRead.js')
    const r = macroRead({
      macro: { available: true, rates: { changePct: -7 }, credit: { changePct: -5 } },
    })
    expect(r.key).toBe('tightening')
    expect(r.read).toMatch(/most straightforwardly hostile/)
  })

  it('says so rather than guessing when one proxy has not synced', async () => {
    const { macroRead } = await import('./macroRead.js')
    const r = macroRead({ macro: { available: true, rates: { changePct: 7 }, credit: null } })
    expect(r.key).toBe('partial')
    expect(r.read).toMatch(/only worth reading against each other/)
  })

  it('returns null when the layer is unavailable', async () => {
    const { macroRead } = await import('./macroRead.js')
    expect(macroRead({ macro: { available: false } })).toBeNull()
    expect(macroRead({ macro: null })).toBeNull()
  })
})

describe('macroLayerFromQuadrant', () => {
  // The ticker page loads only its own ticker plus SPY, and getSeries() hands
  // back a generated random walk for anything else. The macro layer was built
  // from getSeries('TLT') and getSeries('HYG'), so every ticker page rendered
  // mock percentages as measured macro conditions. The layer now comes from
  // the sync-computed index instead.
  it('rebuilds the layer from the synced quadrant', async () => {
    const { macroLayerFromQuadrant, macroQuadrant } = await import('./macroRead.js')
    const l = macroLayerFromQuadrant(macroQuadrant({ ratesChangePct: 7, creditChangePct: -6 }))
    expect(l.available).toBe(true)
    expect(l.rates.changePct).toBe(7)
    expect(l.credit.changePct).toBe(-6)
    expect(l.reasons).toHaveLength(2)
    expect(l.reasons[0].direction).toBe('up')
    expect(l.reasons[1].direction).toBe('down')
    expect(l.lean).toBe('leans down')
  })

  it('returns null rather than a layer when the index has no macro', async () => {
    const { macroLayerFromQuadrant } = await import('./macroRead.js')
    expect(macroLayerFromQuadrant(null)).toBeNull()
    expect(macroLayerFromQuadrant(undefined)).toBeNull()
    expect(macroLayerFromQuadrant({ key: 'easing' })).toBeNull()
  })

  it('agrees with the layer computed directly from bars', async () => {
    const { macroLayerFromQuadrant, macroQuadrant } = await import('./macroRead.js')
    const { macroLayer } = await import('./confluence.js')
    const bars = readCommittedBars()
    const direct = macroLayer({ tltBars: bars.TLT, hygBars: bars.HYG })
    const viaIndex = macroLayerFromQuadrant(
      macroQuadrant({ ratesChangePct: direct.rates.changePct, creditChangePct: direct.credit.changePct })
    )
    expect(viaIndex.score).toBe(direct.score)
    expect(viaIndex.reasons.map((r) => r.text)).toEqual(direct.reasons.map((r) => r.text))
  })

  it('ships the macro pair in the committed screener index', async () => {
    // If this field goes missing the panel silently falls back, so it is
    // asserted against the file the site actually serves.
    const fs = await import('node:fs')
    const s = JSON.parse(fs.readFileSync('public/screener.json', 'utf8'))
    expect(s.market.macro).toBeTruthy()
    expect(typeof s.market.macro.ratesChangePct).toBe('number')
    expect(typeof s.market.macro.creditChangePct).toBe('number')
  })
})
