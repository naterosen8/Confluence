import { describe, it, expect } from 'vitest'
import { selfCheck, CONCLUSION_HEADLINE, CONCLUSION_BLURB } from './verdict.js'

const summary = (over = {}) => ({
  resolvedCount: 858,
  overall: { winRate: 49.8, total: 858 },
  clustered: { days: 20, perEpisode: { low: 44.6, high: 65.0 } },
  upGap: { points: -0.8, low: -6, high: 4.5, distinguishable: false },
  downGap: { points: -1.8, low: -8.5, high: 4.9, distinguishable: false },
  ...over,
})

const screener = (over = {}) => ({
  rows: Array.from({ length: 89 }, (_, i) => ({ symbol: `T${i}`, stat: { distinguishable: false } })),
  directionCheck: { meanCorr: -0.044, tickerCount: 89, lower: -0.057, upper: -0.032 },
  leaderboard: { testedCount: 87, survivorCount: 3 },
  ...over,
})

describe('selfCheck', () => {
  it('asks four independent ways and reports each separately', () => {
    const v = selfCheck({ summary: summary(), screener: screener() })
    expect(v.checks.map((c) => c.key)).toEqual([
      'record',
      'upGap',
      'downGap',
      'correlation',
      'baseRates',
      'leaderboard',
    ])
  })

  it('concludes nothing when nothing finds anything', () => {
    const v = selfCheck({ summary: summary(), screener: screener() })
    expect(v.conclusion).toBe('nothing')
    expect(v.foundCount).toBe(0)
  })

  // The page is only worth trusting if it can say the opposite. A verdict that
  // can only ever reach one answer is a pose, not a measurement.
  it('says so if the evidence ever turns', () => {
    const v = selfCheck({
      summary: summary({
        upGap: { points: 9, low: 3, high: 15, distinguishable: true },
        downGap: { points: 8, low: 2, high: 14, distinguishable: true },
      }),
      screener: screener({
        rows: Array.from({ length: 89 }, () => ({ stat: { distinguishable: true } })),
        directionCheck: { meanCorr: 0.31, tickerCount: 89, lower: 0.2, upper: 0.4 },
        leaderboard: { testedCount: 87, survivorCount: 40 },
      }),
    })
    expect(v.conclusion).toBe('something')
    expect(CONCLUSION_HEADLINE.something).toMatch(/read them before believing it/)
    // And it treats its own good news with more suspicion, not less.
    expect(CONCLUSION_BLURB.something).toMatch(/more suspicion than the alternative/)
  })

  it('reports disagreement as disagreement rather than averaging it away', () => {
    const v = selfCheck({
      summary: summary({ upGap: { points: 9, low: 3, high: 15, distinguishable: true } }),
      screener: screener(),
    })
    expect(v.conclusion).toBe('mixed')
    expect(CONCLUSION_BLURB.mixed).toMatch(/disagreement is the information/)
  })

  it('does not call a tiny correlation a finding whichever side of zero it is', () => {
    for (const meanCorr of [-0.044, 0.044]) {
      const v = selfCheck({
        summary: summary(),
        screener: screener({ directionCheck: { meanCorr, tickerCount: 89, lower: meanCorr - 0.01, upper: meanCorr + 0.01 } }),
      })
      expect(v.checks.find((c) => c.key === 'correlation').verdict).toBe('nothing')
    }
  })

  it('counts base-rate survivors against what chance alone would produce', () => {
    const v = selfCheck({
      summary: summary(),
      screener: screener({
        rows: Array.from({ length: 89 }, (_, i) => ({ stat: { distinguishable: i < 20 } })),
      }),
    })
    expect(v.checks.find((c) => c.key === 'baseRates').verdict).toBe('found')
  })

  it('has nothing to conclude before anything has resolved', () => {
    const v = selfCheck({ summary: null, screener: { rows: [] } })
    expect(v.conclusion).toBe('unmeasured')
  })

  // Nothing on that page may be written down — a hardcoded figure is an
  // opinion that was true once. Asserted behaviourally rather than by grepping
  // the source, which was the first attempt and matched code rather than
  // prose: run the same checks over two unrelated datasets and require that
  // every number in the output moved.
  it('states no number that did not come from the data', () => {
    const numbers = (v) =>
      v.checks
        .flatMap((c) => [c.finding, c.detail])
        .join(' ')
        .match(/-?\d+(?:\.\d+)?/g) ?? []

    const a = numbers(selfCheck({ summary: summary(), screener: screener() }))
    const b = numbers(
      selfCheck({
        summary: summary({
          resolvedCount: 61,
          overall: { winRate: 71.3, total: 61 },
          clustered: { days: 7, perEpisode: { low: 52.4, high: 88.1 } },
          upGap: { points: 12.6, low: 4.2, high: 21.9, distinguishable: true },
          downGap: { points: 6.4, low: 1.1, high: 11.8, distinguishable: true },
        }),
        screener: screener({
          rows: Array.from({ length: 42 }, () => ({ stat: { distinguishable: true } })),
          directionCheck: { meanCorr: 0.284, tickerCount: 42, lower: 0.19, upper: 0.37 },
          leaderboard: { testedCount: 41, survivorCount: 18 },
        }),
      })
    )

    expect(a.length).toBeGreaterThan(10)
    // No figure survives unchanged between two entirely different records.
    // Anything that did would be written into the file rather than measured.
    // 95 is allowed: it is the confidence level, a convention rather than a
    // measurement, and it is the only fixed number this check permits. When
    // this test was first run it was also the only survivor, which is the
    // result that made it worth keeping.
    const stuck = a.filter((n) => b.includes(n) && n !== '95')
    expect(stuck).toEqual([])
  })
})
