import { describe, it, expect } from 'vitest'
import { lastSettledIndex, utcToday, repairUnresolved } from './trackRecord.js'

const bars = [
  { date: '2026-08-06', close: 99 },
  { date: '2026-08-07', close: 100 },
  { date: '2026-08-08', close: 101 },
  { date: '2026-08-09', close: 102 },
]

describe('lastSettledIndex', () => {
  it('never points at the last bar, which the provider is still revising', () => {
    expect(lastSettledIndex(bars)).toBe(2)
    expect(bars[lastSettledIndex(bars)].date).toBe('2026-08-08')
  })

  it('reports nothing usable rather than an out-of-range index', () => {
    expect(lastSettledIndex([])).toBe(-1)
    expect(lastSettledIndex(undefined)).toBe(-1)
    // One bar means one provisional bar and nothing settled behind it.
    expect(lastSettledIndex([bars[0]])).toBe(-1)
  })
})

describe('utcToday', () => {
  it('is the UTC calendar day, not the local one', () => {
    // 21:30 UTC is when the job runs; in US timezones that is still the
    // previous local day.
    expect(utcToday(new Date('2026-08-09T21:30:00Z'))).toBe('2026-08-09')
    expect(utcToday(new Date('2026-08-09T23:59:59Z'))).toBe('2026-08-09')
    expect(utcToday(new Date('2026-08-10T00:00:00Z'))).toBe('2026-08-10')
  })
})

describe('repairUnresolved', () => {
  const barsBySymbol = { AAPL: bars }
  const rescore = () => ({ verdict: 'leaning-up', score: 2 })

  it('corrects an unresolved price to the settled close', () => {
    const log = [{ symbol: 'AAPL', date: '2026-08-07', verdict: 'aligned-up', score: 3, price: 100.4 }]
    const out = repairUnresolved({ log, barsBySymbol, rescore })
    expect(out.log[0].price).toBe(100)
    expect(out.repaired).toEqual([
      { symbol: 'AAPL', date: '2026-08-07', from: 100.4, to: 100, verdictFrom: 'aligned-up' },
    ])
  })

  it('never touches an entry whose outcome is already settled', () => {
    // Correcting the entry price after the return was computed would rewrite
    // a measured result — the one thing this log exists not to do.
    const log = [
      {
        symbol: 'AAPL',
        date: '2026-08-07',
        verdict: 'aligned-up',
        score: 3,
        price: 100.4,
        outcome: { resolvedDate: '2026-08-09', exitPrice: 102, returnPct: 1.6, correct: true },
      },
    ]
    const out = repairUnresolved({ log, barsBySymbol, rescore })
    expect(out.repaired).toEqual([])
    expect(out.log[0].price).toBe(100.4)
  })

  it('leaves an already-agreeing entry alone', () => {
    const log = [{ symbol: 'AAPL', date: '2026-08-07', verdict: 'aligned-up', score: 3, price: 100 }]
    const out = repairUnresolved({ log, barsBySymbol, rescore })
    expect(out.repaired).toEqual([])
    expect(out.log[0].verdict).toBe('aligned-up')
  })

  it('matches by symbol and date, never by price', () => {
    // A previous repair matched on price and mapped an August 2026 entry onto
    // a November 2022 bar, collapsing the log from 33 entries to 21.
    const log = [{ symbol: 'AAPL', date: '2029-01-01', verdict: 'aligned-up', score: 3, price: 100 }]
    const out = repairUnresolved({ log, barsBySymbol, rescore })
    expect(out.repaired).toEqual([])
    expect(out.log).toHaveLength(1)
    expect(out.log[0].date).toBe('2029-01-01')
  })

  it('rescores from history truncated to the entry bar, with no look-ahead', () => {
    const seen = []
    const log = [{ symbol: 'AAPL', date: '2026-08-07', verdict: 'aligned-up', score: 3, price: 100.4 }]
    repairUnresolved({
      log,
      barsBySymbol,
      rescore: (history) => {
        seen.push(history.map((b) => b.date))
        return { verdict: 'leaning-up', score: 1 }
      },
    })
    expect(seen).toEqual([['2026-08-06', '2026-08-07']])
    expect(log[0].score).toBe(1)
    expect(log[0].verdict).toBe('leaning-up')
  })

  it('voids an entry the settled bar turns into a split, without removing it', () => {
    // A split is never logged in the first place, so leaving one live would
    // publish a call nobody made — but deleting it lets the record shrink
    // silently, which is worse. It is retracted in place instead.
    const log = [
      { symbol: 'AAPL', date: '2026-08-07', verdict: 'aligned-up', score: 3, price: 100.4 },
      { symbol: 'AAPL', date: '2026-08-08', verdict: 'aligned-up', score: 3, price: 101 },
    ]
    const out = repairUnresolved({ log, barsBySymbol, rescore: () => ({ verdict: 'split', score: 0 }) })
    expect(out.log).toHaveLength(2)
    expect(out.log.find((e) => e.date === '2026-08-07').voided?.reason).toBe('rescored-to-split')
    expect(out.repaired[0].voided).toBe(true)
  })

  it('skips a symbol with no synced bars rather than throwing', () => {
    const log = [{ symbol: 'NOPE', date: '2026-08-07', verdict: 'aligned-up', score: 3, price: 1 }]
    expect(() => repairUnresolved({ log, barsBySymbol, rescore })).not.toThrow()
    expect(repairUnresolved({ log, barsBySymbol: {}, rescore }).repaired).toEqual([])
  })
})

describe('voiding instead of deleting', () => {
  const bars = [
    { date: '2026-08-07', open: 10, high: 11, low: 9, close: 10, volume: 1e6 },
    { date: '2026-08-08', open: 10, high: 11, low: 9, close: 12, volume: 1e6 },
    { date: '2026-08-09', open: 12, high: 13, low: 11, close: 13, volume: 1e6 },
  ]

  // The behaviour this replaces deleted the row. Two published crypto calls
  // vanished that way and the only way to find out was to diff the file
  // against its own git history.
  it('keeps a retracted entry in the log rather than removing it', () => {
    const log = [{ date: '2026-08-08', symbol: 'X', verdict: 'leaning-up', score: 2, price: 99 }]
    const out = repairUnresolved({
      log,
      barsBySymbol: { X: bars },
      rescore: () => ({ verdict: 'split', score: 0 }),
      now: new Date('2026-08-20T00:00:00Z'),
    })
    expect(out.log).toHaveLength(1)
    expect(out.voided).toHaveLength(1)
    expect(out.log[0].voided).toEqual({
      reason: 'rescored-to-split',
      verdictWas: 'leaning-up',
      at: '2026-08-20',
    })
  })

  it('does not re-examine an already-voided entry', () => {
    // Otherwise a later bar revision could quietly bring a retracted call back
    // into the statistics.
    const log = [
      { date: '2026-08-08', symbol: 'X', verdict: 'leaning-up', score: 2, price: 99, voided: { reason: 'rescored-to-split', verdictWas: 'leaning-up', at: '2026-08-11' } },
    ]
    const out = repairUnresolved({ log, barsBySymbol: { X: bars }, rescore: () => ({ verdict: 'aligned-up', score: 4 }) })
    expect(out.repaired).toHaveLength(0)
    expect(out.log[0].price).toBe(99)
    expect(out.log[0].verdict).toBe('leaning-up')
  })

  it('still rescores an entry whose verdict survives', () => {
    const log = [{ date: '2026-08-08', symbol: 'X', verdict: 'leaning-up', score: 2, price: 99 }]
    const out = repairUnresolved({
      log,
      barsBySymbol: { X: bars },
      rescore: () => ({ verdict: 'aligned-up', score: 4 }),
    })
    expect(out.voided).toHaveLength(0)
    expect(out.log[0].voided).toBeUndefined()
    expect(out.log[0].price).toBe(12)
    expect(out.log[0].verdict).toBe('aligned-up')
  })

  it('never touches a settled outcome', () => {
    const log = [{ date: '2026-08-08', symbol: 'X', verdict: 'leaning-up', score: 2, price: 99, outcome: { correct: true, returnPct: 1 } }]
    const out = repairUnresolved({ log, barsBySymbol: { X: bars }, rescore: () => ({ verdict: 'split', score: 0 }) })
    expect(out.voided).toHaveLength(0)
    expect(out.log[0].price).toBe(99)
  })
})
