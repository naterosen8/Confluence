import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { summarizeTrackRecord, summarize, baselineOf, RECENT_LIMIT } from './trackRecordSummary.js'

const entry = (date, symbol, verdict, returnPct, correct) => ({
  date, symbol, verdict, price: 100,
  outcome: correct === null && returnPct === null ? null : { resolvedDate: date, exitPrice: 100 + returnPct, returnPct, correct },
})

describe('summarizeTrackRecord', () => {
  const log = [
    entry('2026-01-01', 'AAPL', 'aligned-up', 2, true),
    entry('2026-01-02', 'MSFT', 'aligned-up', -1, false),
    entry('2026-01-03', 'SPY', 'aligned-down', -3, true),
    { date: '2026-01-04', symbol: 'NVDA', verdict: 'leaning-up', price: 100 },
  ]

  it('separates resolved from pending', () => {
    const s = summarizeTrackRecord(log)
    expect(s.resolvedCount).toBe(3)
    expect(s.pendingCount).toBe(1)
  })

  it('scores by band direction, including pre-rename labels', () => {
    const s = summarizeTrackRecord([...log, entry('2026-01-05', 'QQQ', 'Strong Bullish', 1, true)])
    // The legacy label still resolves to an upward lean.
    expect(s.up.total).toBe(3)
    expect(s.down.total).toBe(1)
  })

  it('reports the drift baseline over the same windows', () => {
    const s = summarizeTrackRecord(log)
    // 1 of 3 resolved windows rose; 2 of 3 fell.
    expect(s.upBaseline).toBeCloseTo(33.33, 1)
    expect(s.downBaseline).toBeCloseTo(66.67, 1)
  })

  it('orders recent calls newest first', () => {
    const s = summarizeTrackRecord(log)
    expect(s.recent.map((e) => e.date)).toEqual(['2026-01-03', '2026-01-02', '2026-01-01'])
  })

  it('bounds the payload and says when it truncated', () => {
    // The whole point: the page's download must not grow with the log. At 500
    // tickers this log gains ~400 rows a day.
    const many = Array.from({ length: RECENT_LIMIT + 50 }, (_, i) =>
      entry(`2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, `T${i}`, 'aligned-up', 1, true)
    )
    const s = summarizeTrackRecord(many)
    expect(s.recent).toHaveLength(RECENT_LIMIT)
    expect(s.truncated).toBe(true)
    expect(s.resolvedCount).toBe(RECENT_LIMIT + 50)
    // Totals still describe everything, not just the slice shown.
    expect(s.overall.total).toBe(RECENT_LIMIT + 50)
  })

  it('survives an empty or missing log rather than throwing', () => {
    for (const input of [[], null, undefined]) {
      const s = summarizeTrackRecord(input)
      expect(s.resolvedCount).toBe(0)
      expect(s.overall).toBeNull()
      expect(s.recent).toEqual([])
    }
  })
})

describe('the committed summary matches the committed log', () => {
  it('agrees with recomputing it from the raw log', () => {
    const root = path.resolve(new URL('../..', import.meta.url).pathname)
    const log = JSON.parse(fs.readFileSync(path.join(root, 'public/track-record.json'), 'utf8'))
    const shipped = JSON.parse(fs.readFileSync(path.join(root, 'public/track-record-summary.json'), 'utf8'))
    const fresh = summarizeTrackRecord(log)
    // A summary that drifts from its own log would be the worst kind of wrong
    // here: the page would report a hit rate the audit trail contradicts.
    expect(shipped.resolvedCount).toBe(fresh.resolvedCount)
    expect(shipped.pendingCount).toBe(fresh.pendingCount)
    expect(shipped.overall).toEqual(fresh.overall)
    expect(shipped.recent.length).toBe(fresh.recent.length)
  })
})

describe('summarize and baselineOf', () => {
  it('ignores calls whose outcome could not be decided', () => {
    const withNull = [entry('2026-01-01', 'A', 'aligned-up', 1, true), { date: '2026-01-02', symbol: 'B', verdict: 'split', price: 1, outcome: { returnPct: 0, correct: null } }]
    expect(summarize(withNull).total).toBe(1)
    expect(baselineOf(withNull, 'up')).toBe(100)
  })
})
