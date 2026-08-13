import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildScreener, buildScreenerRow, flagsFor, SPARK_POINTS } from './screener.js'
import { computeSignals } from './indicators.js'
import { bestAvailableStat } from './backtest.js'

const dataPath = path.resolve(new URL('../../public/market-data.json', import.meta.url).pathname)
const barsBySymbol = JSON.parse(fs.readFileSync(dataPath, 'utf8')).bars
const tickers = [
  { symbol: 'AAPL', name: 'Apple', kind: 'stock' },
  { symbol: 'SPY', name: 'S&P 500 ETF', kind: 'etf' },
  { symbol: 'BTC/USD', name: 'Bitcoin', kind: 'crypto' },
]

// The whole risk of precomputing is that the summary drifts from what the app
// would have computed, and nothing on the page would show it — the dashboard
// would simply be quietly wrong. These check the two against each other on
// real committed bars.
describe('the index agrees with computing it live', () => {
  const spyBars = barsBySymbol.SPY

  for (const ticker of tickers) {
    it(`matches computeSignals for ${ticker.symbol}`, () => {
      const bars = barsBySymbol[ticker.symbol]
      const row = buildScreenerRow({ ticker, bars, spyBars })
      const live = computeSignals(bars)

      expect(row.price).toBeCloseTo(live.price, 4)
      expect(row.rsi).toBeCloseTo(live.rsi, 1)
      expect(row.score).toBe(live.score)
      expect(row.verdict).toBe(live.verdict)
      expect(row.bullishPoints).toBe(live.bullishPoints)
      expect(row.bearishPoints).toBe(live.bearishPoints)
      expect(row.macd).toBe(live.macd ? (live.macd.histogram > 0 ? 'above' : 'below') : null)
      expect(row.flags).toEqual(flagsFor(live))
    })

    it(`matches bestAvailableStat for ${ticker.symbol}`, () => {
      const bars = barsBySymbol[ticker.symbol]
      const row = buildScreenerRow({ ticker, bars, spyBars })
      const live = bestAvailableStat(bars, spyBars)
      expect(row.edge).toBeCloseTo(live.edge, 3)
      if (live.stat) {
        expect(row.stat.winRate).toBeCloseTo(live.stat.winRate, 2)
        expect(row.stat.sampleSize).toBe(live.stat.sampleSize)
        expect(row.stat.avgReturn).toBeCloseTo(live.stat.avgReturn, 3)
        expect(row.stat.source).toBe(live.source)
      } else {
        expect(row.stat).toBeNull()
      }
    })
  }
})

describe('the index stays small enough to grow into', () => {
  it('ships a bounded spark rather than the whole series', () => {
    const row = buildScreenerRow({ ticker: tickers[0], bars: barsBySymbol.AAPL, spyBars: barsBySymbol.SPY })
    expect(row.spark).toHaveLength(SPARK_POINTS)
    expect(barsBySymbol.AAPL.length).toBeGreaterThan(SPARK_POINTS * 10)
  })

  it('keeps a row to a few hundred bytes', () => {
    // The entire point: a row must cost hundreds of bytes, not the ~92 KB of
    // raw bars behind it, or the ticker list cannot grow.
    const row = buildScreenerRow({ ticker: tickers[0], bars: barsBySymbol.AAPL, spyBars: barsBySymbol.SPY })
    expect(JSON.stringify(row).length).toBeLessThan(1200)
  })
})

describe('buildScreener', () => {
  it('omits a symbol it has no bars for rather than inventing one', () => {
    const out = buildScreener({
      barsBySymbol,
      tickers: [...tickers, { symbol: 'NOPE', name: 'Missing', kind: 'stock' }],
    })
    expect(out.rows.map((r) => r.symbol)).toEqual(['AAPL', 'SPY', 'BTC/USD'])
  })

  it('carries the self-check so no page has to recompute it across every ticker', () => {
    const out = buildScreener({ barsBySymbol, tickers })
    expect(out.directionCheck).toBeTruthy()
    expect(out.directionCheck.tickerCount).toBe(3)
    expect(Number.isFinite(out.directionCheck.meanCorr)).toBe(true)
  })
})

describe('the committed index is current', () => {
  it('covers every ticker that has bars, with the fields the dashboard reads', () => {
    const shipped = JSON.parse(
      fs.readFileSync(path.resolve(new URL('../../public/screener.json', import.meta.url).pathname), 'utf8')
    )
    expect(shipped.rows.length).toBeGreaterThan(0)
    for (const row of shipped.rows) {
      for (const field of ['symbol', 'name', 'kind', 'price', 'score', 'verdict', 'flags', 'spark']) {
        expect(row, `${row.symbol}.${field}`).toHaveProperty(field)
      }
      expect(Array.isArray(row.spark)).toBe(true)
      expect(Array.isArray(row.flags)).toBe(true)
    }
  })
})
