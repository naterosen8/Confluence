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
