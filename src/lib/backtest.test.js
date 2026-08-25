import { describe, it, expect } from 'vitest'
import { backtestTicker, backtestByScore, regimeSeries, bestAvailableStat, mostRecentEvent, summarize, FORWARD_DAYS } from './backtest'

const bar = (date, close) => ({ date, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1e6 })

function days(n, fn) {
  return Array.from({ length: n }, (_, i) => bar(new Date(Date.UTC(2023, 0, 2) + i * 86400000).toISOString().slice(0, 10), fn(i)))
}

describe('forward-window boundaries', () => {
  // The subtle failure mode for any forward-return backtest is measuring a
  // window that runs past the end of the data, which silently truncates the
  // holding period and flatters recent signals.
  it('never counts an occurrence without a full forward window', () => {
    const bars = days(300, (i) => 100 + Math.sin(i / 9) * 12)
    const r = backtestByScore(bars, bars)
    const totalOccurrences = r.rows.reduce((a, row) => a + row.all.sampleSize, 0)
    // Every counted day must have `forwardDays` real bars after it.
    expect(totalOccurrences).toBeLessThanOrEqual(bars.length - r.forwardDays)
    expect(r.forwardDays).toBe(FORWARD_DAYS)
  })

  it('agrees between the two backtest entry points on the window length', () => {
    const bars = days(300, (i) => 100 + Math.sin(i / 7) * 10)
    expect(backtestTicker(bars).forwardDays).toBe(backtestByScore(bars, bars).forwardDays)
  })
})

describe('summary statistics', () => {
  it('computes win rate, average, best and worst over a known series', () => {
    // Strictly rising: every MACD bullish cross must be followed by a gain.
    const rising = days(300, (i) => 100 * 1.002 ** i)
    const r = backtestTicker(rising)
    const bull = r.macdBullishCross
    if (bull.sampleSize > 0) {
      expect(bull.winRate).toBe(100)
      expect(bull.avgReturn).toBeGreaterThan(0)
      expect(bull.worstReturn).toBeGreaterThan(0)
      expect(bull.bestReturn).toBeGreaterThanOrEqual(bull.worstReturn)
    }
  })

  it('reports an empty summary rather than NaN when nothing occurred', () => {
    const flat = days(300, () => 100)
    const r = backtestTicker(flat)
    for (const key of ['macdBullishCross', 'macdBearishCross', 'rsiExitOversold', 'rsiEnterOverbought']) {
      const s = r[key]
      if (s.sampleSize === 0) {
        expect(s.winRate).toBeUndefined()
        expect(Number.isNaN(s.avgReturn ?? 0)).toBe(false)
      }
    }
  })

  it('treats a flat outcome as a non-win', () => {
    // Win rate counts strictly positive returns, so a dead-flat forward
    // window must not be scored as a win.
    const flat = days(300, () => 100)
    const r = backtestByScore(flat, flat)
    for (const row of r.rows) {
      if (row.all.sampleSize > 0) expect(row.all.winRate).toBe(0)
    }
  })
})

describe('regimeSeries and regime matching', () => {
  it('classifies a sustained uptrend as up and a downtrend as down', () => {
    const up = days(300, (i) => 100 * 1.003 ** i)
    const down = days(300, (i) => 300 * 0.997 ** i)
    expect([...regimeSeries(up).values()].at(-1)).toBe('up')
    expect([...regimeSeries(down).values()].at(-1)).toBe('down')
  })

  it('produces no classification before 200 bars exist', () => {
    expect(regimeSeries(days(150, (i) => 100 + i)).size).toBe(0)
  })

  it('matches weekend crypto bars to the prior trading day', () => {
    // SPY trades weekdays only; the crypto series includes every day. Before
    // the nearest-prior-day lookup, every weekend bar went unmatched.
    const spy = days(300, (i) => 100 * 1.003 ** i).filter((b) => {
      const dow = new Date(b.date + 'T00:00:00Z').getUTCDay()
      return dow !== 0 && dow !== 6
    })
    const crypto = days(300, (i) => 100 * 1.003 ** i)
    const r = backtestByScore(crypto, spy)
    const matched = r.rows.reduce((a, row) => a + row.regimeMatched.sampleSize, 0)
    expect(r.currentRegime).not.toBeNull()
    expect(matched).toBeGreaterThan(0)
  })

  it('falls back to no regime rather than throwing on short SPY history', () => {
    const bars = days(300, (i) => 100 + i)
    const r = backtestByScore(bars, days(10, () => 100))
    expect(r.currentRegime).toBeNull()
    expect(r.rows.every((row) => row.regimeMatched.sampleSize === 0)).toBe(true)
  })
})

describe('bestAvailableStat', () => {
  const bars = days(300, (i) => 100 + Math.sin(i / 11) * 15)

  it('prefers the regime-matched sample only when it clears the minimum', () => {
    const r = bestAvailableStat(bars, bars, { minSample: 1000 })
    // With an unreachable minimum, neither sample qualifies and no edge is claimed.
    expect(r.stat).toBeNull()
    expect(r.source).toBeNull()
    expect(r.edge).toBe(0)
  })

  it('weights the edge by the square root of the sample size', () => {
    const r = bestAvailableStat(bars, bars, { minSample: 1 })
    if (r.stat) {
      expect(r.edge).toBeCloseTo((r.stat.winRate - 50) * Math.sqrt(r.stat.sampleSize), 9)
    }
  })

  it('gives a bearish record the same magnitude of edge as a bullish one', () => {
    // The leaderboard ranks on |edge|, so direction must not change the scale.
    const bullish = { winRate: 80, sampleSize: 25 }
    const bearish = { winRate: 20, sampleSize: 25 }
    const e = (s) => (s.winRate - 50) * Math.sqrt(s.sampleSize)
    expect(Math.abs(e(bullish))).toBeCloseTo(Math.abs(e(bearish)), 12)
  })
})

describe('mostRecentEvent', () => {
  it('reports nothing when no tracked event fired recently', () => {
    const flat = days(300, () => 100)
    expect(mostRecentEvent(flat, 3)).toBeNull()
  })

  it('counts barsAgo from the end of the series', () => {
    const bars = days(300, (i) => 100 + Math.sin(i / 6) * 8)
    const e = mostRecentEvent(bars, 300)
    if (e) {
      expect(e.barsAgo).toBeGreaterThanOrEqual(0)
      expect(e.barsAgo).toBeLessThan(bars.length)
      expect(e.label).toBeTruthy()
    }
  })
})

describe('base rates are tested against drift, not a coin flip', () => {
  // A rising series: nearly every forward window is a win, so a signal that
  // "wins" 90% of the time is carrying no information about this instrument.
  const rising = Array.from({ length: 400 }, (_, i) => {
    const c = 100 * (1 + i * 0.002)
    return { date: `d${i}`, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 }
  })

  it('reports the instrument drift alongside every base rate', async () => {
    const { backtestTicker } = await import('./backtest.js')
    const bt = backtestTicker(rising)
    expect(bt.drift).toBeGreaterThan(90)
    for (const key of ['macdBullishCross', 'macdBearishCross', 'rsiExitOversold', 'rsiEnterOverbought']) {
      if (!bt[key]?.sampleSize) continue
      expect(bt[key].drift, key).toBeCloseTo(bt.drift, 6)
    }
  })

  it('does not call a win rate an edge when the instrument delivers it anyway', async () => {
    const { backtestTicker } = await import('./backtest.js')
    const bt = backtestTicker(rising)
    for (const key of ['macdBullishCross', 'macdBearishCross', 'rsiExitOversold', 'rsiEnterOverbought']) {
      const s = bt[key]
      if (!s?.sampleSize) continue
      // Everything wins on a monotonic series, so nothing can beat the drift.
      expect(s.distinguishable, `${key} claims an edge over a ${bt.drift.toFixed(0)}% drift`).toBe(false)
    }
  })

  it('keeps the coin-flip verdict under its own name so the two cannot be confused', async () => {
    const { backtestTicker } = await import('./backtest.js')
    const s = Object.values(backtestTicker(rising)).find((v) => v?.sampleSize > 10)
    // On this series the win rate is far from 50% but equal to drift: the two
    // verdicts must disagree, which is the whole point of separating them.
    expect(s.distinguishableFromCoinFlip).toBe(true)
    expect(s.distinguishable).toBe(false)
  })

  it('computes the drift baseline over every window, not just signal windows', async () => {
    const { driftBaseline } = await import('./backtest.js')
    const closes = [1, 2, 3, 2, 1]
    // Windows of 2: (1->3) up, (2->2) flat, (3->1) down => 1 win of 3.
    expect(driftBaseline(closes, 2)).toEqual({ wins: 1, total: 3 })
  })
})

describe('the gap interval is built on the independent sample', () => {
  // This function was already computing `independentSample` and then building
  // the interval on the raw occurrence count anyway — so a ticker page printed
  // "distinguishable" from an interval on N=183 directly above a sentence
  // saying that 183 was really 53. Across the tracked universe, 22 of 88
  // tickers claimed a distinguishable gap and 1 survived being asked on the
  // sample the page itself reports.
  const series = (n, up) => {
    // Consecutive indices, so every forward window overlaps the next: the
    // worst case for treating occurrences as independent.
    const occurrences = Array.from({ length: n }, (_, i) => ({ index: i, return: i < up ? 0.02 : -0.02 }))
    return summarize(occurrences, { wins: 50, total: 100 })
  }

  it('reports an independent sample far below the raw count when windows overlap', () => {
    const s = series(100, 70)
    expect(s.sampleSize).toBe(100)
    expect(s.independentSample).toBeLessThan(s.sampleSize / 2)
  })

  it('gives a wider interval than the raw count would', () => {
    const s = series(100, 70)
    const honest = s.gapHigh - s.gapLow
    const naive = s.naiveGapHigh - s.naiveGapLow
    expect(honest).toBeGreaterThan(naive)
  })

  it('leaves the point estimate where it was — shrinking N widens, it does not move', () => {
    const s = series(100, 70)
    // Asserted against the rates themselves, not against the middle of the
    // interval: Newcombe's is a hybrid-score method and its interval is not
    // symmetric about the point, so a midpoint check would be testing the
    // wrong property (and did, on the first attempt).
    expect(s.gap).toBeCloseTo(s.winRate - s.drift, 6)
  })

  it('keeps the honest interval containing the point estimate', () => {
    const s = series(100, 70)
    expect(s.gapLow).toBeLessThanOrEqual(s.gap)
    expect(s.gapHigh).toBeGreaterThanOrEqual(s.gap)
  })

  it('decides distinguishable on the honest interval, not the flattering one', () => {
    const s = series(100, 70)
    expect(s.distinguishable).toBe(s.gapLow > 0 || s.gapHigh < 0)
  })
})
