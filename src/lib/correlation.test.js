import { describe, it, expect } from 'vitest'
import {
  returnsByDate,
  correlation,
  correlationMatrix,
  pairLookup,
  pairsWithin,
  effectiveBets,
  clusters,
  MIN_OVERLAP,
  SAME_BET,
} from './correlation.js'

// Business days from a fixed start, so a synthetic series has the same shape
// of calendar a real equity does.
function weekdays(n, from = '2024-01-01') {
  const out = []
  const d = new Date(`${from}T00:00:00Z`)
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

// Every calendar day — the crypto case.
function alldays(n, from = '2024-01-01') {
  const out = []
  const d = new Date(`${from}T00:00:00Z`)
  while (out.length < n) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function barsFrom(dates, closes) {
  return dates.map((date, i) => ({ date, open: closes[i], high: closes[i], low: closes[i], close: closes[i], volume: 1 }))
}

// A deterministic pseudo-random walk, so the tests do not depend on Math.random.
function walk(n, seed = 1, drift = 0) {
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648 - 0.5
  }
  const closes = [100]
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * (1 + drift + rand() * 0.04))
  return { closes, rand }
}

describe('returnsByDate', () => {
  it('keys close-to-close returns by the date they landed on', () => {
    const bars = barsFrom(weekdays(4), [100, 110, 99, 99])
    const r = returnsByDate(bars)
    const dates = weekdays(4)
    expect(r.has(dates[0])).toBe(false) // no prior close to measure against
    expect(r.get(dates[1])).toBeCloseTo(0.1, 10)
    expect(r.get(dates[2])).toBeCloseTo(-0.1, 10)
    expect(r.get(dates[3])).toBe(0)
  })

  it('honours the lookback window', () => {
    const bars = barsFrom(weekdays(300), walk(300).closes)
    expect(returnsByDate(bars, 50).size).toBe(50)
  })
})

describe('correlation', () => {
  it('is 1 for a series against itself and -1 against its mirror', () => {
    const dates = weekdays(120)
    const { closes } = walk(120)
    const a = returnsByDate(barsFrom(dates, closes))
    // Mirror the returns rather than the prices: negating a price series does
    // not negate its returns.
    const mirrored = new Map([...a].map(([d, v]) => [d, -v]))
    expect(correlation(a, a)).toBeCloseTo(1, 10)
    expect(correlation(a, mirrored)).toBeCloseTo(-1, 10)
  })

  it('returns null rather than a number when the overlap is too thin', () => {
    const dates = weekdays(MIN_OVERLAP)
    const { closes } = walk(MIN_OVERLAP)
    const a = returnsByDate(barsFrom(dates, closes))
    // MIN_OVERLAP bars produce MIN_OVERLAP - 1 returns: one short.
    expect(correlation(a, a)).toBeNull()
  })

  it('returns null for a series that never moved instead of calling it zero', () => {
    const dates = weekdays(120)
    const flat = returnsByDate(barsFrom(dates, dates.map(() => 100)))
    const moving = returnsByDate(barsFrom(dates, walk(120).closes))
    expect(correlation(flat, moving)).toBeNull()
  })

  // The reason returns are keyed by date at all. Comparing by array position
  // would slide a weekend crypto move against a weekday equity move and keep
  // sliding, producing a plausible-looking number measured on mismatched days.
  it('pairs a 7-day instrument with a 5-day one on the dates they share', () => {
    const cryptoDates = alldays(200)
    const { closes } = walk(200, 7)
    const crypto = barsFrom(cryptoDates, closes)
    // An equity whose closes are the crypto closes on the days it traded — so
    // aligned by date the two are the same series, and aligned by index they
    // are not.
    const equityDates = cryptoDates.filter((d) => {
      const day = new Date(`${d}T00:00:00Z`).getUTCDay()
      return day !== 0 && day !== 6
    })
    const byDate = new Map(cryptoDates.map((d, i) => [d, closes[i]]))
    const equity = barsFrom(equityDates, equityDates.map((d) => byDate.get(d)))

    const r = correlation(returnsByDate(crypto, 400), returnsByDate(equity, 400))
    // Not 1: the equity's Monday return spans the weekend while the crypto
    // pair's covers Sunday to Monday only. Strongly positive is the honest
    // answer, and it is measured on genuinely shared dates.
    expect(r).toBeGreaterThan(0.5)
    expect(r).toBeLessThanOrEqual(1)
  })
})

describe('correlationMatrix', () => {
  const dates = weekdays(200)
  const bars = {
    AAA: barsFrom(dates, walk(200, 1).closes),
    BBB: barsFrom(dates, walk(200, 2).closes),
    CCC: barsFrom(dates, walk(200, 3).closes),
  }

  it('stores only the lower triangle', () => {
    const m = correlationMatrix(bars, ['AAA', 'BBB', 'CCC'])
    expect(m.symbols).toEqual(['AAA', 'BBB', 'CCC'])
    expect(m.pairs).toHaveLength(3)
  })

  it('drops symbols it has no bars for rather than emitting holes', () => {
    const m = correlationMatrix(bars, ['AAA', 'ZZZ', 'BBB'])
    expect(m.symbols).toEqual(['AAA', 'BBB'])
    expect(m.pairs).toHaveLength(1)
  })

  it('reads back symmetrically, and 1 on the diagonal', () => {
    const m = correlationMatrix(bars, ['AAA', 'BBB', 'CCC'])
    const at = pairLookup(m)
    expect(at('AAA', 'CCC')).toBe(at('CCC', 'AAA'))
    expect(at('BBB', 'BBB')).toBe(1)
    expect(at('AAA', 'ZZZ')).toBeNull()
  })

  it('lists the pairs within a subset strongest first', () => {
    const m = correlationMatrix(bars, ['AAA', 'BBB', 'CCC'])
    const ps = pairsWithin(m, ['AAA', 'BBB', 'CCC'])
    expect(ps).toHaveLength(3)
    for (let i = 1; i < ps.length; i++) expect(ps[i - 1].r).toBeGreaterThanOrEqual(ps[i].r)
  })
})

describe('effectiveBets', () => {
  it('counts uncorrelated positions as themselves', () => {
    expect(effectiveBets([0, 0, 0], 3)).toBeCloseTo(3, 10)
  })

  it('collapses perfectly correlated positions to one', () => {
    expect(effectiveBets([1, 1, 1], 3)).toBeCloseTo(1, 10)
  })

  // The number the whole panel exists to produce: six names that mostly move
  // together are not six bets.
  it('reports a tightly correlated basket as a small number of bets', () => {
    const n = 6
    const rs = Array((n * (n - 1)) / 2).fill(0.8)
    const k = effectiveBets(rs, n)
    expect(k).toBeGreaterThan(1)
    expect(k).toBeLessThan(1.5)
  })

  it('never claims more independence than there are positions', () => {
    expect(effectiveBets([-0.9, -0.9, -0.9], 3)).toBeLessThanOrEqual(3)
    expect(effectiveBets([-0.4], 2)).toBeLessThanOrEqual(2)
  })

  it('falls monotonically as correlation rises', () => {
    const n = 5
    const pairs = (n * (n - 1)) / 2
    const ks = [0, 0.25, 0.5, 0.75, 1].map((r) => effectiveBets(Array(pairs).fill(r), n))
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeLessThan(ks[i - 1])
  })

  it('has nothing to say about a single position, or about no data', () => {
    expect(effectiveBets([], 1)).toBe(1)
    expect(effectiveBets([null, null], 3)).toBeNull()
  })
})

describe('clusters', () => {
  const dates = weekdays(200)
  // Two blocks: AAA/BBB share a driver, CCC/DDD share a different one, and the
  // blocks are independent of each other.
  const driver1 = walk(200, 11).closes
  const driver2 = walk(200, 22).closes
  const jitter = (closes, seed) => {
    const { rand } = walk(2, seed)
    return closes.map((c) => c * (1 + rand() * 0.002))
  }
  const bars = {
    AAA: barsFrom(dates, driver1),
    BBB: barsFrom(dates, jitter(driver1, 5)),
    CCC: barsFrom(dates, driver2),
    DDD: barsFrom(dates, jitter(driver2, 9)),
  }
  const m = correlationMatrix(bars, ['AAA', 'BBB', 'CCC', 'DDD'])

  it('groups names that move together and keeps unrelated blocks apart', () => {
    const cs = clusters(m, ['AAA', 'BBB', 'CCC', 'DDD'])
    expect(cs).toHaveLength(2)
    for (const c of cs) {
      expect(c.members).toHaveLength(2)
      expect(c.meanCorrelation).toBeGreaterThanOrEqual(SAME_BET)
    }
  })

  it('leaves a lone name as a group of one with no internal correlation', () => {
    const cs = clusters(m, ['AAA'])
    expect(cs).toEqual([{ members: ['AAA'], meanCorrelation: null }])
  })

  it('reports every held name exactly once', () => {
    const held = ['AAA', 'BBB', 'CCC', 'DDD']
    const flat = clusters(m, held).flatMap((c) => c.members)
    expect(flat.sort()).toEqual([...held].sort())
  })

  // Average linkage, not single: a chain of individually weak links must not
  // merge two blocks that are not correlated with each other.
  it('does not chain unrelated groups together through one strong pair', () => {
    const cs = clusters(m, ['AAA', 'BBB', 'CCC', 'DDD'], 0.4)
    expect(cs.length).toBeGreaterThan(1)
  })

  it('puts the largest group first', () => {
    const cs = clusters(m, ['AAA', 'BBB', 'CCC', 'DDD'], 0.0)
    expect(cs[0].members.length).toBeGreaterThanOrEqual(cs.at(-1).members.length)
  })
})
