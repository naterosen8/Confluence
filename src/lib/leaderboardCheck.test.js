import { describe, it, expect } from 'vitest'
import { binomialPmf, binomialTwoSidedP, driftRate, benjaminiHochberg, leaderboardCheck, leaderboardVerdict } from './leaderboardCheck.js'
import { readCommittedBars } from './testBars.js'
import { TICKERS } from './tickers.js'

describe('binomial', () => {
  it('matches values that can be checked by hand', () => {
    expect(binomialPmf(0, 4, 0.5)).toBeCloseTo(0.0625, 10)
    expect(binomialPmf(2, 4, 0.5)).toBeCloseTo(0.375, 10)
    expect(binomialPmf(5, 5, 0.5)).toBeCloseTo(0.03125, 10)
    // Sums to one across the support.
    let total = 0
    for (let k = 0; k <= 20; k++) total += binomialPmf(k, 20, 0.37)
    expect(total).toBeCloseTo(1, 10)
  })

  it('stays exact at sample sizes where a normal approximation would not', () => {
    // 240 observations is a typical bucket here; the factorials involved
    // overflow long before this without working in log space.
    let total = 0
    for (let k = 0; k <= 240; k++) total += binomialPmf(k, 240, 0.54)
    expect(total).toBeCloseTo(1, 8)
  })

  it('gives a two-sided p-value that behaves', () => {
    expect(binomialTwoSidedP(5, 10, 0.5)).toBeCloseTo(1, 6)
    // 10 of 10 heads on a fair coin: 2 * 0.5^10.
    expect(binomialTwoSidedP(10, 10, 0.5)).toBeCloseTo(0.001953125, 9)
    // The same 60% win rate is unremarkable against a 60% drift.
    expect(binomialTwoSidedP(60, 100, 0.6)).toBeGreaterThan(0.9)
    // ...and only meaningful against a coin flip.
    expect(binomialTwoSidedP(60, 100, 0.5)).toBeLessThan(0.06)
  })
})

describe('driftRate', () => {
  it('measures how often price simply rose over the window', () => {
    const rising = Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, close: 100 + i }))
    expect(driftRate(rising, 5)).toBe(1)
    const falling = Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, close: 100 - i }))
    expect(driftRate(falling, 5)).toBe(0)
  })

  it('returns null rather than a fake number without enough history', () => {
    expect(driftRate([{ close: 1 }], 5)).toBeNull()
    expect(driftRate([], 5)).toBeNull()
  })
})

describe('benjaminiHochberg', () => {
  it('rejects nothing when everything is noise', () => {
    expect(benjaminiHochberg([0.6, 0.4, 0.9, 0.31], 0.05)).toEqual([])
  })

  it('finds the genuinely small ones', () => {
    const idx = benjaminiHochberg([0.0001, 0.6, 0.9, 0.4], 0.05)
    expect(idx).toEqual([0])
  })

  it('gets stricter as more hypotheses are tested — the whole point', () => {
    // A p of 0.01 clears the bar on its own...
    expect(benjaminiHochberg([0.01], 0.05)).toEqual([0])
    // ...and does not once it is the best of five hundred lookups.
    const many = [0.01, ...Array.from({ length: 499 }, () => 0.5)]
    expect(benjaminiHochberg(many, 0.05)).toEqual([])
  })
})

describe('leaderboardCheck on the real committed data', () => {
  const barsBySymbol = readCommittedBars()
  const check = leaderboardCheck({ barsBySymbol, tickers: TICKERS })

  it('tests the tickers the leaderboard can actually rank', () => {
    expect(check.testedCount).toBeGreaterThan(0)
    // Macro proxies never appear in the ranking, so testing them would make
    // the correction harsher than the selection it describes.
    const macro = TICKERS.filter((t) => t.kind === 'macro').map((t) => t.symbol)
    for (const m of macro) expect(check.rows.map((r) => r.symbol)).not.toContain(m)
  })

  it('compares each ticker against its own drift, not against a coin flip', () => {
    for (const row of check.rows) {
      expect(row.nullRate).toBeGreaterThan(0)
      expect(row.nullRate).toBeLessThan(100)
      expect(row.excessPoints).toBeCloseTo(row.winRate - row.nullRate, 6)
    }
  })

  it('produces a verdict that names the number of tickers looked at', () => {
    const text = leaderboardVerdict(check)
    expect(text).toContain(String(check.testedCount))
    expect(text.length).toBeGreaterThan(60)
  })

  it('says so honestly when there is nothing to test', () => {
    expect(leaderboardVerdict(null)).toMatch(/Not enough tracked history/)
    expect(leaderboardVerdict({ testedCount: 0 })).toMatch(/Not enough tracked history/)
  })
})
