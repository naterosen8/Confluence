import { describe, it, expect } from 'vitest'
import { entryBarIndex, utcToday } from './trackRecord.js'

const bars = [
  { date: '2026-08-07', close: 100 },
  { date: '2026-08-08', close: 101 },
  { date: '2026-08-09', close: 102 },
]

describe('entryBarIndex', () => {
  it('uses the last bar for equities even when it is dated today', () => {
    // The US session has closed by the time the job runs, so today's bar is
    // final. Stepping back here would delay every equity entry by a day for
    // no reason.
    expect(entryBarIndex({ bars, kind: 'stock', today: '2026-08-09' })).toBe(2)
    expect(entryBarIndex({ bars, kind: 'etf', today: '2026-08-09' })).toBe(2)
    expect(entryBarIndex({ bars, kind: 'macro', today: '2026-08-09' })).toBe(2)
  })

  it('steps back for a crypto bar dated today, which is still forming', () => {
    // This is the case that logged BTC/USD at 65234.61 on a bar that settled
    // at 64901.59 — a provisional close, and a verdict computed from a
    // partial session.
    expect(entryBarIndex({ bars, kind: 'crypto', today: '2026-08-09' })).toBe(1)
  })

  it('uses the last crypto bar once it is no longer today', () => {
    expect(entryBarIndex({ bars, kind: 'crypto', today: '2026-08-10' })).toBe(2)
  })

  it('reports nothing usable rather than an out-of-range index', () => {
    expect(entryBarIndex({ bars: [], kind: 'stock', today: '2026-08-09' })).toBe(-1)
    expect(entryBarIndex({ bars: undefined, kind: 'stock', today: '2026-08-09' })).toBe(-1)
    // A single crypto bar dated today leaves no completed bar behind it.
    expect(entryBarIndex({ bars: [bars[2]], kind: 'crypto', today: '2026-08-09' })).toBe(-1)
  })
})

describe('utcToday', () => {
  it('is the UTC calendar day, not the local one', () => {
    // 21:30 UTC is when the job runs; in US timezones that is still the
    // previous local day, and using the local date would stamp entries a day
    // behind the bars they came from.
    expect(utcToday(new Date('2026-08-09T21:30:00Z'))).toBe('2026-08-09')
    expect(utcToday(new Date('2026-08-09T23:59:59Z'))).toBe('2026-08-09')
    expect(utcToday(new Date('2026-08-10T00:00:00Z'))).toBe('2026-08-10')
  })
})
