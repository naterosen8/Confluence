import { describe, it, expect } from 'vitest'
import { leverageSurvival, maxFullySurvivable, riskRead, LEVERAGE_RUNGS } from './riskRead.js'
import { readCommittedBars } from './testBars.js'
import { TICKERS } from './tickers.js'

// A series that only ever rises. A long survives at any size; a short is
// liquidated at the rungs whose threshold the drift clears. At ~1%/session
// that is ~5% over a five-session hold, which kills 50x (dies at 2%) and 25x
// (4%) but not 10x (10%) — the first version of this test drifted only 1.5%
// and asserted that 50x short died, which it correctly did not.
const rising = Array.from({ length: 320 }, (_, i) => {
  const c = 100 * Math.pow(1.01, i)
  return { date: `d${i}`, open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 1e6 }
})

describe('leverageSurvival', () => {
  it('reports every rung the simulator offers', () => {
    const s = leverageSurvival({ bars: rising })
    expect(s.rungs.map((r) => r.leverage)).toEqual(LEVERAGE_RUNGS)
    expect(s.entries).toBeGreaterThan(0)
  })

  it('survives everything on a series that only rises, long', () => {
    const s = leverageSurvival({ bars: rising, direction: 'long' })
    expect(s.rungs.every((r) => r.survived === r.total)).toBe(true)
    expect(maxFullySurvivable(s)).toBe(50)
  })

  it('and is destroyed on the same series, short, at exactly the rungs the drift reaches', () => {
    const s = leverageSurvival({ bars: rising, direction: 'short' })
    const by = new Map(s.rungs.map((r) => [r.leverage, r]))
    // ~5% adverse over the hold: fatal above 20x, survivable at or below 10x.
    expect(by.get(50).survived).toBe(0)
    expect(by.get(25).survived).toBe(0)
    expect(by.get(10).survived).toBe(by.get(10).total)
    expect(maxFullySurvivable(s)).toBe(10)
  })

  // Survival can only fall as leverage rises — if it ever does not, the
  // simulation is wrong somewhere.
  it('is monotonic in leverage on every tracked ticker', () => {
    const bars = readCommittedBars()
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const s = leverageSurvival({ bars: b })
      const pcts = s.rungs.map((r) => r.survivalPct)
      for (let i = 1; i < pcts.length; i++) {
        expect(pcts[i], `${t.symbol} ${s.rungs[i].leverage}x survives more than ${s.rungs[i - 1].leverage}x`).toBeLessThanOrEqual(pcts[i - 1] + 1e-9)
      }
    }
  })

  it('returns null rather than a read without data', () => {
    expect(leverageSurvival({ bars: [] })).toBeNull()
    expect(riskRead({ bars: null, symbol: 'X' })).toBeNull()
  })
})

describe('riskRead', () => {
  it('gives a concrete survivable size for every tracked ticker', () => {
    const bars = readCommittedBars()
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = riskRead({ bars: b, symbol: t.symbol })
      expect(r, t.symbol).toBeTruthy()
      expect(r.headline.length, t.symbol).toBeGreaterThan(10)
      expect(r.caveat, t.symbol).toMatch(/not what it will do next/)
    }
  })

  // The one place the site speaks in the imperative. It must stay a statement
  // about what already happened, never about direction or what to buy.
  it('never turns into a directional call', () => {
    const bars = readCommittedBars()
    const banned = /\b(buy|sell|should buy|will rise|will fall|recommend|target price|guaranteed|good time to)\b/i
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = riskRead({ bars: b, symbol: t.symbol })
      expect(`${r.headline} ${r.read}`, t.symbol).not.toMatch(banned)
    }
  })

  it('says plainly that the safe size is not a recommendation', () => {
    const bars = readCommittedBars()
    const r = riskRead({ bars: bars.SPY, symbol: 'SPY' })
    expect(r.read).toMatch(/not a recommendation/)
  })

  it('varies by instrument rather than printing one number for everything', () => {
    const bars = readCommittedBars()
    const sizes = new Set(
      TICKERS.filter((t) => bars[t.symbol]).map((t) => riskRead({ bars: bars[t.symbol], symbol: t.symbol }).safeLeverage)
    )
    expect(sizes.size).toBeGreaterThan(1)
  })
})

describe('excursions', () => {
  it('measures depth on intraday lows, not closes', async () => {
    const { excursions } = await import('./riskRead.js')
    // Every bar closes flat but wicks 10% down. A close-based measure would
    // report no drawdown at all; a stop would have been hit every time.
    const wicky = Array.from({ length: 20 }, (_, i) => ({
      date: `d${i}`, open: 100, high: 101, low: 90, close: 100, volume: 1e6,
    }))
    const e = excursions({ bars: wicky, forwardDays: 3, lookback: 10 })
    expect(e.length).toBeGreaterThan(0)
    expect(e.every((x) => x.adversePct <= -9.9)).toBe(true)
    expect(e.every((x) => x.endPct === 0)).toBe(true)
  })

  it('flips sign for a short', async () => {
    const { excursions } = await import('./riskRead.js')
    const rising2 = Array.from({ length: 30 }, (_, i) => {
      const c = 100 + i
      return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1e6 }
    })
    const long = excursions({ bars: rising2, direction: 'long', forwardDays: 3, lookback: 20 })
    const short = excursions({ bars: rising2, direction: 'short', forwardDays: 3, lookback: 20 })
    expect(long.every((x) => x.endPct > 0)).toBe(true)
    expect(short.every((x) => x.endPct < 0)).toBe(true)
    expect(short.every((x) => x.adversePct < 0)).toBe(true)
  })
})

describe('stopRead', () => {
  const bars = readCommittedBars()
  const atrOf = async (b) => (await import('./indicators.js')).atrSeries(b, 14).at(-1)

  it('reports a usable distance for every tracked ticker', async () => {
    const { stopRead } = await import('./riskRead.js')
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = stopRead({ bars: b, symbol: t.symbol, atr: await atrOf(b) })
      expect(r, t.symbol).toBeTruthy()
      expect(r.levels.length, t.symbol).toBeGreaterThan(0)
      expect(r.caveat, t.symbol).toMatch(/gap through the level/)
    }
  })

  // Wider stops can only be hit less often. If that inverts, the excursion
  // comparison is wrong somewhere.
  it('is monotonic: a wider stop is never hit more often', async () => {
    const { stopRead } = await import('./riskRead.js')
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = stopRead({ bars: b, symbol: t.symbol, atr: await atrOf(b) })
      for (let i = 1; i < r.levels.length; i++) {
        expect(r.levels[i].hitPct, `${t.symbol} ${r.levels[i].mult} ATR`).toBeLessThanOrEqual(r.levels[i - 1].hitPct + 1e-9)
        expect(r.levels[i].winnersLostPct, `${t.symbol} winners`).toBeLessThanOrEqual(r.levels[i - 1].winnersLostPct + 1e-9)
      }
    }
  })

  it('picks the tightest distance that keeps most winners', async () => {
    const { stopRead } = await import('./riskRead.js')
    const r = stopRead({ bars: bars.SPY, symbol: 'SPY', atr: await atrOf(bars.SPY) })
    expect(r.keeper.winnersLostPct).toBeLessThanOrEqual(10)
    const tighter = r.levels.filter((l) => l.mult < r.keeper.mult)
    expect(tighter.every((l) => l.winnersLostPct > 10)).toBe(true)
  })

  it('returns null rather than guessing without an ATR', async () => {
    const { stopRead } = await import('./riskRead.js')
    expect(stopRead({ bars: bars.SPY, symbol: 'SPY', atr: 0 })).toBeNull()
    expect(stopRead({ bars: bars.SPY, symbol: 'SPY', atr: null })).toBeNull()
  })
})

describe('drawdownRead', () => {
  const bars = readCommittedBars()

  it('orders median, worst decile and deepest correctly', async () => {
    const { drawdownRead } = await import('./riskRead.js')
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = drawdownRead({ bars: b, symbol: t.symbol })
      expect(r.medianAdversePct, t.symbol).toBeLessThanOrEqual(0)
      expect(r.worstDecilePct, t.symbol).toBeLessThanOrEqual(r.medianAdversePct)
      expect(r.worstPct, t.symbol).toBeLessThanOrEqual(r.worstDecilePct)
    }
  })

  // The point of the read: winners are not a smooth ride either.
  it('reports the drawdown inside the winners separately', async () => {
    const { drawdownRead } = await import('./riskRead.js')
    const r = drawdownRead({ bars: bars.SPY, symbol: 'SPY' })
    expect(r.winnerMedianAdversePct).toBeLessThanOrEqual(0)
    expect(r.read).toMatch(/ended profitable/)
  })

  it('warns that leverage multiplies all of it', async () => {
    const { drawdownRead } = await import('./riskRead.js')
    expect(drawdownRead({ bars: bars.SPY, symbol: 'SPY' }).caveat).toMatch(/Leverage multiplies/)
  })

  it('never turns into a directional call', async () => {
    const { drawdownRead, stopRead } = await import('./riskRead.js')
    const { atrSeries } = await import('./indicators.js')
    const banned = /\b(buy|sell|will rise|will fall|recommend|target price|guaranteed|good time to)\b/i
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const d = drawdownRead({ bars: b, symbol: t.symbol })
      const s = stopRead({ bars: b, symbol: t.symbol, atr: atrSeries(b, 14).at(-1) })
      expect(`${d.headline} ${d.read}`, t.symbol).not.toMatch(banned)
      expect(`${s.headline} ${s.read}`, t.symbol).not.toMatch(banned)
    }
  })
})

describe('recoveryRead', () => {
  const bars = readCommittedBars()
  const atrOf = async (b) => (await import('./indicators.js')).atrSeries(b, 14).at(-1)

  // The bug this read shipped with first: measuring the intraday low made half
  // of BTC/USD's drawdowns "recover in 0 sessions", because the same bar that
  // wicked an ATR down also traded back at entry before the close. That is a
  // wick, not a drawdown anybody holds through.
  it('starts the clock on a CLOSE under water, never an intraday wick', async () => {
    const { recoveryRead } = await import('./riskRead.js')
    // Every bar closes flat and wicks 10% down: nothing ever closes under.
    const wicky = Array.from({ length: 200 }, (_, i) => ({
      date: `d${i}`, open: 100, high: 101, low: 90, close: 100, volume: 1e6,
    }))
    expect(recoveryRead({ bars: wicky, symbol: 'W', atr: 1, lookback: 100, horizon: 20 })).toBeNull()
  })

  it('never reports a zero-session recovery', async () => {
    const { recoveryRead } = await import('./riskRead.js')
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = recoveryRead({ bars: b, symbol: t.symbol, atr: await atrOf(b) })
      if (!r || r.recovered === 0) continue
      expect(r.medianSessions, `${t.symbol} recovers in 0 sessions`).toBeGreaterThanOrEqual(1)
      expect(r.p90Sessions, t.symbol).toBeGreaterThanOrEqual(r.medianSessions)
    }
  })

  it('accounts for every drawdown as either recovered or not', async () => {
    const { recoveryRead } = await import('./riskRead.js')
    for (const t of TICKERS) {
      const b = bars[t.symbol]
      if (!b) continue
      const r = recoveryRead({ bars: b, symbol: t.symbol, atr: await atrOf(b) })
      if (!r) continue
      expect(r.recovered + r.neverRecovered, t.symbol).toBe(r.wentUnder)
    }
  })

  it('leads with the never-recovered share when it is large', async () => {
    const { recoveryRead } = await import('./riskRead.js')
    const r = recoveryRead({ bars: bars['BTC/USD'], symbol: 'BTC/USD', atr: await atrOf(bars['BTC/USD']) })
    expect(r.neverRecoveredPct).toBeGreaterThan(25)
    expect(r.headline).toMatch(/never came back/)
  })

  it('says waiting out a drawdown is not free at leverage', async () => {
    const { recoveryRead } = await import('./riskRead.js')
    const r = recoveryRead({ bars: bars.SPY, symbol: 'SPY', atr: await atrOf(bars.SPY) })
    expect(r.caveat).toMatch(/funding/)
  })

  it('returns null rather than guessing without an ATR', async () => {
    const { recoveryRead } = await import('./riskRead.js')
    expect(recoveryRead({ bars: bars.SPY, symbol: 'SPY', atr: 0 })).toBeNull()
  })
})

describe('risk figures in the screener index', () => {
  it('ships one for every row of the committed index', async () => {
    const fs = await import('node:fs')
    const s = JSON.parse(fs.readFileSync('public/screener.json', 'utf8'))
    const missing = s.rows.filter((r) => !r.risk).map((r) => r.symbol)
    expect(missing).toEqual([])
    for (const r of s.rows) {
      expect(typeof r.risk.safeLeverage === 'number' || r.risk.safeLeverage === null, r.symbol).toBe(true)
      if (r.risk.medianDrawdownPct != null) expect(r.risk.medianDrawdownPct, r.symbol).toBeLessThanOrEqual(0)
    }
  })

  it('matches what recomputing from the raw bars gives', async () => {
    const fs = await import('node:fs')
    const { riskRead } = await import('./riskRead.js')
    const s = JSON.parse(fs.readFileSync('public/screener.json', 'utf8'))
    const bars = readCommittedBars()
    for (const sym of ['SPY', 'BTC/USD', 'NVDA']) {
      const row = s.rows.find((r) => r.symbol === sym)
      const fresh = riskRead({ bars: bars[sym], symbol: sym })
      expect(row.risk.safeLeverage, sym).toBe(fresh.safeLeverage)
    }
  })
})
