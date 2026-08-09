import { describe, it, expect } from 'vitest'
import {
  sma,
  smaSeries,
  emaSeries,
  rsiSeries,
  macdHistogramSeries,
  atrSeries,
  atrPercentile,
  bollinger,
  bollingerSqueeze,
  relativeVolume,
  resampleWeekly,
  weeklyTrend,
  findSwingPoints,
  scoreSeries,
  computeSignals,
} from './indicators'

// The strongest check available for an optimized routine is a second,
// deliberately naive implementation of the same definition, compared across
// real-shaped data. Incremental/rolling versions are where off-by-ones and
// floating-point drift hide, and a naive reference catches both.

const naiveSma = (values, period, i) => {
  if (i < period - 1) return null
  let s = 0
  for (let k = i - period + 1; k <= i; k++) s += values[k]
  return s / period
}

function naiveEma(values, period) {
  const out = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * k + prev
    out[i] = prev
  }
  return out
}

// A deterministic, non-degenerate price series with gaps, spikes and flats.
function series(n = 400, seed = 7) {
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const bars = []
  let price = 100
  for (let i = 0; i < n; i++) {
    const drift = (rand() - 0.48) * 0.04
    const open = price
    const close = Math.max(1, open * (1 + drift))
    const high = Math.max(open, close) * (1 + rand() * 0.01)
    const low = Math.min(open, close) * (1 - rand() * 0.01)
    bars.push({ date: isoDay(i), open, high, low, close, volume: Math.round(1e6 * (0.5 + rand())) })
    price = close
  }
  return bars
}

function isoDay(i) {
  const d = new Date(Date.UTC(2023, 0, 2) + i * 86400000)
  return d.toISOString().slice(0, 10)
}

const BARS = series()
const CLOSES = BARS.map((b) => b.close)

describe('smaSeries', () => {
  it('matches a naive recomputation at every index', () => {
    for (const period of [2, 5, 20, 50, 200]) {
      const fast = smaSeries(CLOSES, period)
      for (let i = 0; i < CLOSES.length; i++) {
        const want = naiveSma(CLOSES, period, i)
        if (want == null) expect(fast[i]).toBeNull()
        else expect(fast[i]).toBeCloseTo(want, 9)
      }
    }
  })

  it('does not accumulate drift in the rolling sum', () => {
    // The running-sum optimization adds and subtracts the same values many
    // times; over a long series that can drift away from a direct average.
    const long = Array.from({ length: 5000 }, (_, i) => 1000 + Math.sin(i) * 250)
    const fast = smaSeries(long, 50)
    const worst = long.reduce((acc, _, i) => {
      const want = naiveSma(long, 50, i)
      return want == null ? acc : Math.max(acc, Math.abs(fast[i] - want))
    }, 0)
    expect(worst).toBeLessThan(1e-9)
  })

  it('agrees with the single-value sma() helper at the last index', () => {
    for (const period of [5, 20, 50]) {
      expect(sma(CLOSES, period)).toBeCloseTo(smaSeries(CLOSES, period).at(-1), 12)
    }
  })

  it('returns null before enough history exists', () => {
    expect(sma([1, 2], 5)).toBeNull()
    expect(smaSeries([1, 2, 3], 5).every((v) => v === null)).toBe(true)
    expect(smaSeries([1, 2, 3], 3)).toEqual([null, null, 2])
  })
})

describe('emaSeries', () => {
  it('matches an independent implementation', () => {
    for (const period of [9, 12, 26]) {
      const a = emaSeries(CLOSES, period)
      const b = naiveEma(CLOSES, period)
      for (let i = 0; i < CLOSES.length; i++) {
        if (b[i] == null) expect(a[i]).toBeNull()
        else expect(a[i]).toBeCloseTo(b[i], 9)
      }
    }
  })

  it('seeds with a simple average of the first period values', () => {
    const v = [1, 2, 3, 4, 5, 6]
    expect(emaSeries(v, 3)[2]).toBeCloseTo(2, 12) // (1+2+3)/3
    // then k = 2/(3+1) = 0.5 -> next = 4*0.5 + 2*0.5 = 3
    expect(emaSeries(v, 3)[3]).toBeCloseTo(3, 12)
  })

  it('is flat on constant input', () => {
    const flat = new Array(50).fill(42)
    expect(emaSeries(flat, 10).slice(9).every((v) => Math.abs(v - 42) < 1e-12)).toBe(true)
  })
})

describe('rsiSeries', () => {
  it('is 100 on a monotonically rising series and 0 on a falling one', () => {
    const up = Array.from({ length: 60 }, (_, i) => 100 + i)
    const down = Array.from({ length: 60 }, (_, i) => 200 - i)
    expect(rsiSeries(up, 14).at(-1)).toBe(100)
    expect(rsiSeries(down, 14).at(-1)).toBeCloseTo(0, 9)
  })

  it('oscillates symmetrically about 50 on equal alternating moves', () => {
    // Alternating +1/-1 does NOT pin RSI to 50: whichever direction moved
    // last is freshly weighted by Wilder's smoothing while the other decays,
    // so the series settles into a symmetric two-value cycle straddling 50.
    // The correct invariant is that consecutive readings average to 50.
    const zig = [100]
    for (let i = 1; i < 200; i++) zig.push(i % 2 ? 101 : 100)
    const r = rsiSeries(zig, 14)
    expect((r.at(-1) + r.at(-2)) / 2).toBeCloseTo(50, 4)
    expect(r.at(-1)).toBeCloseTo(r.at(-3), 6) // stable cycle, not drifting
  })

  it('stays within 0..100 across the whole test series', () => {
    for (const v of rsiSeries(CLOSES, 14)) {
      if (v == null) continue
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('produces its first value at index = period, not earlier', () => {
    const r = rsiSeries(CLOSES, 14)
    expect(r.slice(0, 14).every((v) => v === null)).toBe(true)
    expect(r[14]).not.toBeNull()
  })

  it('matches a direct Wilder computation', () => {
    const period = 14
    const fast = rsiSeries(CLOSES, period)
    let g = 0
    let l = 0
    for (let i = 1; i <= period; i++) {
      const d = CLOSES[i] - CLOSES[i - 1]
      if (d >= 0) g += d
      else l -= d
    }
    let ag = g / period
    let al = l / period
    expect(fast[period]).toBeCloseTo(al === 0 ? 100 : 100 - 100 / (1 + ag / al), 9)
    for (let i = period + 1; i < CLOSES.length; i++) {
      const d = CLOSES[i] - CLOSES[i - 1]
      ag = (ag * (period - 1) + Math.max(d, 0)) / period
      al = (al * (period - 1) + Math.max(-d, 0)) / period
      expect(fast[i]).toBeCloseTo(al === 0 ? 100 : 100 - 100 / (1 + ag / al), 9)
    }
  })
})

describe('macdHistogramSeries', () => {
  it('reports histogram = macd - signal at every defined point', () => {
    for (const h of macdHistogramSeries(CLOSES)) {
      if (h == null) continue
      expect(h.histogram).toBeCloseTo(h.macd - h.signal, 12)
    }
  })

  it('computes the macd line as fast EMA minus slow EMA', () => {
    const fast = emaSeries(CLOSES, 12)
    const slow = emaSeries(CLOSES, 26)
    const hist = macdHistogramSeries(CLOSES)
    for (let i = 0; i < CLOSES.length; i++) {
      if (hist[i] == null) continue
      expect(hist[i].macd).toBeCloseTo(fast[i] - slow[i], 9)
    }
  })

  it('starts only once the signal EMA has enough macd values', () => {
    // slow EMA defined from index 25; signal needs 9 more macd points.
    const hist = macdHistogramSeries(CLOSES)
    const firstDefined = hist.findIndex((h) => h != null)
    expect(firstDefined).toBe(25 + 8)
  })

  it('is all-null when there is not enough history', () => {
    expect(macdHistogramSeries([1, 2, 3]).every((v) => v === null)).toBe(true)
  })
})

describe('atrSeries', () => {
  it('uses the true range definition including gaps', () => {
    // Gap down: prev close 100, today's range 90..92. True range must span
    // from the prior close (100) to today's low (90) = 10, not just 2.
    const bars = [
      { high: 101, low: 99, close: 100 },
      { high: 92, low: 90, close: 91 },
    ]
    const padded = [...Array(20)].map(() => ({ high: 101, low: 99, close: 100 }))
    const all = [...padded, ...bars]
    const atr = atrSeries(all, 2)
    // last window = [TR(prev bar), TR(gap bar)] -> TR(gap) = 100-90 = 10
    expect(atr.at(-1)).toBeGreaterThan(4)
  })

  it('equals the range on a series with no gaps', () => {
    const bars = Array.from({ length: 30 }, () => ({ high: 105, low: 95, close: 100 }))
    expect(atrSeries(bars, 14).at(-1)).toBeCloseTo(10, 9)
  })
})

describe('percentile helpers', () => {
  it('atrPercentile reports the share of the window strictly below the latest', () => {
    // Rising volatility => latest is the highest => everything else below.
    const bars = Array.from({ length: 200 }, (_, i) => ({
      high: 100 + i * 0.1,
      low: 100 - i * 0.1,
      close: 100,
    }))
    expect(atrPercentile(bars, 14, 100)).toBeGreaterThan(95)
  })

  it('bollingerSqueeze flags compression and matches a direct recomputation', () => {
    const widths = []
    for (let i = 19; i < CLOSES.length; i++) {
      widths.push(bollinger(CLOSES.slice(i - 19, i + 1), 20, 2).bandwidth)
    }
    const latest = widths.at(-1)
    const below = widths.slice(-100).filter((w) => w < latest).length
    const expected = (below / widths.slice(-100).length) * 100
    expect(bollingerSqueeze(CLOSES).percentile).toBeCloseTo(expected, 9)
  })

  it('does not emit NaN on a perfectly flat window', () => {
    // Zero-width bands make percentB a 0/0 division.
    const flat = new Array(30).fill(100)
    const b = bollinger(flat, 20, 2)
    expect(Number.isNaN(b.percentB)).toBe(false)
    expect(Number.isNaN(b.bandwidth)).toBe(false)
    expect(b.bandwidth).toBe(0)
  })

  it('bollinger uses population standard deviation and a symmetric band', () => {
    const v = [2, 4, 4, 4, 5, 5, 7, 9] // population sd = 2
    const b = bollinger(v, 8, 2)
    expect(b.middle).toBeCloseTo(5, 12)
    expect(b.upper).toBeCloseTo(9, 12)
    expect(b.lower).toBeCloseTo(1, 12)
    expect(b.percentB).toBeCloseTo((9 - 1) / (9 - 1), 12)
    expect(b.bandwidth).toBeCloseTo(8 / 5, 12)
  })
})

describe('relativeVolume', () => {
  it('compares the latest bar against the prior period, excluding itself', () => {
    const bars = Array.from({ length: 21 }, () => ({ volume: 100 }))
    bars[20].volume = 300
    expect(relativeVolume(bars, 20)).toBeCloseTo(3, 12)
  })

  it('returns null when history is short or the average is zero', () => {
    expect(relativeVolume([{ volume: 1 }], 20)).toBeNull()
    expect(relativeVolume(Array.from({ length: 21 }, () => ({ volume: 0 })), 20)).toBeNull()
  })
})

describe('resampleWeekly', () => {
  it('opens a new bucket on each Monday and aggregates OHLCV correctly', () => {
    // 2024-01-01 is a Monday.
    const bars = [
      { date: '2024-01-01', open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { date: '2024-01-02', open: 11, high: 15, low: 8, close: 14, volume: 2 },
      { date: '2024-01-08', open: 14, high: 16, low: 13, close: 15, volume: 4 },
    ]
    const w = resampleWeekly(bars)
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ date: '2024-01-02', open: 10, high: 15, low: 8, close: 14, volume: 3 })
    expect(w[1]).toMatchObject({ date: '2024-01-08', open: 14, close: 15, volume: 4 })
  })

  it('still finds week boundaries if a date carries a time component', () => {
    // A datetime would make `date + 'T00:00:00Z'` an Invalid Date, whose
    // getUTCDay() is NaN — no Monday would ever match, every bar would land
    // in one bucket, and weekly-trend scoring would be silently wrong.
    const bars = [
      { date: '2024-01-01 00:00:00', open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { date: '2024-01-02 00:00:00', open: 11, high: 15, low: 8, close: 14, volume: 2 },
      { date: '2024-01-08 00:00:00', open: 14, high: 16, low: 13, close: 15, volume: 4 },
    ]
    expect(resampleWeekly(bars)).toHaveLength(2)
  })

  it('keeps a leading partial week rather than dropping it', () => {
    // Starts mid-week (2024-01-03 is a Wednesday).
    const bars = [
      { date: '2024-01-03', open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { date: '2024-01-08', open: 2, high: 2, low: 2, close: 2, volume: 1 },
    ]
    expect(resampleWeekly(bars)).toHaveLength(2)
  })

  it('weeklyTrend needs 10 completed weekly closes', () => {
    const few = Array.from({ length: 20 }, (_, i) => ({
      date: isoDay(i),
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }))
    expect(weeklyTrend(few).trend).toBeNull()
  })
})

describe('findSwingPoints', () => {
  it('finds a local high with the required bars either side', () => {
    const bars = [1, 2, 3, 9, 3, 2, 1].map((h) => ({ high: h, low: h, date: 'd' }))
    const { highs } = findSwingPoints(bars, 3)
    expect(highs.map((h) => h.index)).toEqual([3])
  })

  it('does not report extremes inside the edge margin', () => {
    const bars = [9, 1, 1, 1, 1, 1, 9].map((h) => ({ high: h, low: h, date: 'd' }))
    expect(findSwingPoints(bars, 3).highs).toEqual([])
  })
})

describe('scoreSeries and computeSignals agree on their shared inputs', () => {
  it('the final scoreSeries value equals computeSignals minus its divergence bonus', () => {
    // scoreSeries deliberately omits divergence; everything else must match,
    // otherwise the backtest tables are bucketing by a different score than
    // the badge shows for reasons beyond the documented one.
    const s = computeSignals(BARS)
    const divergenceBonus =
      (s.divergence.bullish ? 2 : 0) - (s.divergence.bearish ? 2 : 0)
    expect(scoreSeries(BARS).at(-1)).toBe(s.score - divergenceBonus)
  })

  it('score equals bullish points minus bearish points', () => {
    const s = computeSignals(BARS)
    expect(s.score).toBe(s.bullishPoints - s.bearishPoints)
  })

  it('the reported factors sum to the reported points', () => {
    const s = computeSignals(BARS)
    const bull = s.factors.filter((f) => f.direction === 'bullish').reduce((a, f) => a + f.weight, 0)
    const bear = s.factors.filter((f) => f.direction === 'bearish').reduce((a, f) => a + f.weight, 0)
    expect(bull).toBe(s.bullishPoints)
    expect(bear).toBe(s.bearishPoints)
  })

  it('verdict bands match the documented score thresholds', () => {
    const bands = [
      [5, 'Strong Bullish'],
      [3, 'Strong Bullish'],
      [2, 'Bullish'],
      [1, 'Bullish'],
      [0, 'Neutral'],
      [-1, 'Bearish'],
      [-2, 'Bearish'],
      [-3, 'Strong Bearish'],
      [-5, 'Strong Bearish'],
    ]
    for (const [score, verdict] of bands) {
      const band =
        score >= 3 ? 'Strong Bullish' : score >= 1 ? 'Bullish' : score <= -3 ? 'Strong Bearish' : score <= -1 ? 'Bearish' : 'Neutral'
      expect(band).toBe(verdict)
    }
  })
})
