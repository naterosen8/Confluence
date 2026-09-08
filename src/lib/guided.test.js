import { describe, it, expect } from 'vitest'
import { guide, LEVERAGE_ANSWERS, HORIZON_ANSWERS } from './guided.js'

const risks = [
  { key: 'size', headline: 'At 2x, this has already wiped out a position', body: 'x', figure: '1x' },
  { key: 'drawdown', headline: 'Expect to be down about 5%', body: 'x', figure: '4.8%' },
  { key: 'recovery', headline: '55% of the time it never came back', body: 'x', figure: '55%' },
]

const run = (leverage, horizon, r = risks) => guide({ leverage, horizon, risks: r })

describe('guide', () => {
  // The whole point: the numbers do not change, the order does.
  it('leads with the wipeout number when they are borrowing', () => {
    expect(run('large', 'days').lead.key).toBe('size')
    expect(run('small', 'weeks').lead.key).toBe('size')
  })

  it('leads with the drawdown when they are paying cash', () => {
    expect(run('cash', 'months').lead.key).toBe('drawdown')
    expect(run('cash', 'days').lead.key).toBe('drawdown')
  })

  // A cash buyer cannot be liquidated, so the wipeout level is not their
  // headline — but it still says something about how violent the thing is, so
  // it is demoted rather than deleted.
  it('demotes the wipeout number for a cash buyer without discarding it', () => {
    const g = run('cash', 'months')
    expect(g.rest.map((r) => r.key)).toContain('size')
    expect([g.lead, ...g.supporting].map((r) => r.key)).not.toContain('size')
  })

  it('shows everything to someone borrowing', () => {
    expect(run('large', 'days').rest).toEqual([])
  })

  it('explains why each item is where it is', () => {
    for (const item of [run('cash', 'days').lead, ...run('cash', 'days').supporting]) {
      expect(item.why, item.key).toBeTruthy()
    }
  })

  it('tailors the recovery reasoning to the stated horizon', () => {
    expect(run('cash', 'days').supporting.find((r) => r.key === 'recovery').why).toMatch(/less time than/)
    expect(run('cash', 'months').supporting.find((r) => r.key === 'recovery').why).toMatch(/time to resolve/)
  })

  // The clause that moved out of plainRisk: only true if they borrowed.
  it('mentions the cost of waiting only to someone who borrowed', () => {
    expect(run('large', 'months').supporting.find((r) => r.key === 'recovery').why).toMatch(/borrowed/)
    expect(run('cash', 'months').supporting.find((r) => r.key === 'recovery').why).not.toMatch(/borrow/i)
  })

  // A filtered view that does not say it is filtered is a shorter page
  // pretending to be the whole one.
  it('says what the ordering was based on', () => {
    expect(run('cash', 'weeks').note).toMatch(/paying cash and holding weeks/i)
    expect(run('large', 'days').note).toMatch(/borrowing to buy and holding a few days/i)
  })

  it('waits for both answers before ordering anything', () => {
    expect(run('', 'days')).toBeNull()
    expect(run('cash', '')).toBeNull()
    expect(run('cash', 'days', [])).toBeNull()
  })

  it('handles an instrument missing a measurement rather than assuming it', () => {
    const g = run('cash', 'months', risks.filter((r) => r.key !== 'recovery'))
    expect(g.lead.key).toBe('drawdown')
    expect([g.lead, ...g.supporting, ...g.rest].map((r) => r.key)).not.toContain('recovery')
  })

  it('offers every answer the page renders', () => {
    expect(LEVERAGE_ANSWERS.map((a) => a.key)).toEqual(['cash', 'small', 'large'])
    expect(HORIZON_ANSWERS.map((a) => a.key)).toEqual(['days', 'weeks', 'months'])
    for (const a of [...LEVERAGE_ANSWERS, ...HORIZON_ANSWERS]) expect(a.label).toBeTruthy()
  })

  it('never turns an ordering into an instruction', () => {
    for (const lev of LEVERAGE_ANSWERS) {
      for (const hor of HORIZON_ANSWERS) {
        const g = run(lev.key, hor.key)
        const text = [g.note, ...[g.lead, ...g.supporting].map((r) => r.why)].join(' ')
        expect(text, `${lev.key}/${hor.key}`).not.toMatch(
          /\b(you should|we recommend|don'?t\s|do not\s|avoid\s|buy it|sell it)\b/i
        )
      }
    }
  })
})
