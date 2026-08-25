import { describe, it, expect } from 'vitest'
import { brief, leanWorth } from './brief.js'

const signals = (over = {}) => ({
  price: 100,
  rsi: 55,
  sma50: 95,
  sma200: 90,
  verdict: 'leaning-up',
  bullishPoints: 3,
  bearishPoints: 1,
  ...over,
})

const stat = (over = {}) => ({
  sampleSize: 183,
  independentSample: 53,
  winRate: 50,
  drift: 60,
  gap: -10,
  distinguishable: true,
  ...over,
})

const full = (over = {}) => ({
  symbol: 'AAA',
  signals: signals(),
  setup: { key: 'failed-breakout', name: 'Failed breakout' },
  stat: stat(),
  market: { headline: 'Broad uptrend', breadth: { above: 58, counted: 87 } },
  record: { resolvedCount: 7, hits: 3, drift: 43, enough: false },
  risk: { safeLeverage: 5, entries: 250 },
  stop: { keeper: { mult: 1.5 } },
  drawdown: { medianAdversePct: -3.2, worstPct: -13.5, entries: 250 },
  recovery: { medianSessions: 3, neverRecoveredPct: 2 },
  liquidity: { reported: true, absorbableQuiet: 210_600_000, thin: false },
  atr: 5.88,
  corrSpy: 0.68,
  overlap: null,
  ...over,
})

const allText = (b) => [b.headline, ...b.sections.map((s) => s.text), b.caveat].join(' ')

describe('leanWorth', () => {
  // The rule the whole module is shaped around.
  it('never states the lean without what it has been worth', () => {
    const { text } = leanWorth({ signals: signals(), stat: stat(), record: null })
    expect(text).toMatch(/readings lean up/)
    const leanAt = text.indexOf('lean up')
    const worthAt = text.search(/against 60% for this ticker generally/)
    expect(worthAt).toBeGreaterThan(leanAt)
    expect(text).toMatch(/a gap of −10\.0 points/)
  })

  it('says plainly when a structure has been worse than nothing', () => {
    const { text } = leanWorth({ signals: signals(), stat: stat({ gap: -10, distinguishable: true }), record: null })
    expect(text).toMatch(/actively unhelpful/)
  })

  it('does not claim a result the interval does not support', () => {
    const { text } = leanWorth({ signals: signals(), stat: stat({ gap: 4, distinguishable: false }), record: null })
    expect(text).toMatch(/includes zero/)
    expect(text).not.toMatch(/survives its own test|actively unhelpful/)
  })

  // The sample is smaller than the count, everywhere it is quoted.
  it('discounts an overlapping sample down to its independent size', () => {
    const { text } = leanWorth({ signals: signals(), stat: stat(), record: null })
    expect(text).toMatch(/183 is closer to 53/)
  })

  it('adds the published record without turning three calls into a rate', () => {
    const { text } = leanWorth({
      signals: signals(),
      stat: stat(),
      record: { resolvedCount: 3, hits: 3, drift: 100, enough: false },
    })
    expect(text).toMatch(/3 of 3 resolved calls/)
    expect(text).toMatch(/price rose 100% of the time regardless/)
    expect(text).toMatch(/Too few to be a rate/)
  })

  it('names a split as a split rather than inventing a direction', () => {
    const { text } = leanWorth({ signals: signals({ verdict: 'split' }), stat: null, record: null })
    expect(text).toMatch(/split rather than leaning either way/)
  })

  it('has nothing to say without a verdict', () => {
    expect(leanWorth({ signals: { verdict: 'nonsense' }, stat: null, record: null })).toBeNull()
  })
})

describe('brief', () => {
  it('assembles the sections in the order someone reads them', () => {
    expect(brief(full()).sections.map((s) => s.key)).toEqual(['stands', 'worth', 'holding'])
  })

  it('leads with where price actually is', () => {
    expect(brief(full()).sections[0].text).toMatch(/^AAA last traded at \$100\.00, above both its 50- and 200-day averages\./)
  })

  it('carries the tape the instrument sits in', () => {
    expect(brief(full()).sections[0].text).toMatch(/broad uptrend, with 58 of 87 tracked names/)
  })

  it('reports what holding it has been like, not just whether it worked', () => {
    const text = brief(full()).sections.find((s) => s.key === 'holding').text
    expect(text).toMatch(/3\.2% against itself/)
    expect(text).toMatch(/deepest of the last 250 entries reached 13\.5%/)
    expect(text).toMatch(/Above 5x/)
  })

  describe('the headline', () => {
    it('names the structure and what it has been worth, never a call', () => {
      expect(brief(full()).headline).toBe('Failed breakout — and here, that has been worse than doing nothing')
    })

    it('marks the rare surviving result as surviving, not as an opportunity', () => {
      const h = brief(full({ stat: stat({ gap: 8, distinguishable: true }) })).headline
      expect(h).toMatch(/survives its own test|clears its own test/)
      expect(h).not.toMatch(/buy|opportunity|setup to take/i)
    })

    it('says there is no measurable edge when there is not', () => {
      expect(brief(full({ stat: stat({ distinguishable: false }) })).headline).toMatch(/no measurable edge/)
    })
  })

  describe('figures', () => {
    it('carries the numbers worth taking away', () => {
      expect(brief(full()).figures.map((f) => f.key)).toEqual(['size', 'stop', 'drawdown', 'liquidity', 'corr'])
    })

    it('converts the stop multiple into money', () => {
      expect(brief(full()).figures.find((f) => f.key === 'stop').note).toBe('$8.82 from entry')
    })

    // Unknown and zero are different claims, and a brief that silently drops
    // the row reads as though the question was not asked.
    it('reports unreported volume rather than omitting the row', () => {
      const f = brief(full({ liquidity: { reported: false } })).figures.find((x) => x.key === 'liquidity')
      expect(f.value).toBe('—')
      expect(f.note).toMatch(/reports no volume/)
    })

    it('says when a name is largely the index in a costume', () => {
      expect(brief(full({ corrSpy: 0.92 })).figures.find((f) => f.key === 'corr').note).toMatch(/index in a costume/)
    })
  })

  describe('overlap', () => {
    it('names the block a ticker moves with', () => {
      const b = brief(
        full({
          overlap: {
            count: 4,
            threshold: 0.7,
            groups: [{ members: ['AAA', 'BBB', 'CCC'], meanCorrelation: 0.81 }],
          },
        })
      )
      expect(b.sections.find((s) => s.key === 'overlap').text).toMatch(/moves as one position with BBB, CCC/)
      expect(b.sections.find((s) => s.key === 'overlap').text).toMatch(/spreads the ticket, not the exposure/)
    })

    it('says so when nothing grouped', () => {
      const b = brief(full({ overlap: { count: 3, threshold: 0.7, groups: [{ members: ['AAA'], meanCorrelation: null }] } }))
      expect(b.sections.find((s) => s.key === 'overlap').text).toMatch(/did not group with anything/)
    })

    it('stays silent when there is no basket to compare against', () => {
      expect(brief(full({ overlap: { count: 1, groups: [] } })).sections.find((s) => s.key === 'overlap')).toBeUndefined()
    })
  })

  describe('what it refuses to do', () => {
    // The standing line, asserted on the one page most likely to be read as a
    // recommendation because it speaks in a single voice.
    it('never recommends a direction, a size or an action', () => {
      for (const over of [
        {},
        { stat: stat({ gap: 12, distinguishable: true }) },
        { signals: signals({ verdict: 'aligned-up', bullishPoints: 5, bearishPoints: 0 }) },
        { signals: signals({ verdict: 'aligned-down', bullishPoints: 0, bearishPoints: 5 }) },
      ]) {
        const text = allText(brief(full(over)))
        expect(text).not.toMatch(/\b(buy|sell|should (buy|sell|take)|we recommend|go long|short it|worth taking|opportunity)\b/i)
      }
    })

    it('says outright that the site finds no predictive power', () => {
      expect(brief(full()).caveat).toMatch(/does not find any/)
    })

    it('says every figure came from a chapter that carries its own caveat', () => {
      expect(brief(full()).caveat).toMatch(/none of it is new/)
    })
  })

  describe('missing inputs', () => {
    it('drops a section rather than printing an empty one', () => {
      const b = brief(full({ drawdown: null, recovery: null, risk: null }))
      expect(b.sections.find((s) => s.key === 'holding')).toBeUndefined()
    })

    it('places a ticker with no long history without pretending', () => {
      const b = brief(full({ signals: signals({ sma200: null }) }))
      expect(b.sections[0].text).toMatch(/without enough history to place it/)
    })

    it('has nothing to say without signals', () => {
      expect(brief({ symbol: 'AAA' })).toBeNull()
    })
  })
})

describe('the split case', () => {
  // "The readings lean none" — a direction of 'none' is a string, and reading
  // it as truthy produced the most confusing sentence the page could open on.
  it('never renders a direction as the word for having none', () => {
    for (const verdict of ['split', 'aligned-up', 'leaning-down']) {
      const { text } = leanWorth({ signals: signals({ verdict }), stat: null, record: null })
      expect(text).not.toMatch(/lean none|leans none/)
    }
  })

  it('still reports what a split has been worth', () => {
    const b = brief(full({ signals: signals({ verdict: 'split', bullishPoints: 2, bearishPoints: 2 }) }))
    const worth = b.sections.find((s) => s.key === 'worth')
    expect(worth.text).toMatch(/split rather than leaning either way/)
    expect(worth.text).toMatch(/a gap of/)
  })
})
