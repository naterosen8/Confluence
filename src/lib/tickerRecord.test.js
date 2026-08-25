import { describe, it, expect } from 'vitest'
import { bySymbol, symbolRecord, tickerRecordRead, PER_SYMBOL_LIMIT, MIN_FOR_RATE } from './tickerRecord.js'

const call = (symbol, date, { verdict = 'leaning-up', correct = true, returnPct = 1, voided = null, pending = false } = {}) => ({
  symbol,
  date,
  verdict,
  score: 2,
  price: 100,
  ...(voided ? { voided } : {}),
  ...(pending
    ? {}
    : { outcome: { resolvedDate: date, exitPrice: 100 * (1 + returnPct / 100), returnPct, correct } }),
})

const day = (n) => `2026-01-${String(n).padStart(2, '0')}`

describe('bySymbol', () => {
  const log = [
    call('AAA', day(1)),
    call('AAA', day(2), { correct: false, returnPct: -2 }),
    call('AAA', day(3), { pending: true }),
    call('AAA', day(4), { voided: { reason: 'rescored-to-split' } }),
    call('BBB', day(1)),
  ]

  it('groups by symbol and counts each state separately', () => {
    const idx = bySymbol(log)
    expect(idx.AAA.resolvedCount).toBe(2)
    expect(idx.AAA.pendingCount).toBe(1)
    expect(idx.AAA.voidedCount).toBe(1)
    expect(idx.AAA.hits).toBe(1)
  })

  // A retracted call was never a call anybody made, and it stays out of every
  // statistic here exactly as it does on the aggregate page.
  it('keeps retracted calls out of the resolved set', () => {
    const idx = bySymbol([call('AAA', day(1), { voided: { reason: 'rescored-to-split' } })])
    expect(idx.AAA.resolvedCount).toBe(0)
    expect(idx.AAA.calls).toEqual([])
    expect(idx.AAA.voidedCount).toBe(1)
  })

  it('counts the windows price rose in, whatever the calls said', () => {
    const idx = bySymbol([
      call('AAA', day(1), { returnPct: 3 }),
      call('AAA', day(2), { returnPct: -3, correct: false }),
      call('AAA', day(3), { returnPct: 1 }),
    ])
    expect(idx.AAA.rose).toBe(2)
  })

  it('lists the newest calls first', () => {
    const idx = bySymbol([call('AAA', day(1)), call('AAA', day(5)), call('AAA', day(3))])
    expect(idx.AAA.calls.map((c) => c.date)).toEqual([day(5), day(3), day(1)])
  })

  // The log grows forever; the published index must not.
  it('caps the calls it publishes while still counting them all', () => {
    const many = Array.from({ length: 30 }, (_, i) => call('AAA', day((i % 28) + 1)))
    const idx = bySymbol(many)
    expect(idx.AAA.calls).toHaveLength(PER_SYMBOL_LIMIT)
    expect(idx.AAA.resolvedCount).toBe(30)
  })

  it('has nothing to say about an empty log', () => {
    expect(bySymbol([])).toEqual({})
    expect(bySymbol(null)).toEqual({})
  })
})

describe('symbolRecord', () => {
  const resolved = (n, hits) =>
    bySymbol(
      Array.from({ length: n }, (_, i) =>
        call('AAA', day((i % 28) + 1), { correct: i < hits, returnPct: i < hits ? 2 : -2 })
      )
    ).AAA

  // The rule the module exists for: a percentage beside a sample of three is
  // read as a percentage, and the caveat underneath does not undo that.
  it('quotes no rate below a usable sample', () => {
    const r = symbolRecord(resolved(3, 2), 'AAA')
    expect(r.rate).toBeNull()
    expect(r.enough).toBe(false)
    // The arithmetic is still available — the calls are listed and anyone can
    // count them, so hiding it while showing its inputs would be theatre.
    expect(r.rawRate).toBeCloseTo((2 / 3) * 100, 6)
  })

  it('quotes one once there is enough to quote', () => {
    const r = symbolRecord(resolved(MIN_FOR_RATE, 6), 'AAA')
    expect(r.enough).toBe(true)
    expect(r.rate).toBeCloseTo(60, 6)
    expect(r.interval.low).toBeLessThan(r.rate)
    expect(r.interval.high).toBeGreaterThan(r.rate)
  })

  it('measures against the ticker’s own drift, not a coin flip', () => {
    const r = symbolRecord(resolved(MIN_FOR_RATE, 6), 'AAA')
    // Every hit rose and every miss fell, so drift equals the hit rate here
    // and the gap is exactly zero — which is the point: a call that is only
    // right when price rises has shown nothing.
    expect(r.drift).toBeCloseTo(60, 6)
    expect(r.gap.point).toBeCloseTo(0, 6)
    expect(r.gap.distinguishable).toBe(false)
  })

  it('reports how far short of an answer the sample is', () => {
    const r = symbolRecord(resolved(4, 1), 'AAA')
    expect(r.needed).toBeGreaterThan(r.resolvedCount)
  })

  // A perfect record is where the sample-size formula degenerates, and where
  // an answer of "0 more needed" would be worst.
  it('claims no sample size for a flawless record', () => {
    expect(symbolRecord(resolved(3, 3), 'AAA').needed).toBeNull()
    expect(symbolRecord(resolved(3, 0), 'AAA').needed).toBeNull()
  })

  it('says how many calls it is not showing', () => {
    const many = Array.from({ length: 20 }, (_, i) => call('AAA', day((i % 28) + 1)))
    const r = symbolRecord(bySymbol(many).AAA, 'AAA')
    expect(r.truncated).toBe(20 - PER_SYMBOL_LIMIT)
  })

  it('has nothing to say about a symbol with no block', () => {
    expect(symbolRecord(null, 'AAA')).toBeNull()
  })
})

describe('tickerRecordRead', () => {
  const from = (entries) => symbolRecord(bySymbol(entries).AAA, 'AAA')

  it('distinguishes never called from called and waiting', () => {
    const waiting = tickerRecordRead(from([call('AAA', day(1), { pending: true })]))
    expect(waiting).toMatch(/waiting to resolve/)
    const never = tickerRecordRead(symbolRecord({ resolvedCount: 0, pendingCount: 0, voidedCount: 0, hits: 0, rose: 0, calls: [] }, 'AAA'))
    expect(never).toMatch(/has not published a call on AAA/)
    // A ticker that always read as a split has a record, not a hole.
    expect(never).toMatch(/which is itself the record/)
  })

  it('states the drift alongside the hits, never the hits alone', () => {
    const text = tickerRecordRead(from([call('AAA', day(1)), call('AAA', day(2), { correct: false, returnPct: -1 })]))
    expect(text).toMatch(/1 of 2 resolved calls/)
    expect(text).toMatch(/regardless of what the call said/)
  })

  it('says plainly that a small sample is not evidence', () => {
    const text = tickerRecordRead(from(Array.from({ length: 3 }, (_, i) => call('AAA', day(i + 1)))))
    expect(text).toMatch(/no hit rate is quoted/)
    expect(text).toMatch(/which is none/)
  })

  it('never claims a per-ticker edge from a handful of calls', () => {
    const text = tickerRecordRead(from(Array.from({ length: 4 }, (_, i) => call('AAA', day(i + 1)))))
    expect(text).not.toMatch(/\b(edge|reliable|works on|good at|accurate)\b/i)
  })

  it('has nothing to say about nothing', () => {
    expect(tickerRecordRead(null)).toBeNull()
  })
})
