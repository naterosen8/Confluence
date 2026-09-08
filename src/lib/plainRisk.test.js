import { describe, it, expect } from 'vitest'
import { plainSize, plainDrawdown, plainRecovery, plainLiquidity, plainRisks } from './plainRisk.js'
import { LEVERAGE_RUNGS } from './riskRead.js'

const risk = (over = {}) => ({ safeLeverage: 3, entries: 500, ...over })
const drawdown = (over = {}) => ({ medianAdversePct: -3.2, worstPct: -13.5, entries: 500, ...over })
const recovery = (over = {}) => ({ medianSessions: 4, neverRecoveredPct: 6, ...over })

const words = (r) => `${r.headline} ${r.body}`

describe('plainSize', () => {
  // The bug this caught on first run: safeLeverage 5 printed "at 6x", and 6x
  // was never tested. Sizes are measured at set rungs, so the next thing known
  // to have failed after 5x is 10x.
  it('names the next size actually tested, not the next whole number', () => {
    for (const x of LEVERAGE_RUNGS.slice(0, -1)) {
      const next = LEVERAGE_RUNGS.find((r) => r > x)
      expect(plainSize(risk({ safeLeverage: x })).headline).toContain(`At ${next}x`)
    }
  })

  it('says so rather than inventing a rung when everything survived', () => {
    const top = LEVERAGE_RUNGS.at(-1)
    expect(plainSize(risk({ safeLeverage: top })).headline).toMatch(/Nothing this site tested/)
  })

  it('carries the surviving size as the figure', () => {
    expect(plainSize(risk({ safeLeverage: 3 })).figure).toBe('3x')
  })

  it('describes the window in years rather than in entries', () => {
    expect(plainSize(risk()).body).toMatch(/the last 2 years/)
    expect(plainSize(risk({ entries: 120 })).body).toMatch(/months/)
  })

  it('has nothing to say without a measurement', () => {
    expect(plainSize(null)).toBeNull()
    expect(plainSize({ safeLeverage: null })).toBeNull()
  })
})

describe('plainDrawdown', () => {
  it('states the typical dip and the worst one', () => {
    const p = plainDrawdown(drawdown())
    expect(p.headline).toMatch(/down about 3%/)
    expect(p.body).toMatch(/worst went 14% down|worst went 13% down/)
  })

  it('ties the number to a decision the reader actually makes', () => {
    expect(plainDrawdown(drawdown()).body).toMatch(/would make you sell/)
  })
})

describe('plainRecovery', () => {
  it('leads with the recovery when things come back', () => {
    expect(plainRecovery(recovery()).headline).toMatch(/gets back to where you bought within 4 days/)
  })

  // When most positions never recovered, that is the headline, not a footnote.
  it('leads with the failures when they dominate', () => {
    const p = plainRecovery(recovery({ neverRecoveredPct: 55, medianSessions: 7 }))
    expect(p.headline).toMatch(/55% of the time it never came back/)
    expect(p.label).toBe('Never recovered')
    // The cost-of-waiting clause moved to guided.js, which knows whether the
    // reader actually borrowed. It was being shown to cash buyers immediately
    // after they said they were not borrowing.
    expect(p.body).not.toMatch(/borrow/i)
  })
})

describe('plainLiquidity', () => {
  it('speaks up only when getting out is actually a problem', () => {
    expect(plainLiquidity({ reported: true, thin: false })).toBeNull()
    expect(plainLiquidity({ reported: false })).toBeNull()
    expect(plainLiquidity({ reported: true, thin: true }).headline).toMatch(/thinly traded/)
  })
})

describe('what plain language must not become', () => {
  const every = () =>
    plainRisks({
      risk: risk(),
      drawdown: drawdown(),
      recovery: recovery({ neverRecoveredPct: 55 }),
      liquidity: { reported: true, thin: true },
    })

  // The trap the first draft fell into. "Don't go above 3x" reads beautifully
  // and is a recommendation about size, which this site does not make. "At 5x
  // this has already wiped out a position" says the same thing and is a fact.
  // These match constructions, not vocabulary. The first version banned the
  // words "never" and "sell" outright and failed on "55% of the time it never
  // came back" and "if being 5% down would make you sell" — both plainly
  // descriptive. Banning a word is easy and wrong; what matters is whether a
  // sentence tells the reader to do something.
  it('never instructs, however tempting the shorter wording is', () => {
    for (const r of every()) {
      expect(words(r), r.key).not.toMatch(
        /\b(don'?t\s|do not\s|you should|we recommend|avoid\s|stick to|stay under|keep it under|limit yourself|make sure you)\b/i
      )
    }
  })

  it('never tells the reader to take or close a position', () => {
    for (const r of every()) {
      expect(words(r), r.key).not.toMatch(
        /\b(buy it|sell it|go long|short it|take a long|take a short|get out now|hold on to)\b/i
      )
    }
  })

  // The whole point of the file: it has to be readable without a vocabulary.
  it('uses none of the vocabulary the rest of the site runs on', () => {
    for (const r of every()) {
      expect(words(r), r.key).not.toMatch(
        /\bATR\b|percentile|confidence interval|drift|Wilson|standard error|p-value|median adverse|excursion/i
      )
    }
  })

  it('still says these describe the past rather than the future', () => {
    const text = every().map(words).join(' ')
    expect(text).toMatch(/already happened|has already|middle of the range/)
    expect(text).toMatch(/not a prediction/i)
  })

  it('drops a section rather than inventing one it has no data for', () => {
    expect(plainRisks({ risk: null, drawdown: null, recovery: null, liquidity: null })).toEqual([])
  })
})
