import { describe, it, expect } from 'vitest'
import { byEpisode, clusteredRate, overstatement, clusterRead } from './clustering.js'

const call = (date, correct) => ({ date, outcome: { correct, returnPct: correct ? 1 : -1 } })
// n calls on one date, the first `hits` of them correct.
const day = (date, n, hits) => Array.from({ length: n }, (_, i) => call(date, i < hits))

describe('byEpisode', () => {
  it('groups calls by the day they were made', () => {
    const { episodes } = byEpisode([...day('2026-01-05', 3, 2), ...day('2026-01-06', 1, 0)])
    expect(episodes).toEqual([
      { date: '2026-01-05', calls: 3, hits: 2, rate: (2 / 3) * 100 },
      { date: '2026-01-06', calls: 1, hits: 0, rate: 0 },
    ])
  })

  it('returns dates in order however the log was ordered', () => {
    const { dates } = byEpisode([...day('2026-01-09', 1, 1), ...day('2026-01-02', 1, 0)])
    expect(dates).toEqual(['2026-01-02', '2026-01-09'])
  })

  // The point of the module: overlapping forward windows are not separate
  // tests. Ten consecutive call dates held five sessions each contain about
  // two episodes, not ten.
  it('counts non-overlapping episodes rather than dates', () => {
    const consecutive = Array.from({ length: 10 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, '0')}`, 1, 1)).flat()
    const { dates, independentEpisodes } = byEpisode(consecutive, { forwardDays: 5 })
    expect(dates).toHaveLength(10)
    expect(independentEpisodes).toBeLessThan(dates.length)
    expect(independentEpisodes).toBe(2)
  })

  it('counts every date when the windows do not overlap', () => {
    const spread = [...day('2026-01-01', 1, 1), ...day('2026-01-02', 1, 1)]
    expect(byEpisode(spread, { forwardDays: 1 }).independentEpisodes).toBe(2)
  })
})

describe('clusteredRate', () => {
  // One day contributing most of the calls is exactly the shape that makes a
  // per-call interval a lie.
  const lopsided = [...day('2026-01-05', 74, 39), ...day('2026-01-06', 2, 2), ...day('2026-01-07', 4, 1)]

  it('reports the same point estimate two ways', () => {
    const r = clusteredRate(lopsided)
    expect(r.total).toBe(80)
    expect(r.days).toBe(3)
    expect(r.perCall.rate).toBeCloseTo((42 / 80) * 100, 6)
    // The per-day mean weights each day equally, so it differs from the
    // per-call rate whenever the days are different sizes. That difference is
    // the information.
    expect(r.perEpisode.rate).not.toBeCloseTo(r.perCall.rate, 3)
  })

  it('gives a wider interval per episode than per call', () => {
    const r = clusteredRate(lopsided)
    expect(r.perEpisode.high - r.perEpisode.low).toBeGreaterThan(r.perCall.high - r.perCall.low)
    expect(overstatement(r)).toBeGreaterThan(1)
  })

  it('names the day that contributed the most calls', () => {
    expect(clusteredRate(lopsided).largestDay).toMatchObject({ date: '2026-01-05', calls: 74 })
  })

  // A single day of calls cannot disagree with itself; a tight interval around
  // one number would be the most misleading thing the page could print.
  it('reports no episode interval from a single day', () => {
    const r = clusteredRate(day('2026-01-05', 50, 30))
    expect(r.days).toBe(1)
    expect(r.perEpisode).toBeNull()
    expect(overstatement(r)).toBeNull()
  })

  it('ignores calls that have not resolved', () => {
    const r = clusteredRate([...day('2026-01-05', 2, 1), { date: '2026-01-06' }, { date: '2026-01-07', outcome: { correct: null } }])
    expect(r.total).toBe(2)
    expect(r.days).toBe(1)
  })

  it('has nothing to say about an empty record', () => {
    expect(clusteredRate([])).toBeNull()
  })
})

describe('clusterRead', () => {
  const r = clusteredRate([...day('2026-01-05', 74, 39), ...day('2026-01-06', 6, 3), ...day('2026-01-07', 4, 1)])

  it('says how many days the calls were made on, not just how many there were', () => {
    expect(clusterRead(r)).toMatch(/84 resolved calls, made on 3 distinct days/)
  })

  it('names the crowded day and why it is not many tests', () => {
    expect(clusterRead(r)).toMatch(/74 of them fired on 2026-01-05 alone/)
    expect(clusterRead(r)).toMatch(/not 74 separate tests of anything/)
  })

  it('shows both intervals and says which one to believe', () => {
    const text = clusterRead(r)
    expect(text).toMatch(/Scored per call the range is/)
    expect(text).toMatch(/scored per day/)
    expect(text).toMatch(/times wider/)
    expect(text).toMatch(/The second one is the honest one/)
  })

  it('claims no measurement', () => {
    expect(clusterRead(r)).toMatch(/does not claim to have measured anything yet/)
  })

  it('has nothing to say about nothing', () => {
    expect(clusterRead(null)).toBeNull()
  })
})
