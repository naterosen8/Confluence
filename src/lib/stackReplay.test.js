import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { yearsAvailable, replaySchedule, recentStack, everyStart, stackRead } from './stackReplay.js'

// Bars on consecutive calendar days from `start`, one close per entry.
function daily(closes, start = '2024-01-01') {
  const t0 = Date.parse(`${start}T00:00:00Z`)
  return closes.map((close, i) => ({ date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10), close }))
}

// Tested against hand arithmetic, never against the implementation: units
// bought are amount / close at each fill, value is units × the last close.
describe('replaySchedule', () => {
  it('matches the arithmetic for two fills at different prices', () => {
    // Fills on day 0 at 1 and day 7 at 2: 10 + 5 units, worth 15 × 2 = 30.
    const bars = daily([1, 1, 1, 1, 1, 1, 1, 2, 2])
    const r = replaySchedule(bars, 0, bars.length - 1, 10)
    expect(r.fills).toBe(2)
    expect(r.invested).toBe(20)
    expect(r.value).toBeCloseTo(30)
    expect(r.changePct).toBeCloseTo(50)
  })

  it('reports the low relative to what had gone in by then', () => {
    // Day 0 at 10 (1 unit). Day 3 at 5: worth 5 against 10, −50%.
    const bars = daily([10, 10, 10, 5, 10])
    const r = replaySchedule(bars, 0, bars.length - 1, 10)
    expect(r.low.gapPct).toBeCloseTo(-50)
    expect(r.low.date).toBe(bars[3].date)
    expect(r.underwaterPct).toBeCloseTo(20)
  })

  it('fills on the next session after a gap without drifting the schedule', () => {
    // Mondays 2024-01-01, -08, -15. The -08 session is missing, so that fill
    // lands on -09; the next one is still -15, not -16.
    const bars = ['2024-01-01', '2024-01-02', '2024-01-09', '2024-01-15'].map((date) => ({ date, close: 1 }))
    const r = replaySchedule(bars, 0, bars.length - 1, 1)
    expect(r.fills).toBe(3)
    expect(r.series.map((s) => s.invested)).toEqual([1, 1, 2, 3])
  })

  it('a flat price is worth exactly what went in', () => {
    const r = replaySchedule(daily(Array(60).fill(7)), 0, 59, 5)
    expect(r.value).toBeCloseTo(r.invested)
    expect(r.underwaterPct).toBe(0)
  })
})

describe('windows', () => {
  it('only offers years the history actually reaches back to', () => {
    expect(yearsAvailable(daily(Array(365).fill(1)))).toBe(0)
    expect(yearsAvailable(daily(Array(367).fill(1)))).toBe(1)
    expect(recentStack({ bars: daily(Array(367).fill(1)), amount: 5, years: 2 })).toBeNull()
  })

  it('counts separate windows, not start dates', () => {
    const bars = daily(Array(2 * 366 + 10).fill(1))
    const s = everyStart({ bars, amount: 5, years: 1 })
    expect(s.starts).toBeGreaterThan(300)
    expect(s.separateWindows).toBe(2)
  })
})

// The same guard brief.test.js and validation.test.js keep: no assembled
// sentence acquires directional language, for any ticker the site tracks.
describe('stackRead across every committed ticker', () => {
  const dir = path.resolve(new URL('../../public/bars', import.meta.url).pathname)
  const banned = /\b(buy|sell|should|we recommend|go long|short it|worth taking|opportunity|start now|set up)\b/i
  for (const file of fs.readdirSync(dir)) {
    const { symbol, bars } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    it(symbol, () => {
      const max = yearsAvailable(bars)
      for (let years = 1; years <= max; years++) {
        const recent = recentStack({ bars, amount: 5, years })
        const spread = everyStart({ bars, amount: 5, years })
        const read = stackRead({ symbol, years, amount: 5, recent, spread })
        for (const text of Object.values(read)) {
          expect(text).not.toMatch(banned)
          expect(text).not.toMatch(/NaN|undefined|Infinity/)
        }
      }
    })
  }
})
