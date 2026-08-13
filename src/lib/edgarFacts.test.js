import { describe, it, expect } from 'vitest'
import { parseCompanyFacts } from './edgarFacts'

const usd = (rows) => ({ units: { USD: rows } })
const sh = (rows) => ({ units: { shares: rows } })
const e = (end, val, extra = {}) => ({ end, val, form: '10-Q', filed: end, ...extra })

function facts(overrides = {}) {
  return {
    cik: 1234,
    entityName: 'TEST CO',
    facts: {
      dei: {
        EntityCommonStockSharesOutstanding: sh([e('2024-01-31', 1000), e('2024-04-30', 1000)]),
      },
      'us-gaap': {
        Assets: usd([e('2023-12-31', 5000), e('2024-03-31', 5200)]),
        Liabilities: usd([e('2023-12-31', 3000), e('2024-03-31', 3100)]),
        AssetsCurrent: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
        CashAndCashEquivalentsAtCarryingValue: usd([e('2023-12-31', 800), e('2024-03-31', 900)]),
        LongTermDebtNoncurrent: usd([e('2023-12-31', 1200), e('2024-03-31', 1150)]),
        ...overrides,
      },
    },
  }
}

describe('parseCompanyFacts', () => {
  it('builds one snapshot per reported period', () => {
    const r = parseCompanyFacts(facts())
    expect(r.entityName).toBe('TEST CO')
    expect(r.quarters.map((q) => q.asOf)).toEqual(['2023-12-31', '2024-03-31'])
    const q = r.quarters[1]
    expect(q.assets).toBe(5200)
    expect(q.liabilities).toBe(3100)
    expect(q.equity).toBe(2100) // 5200 - 3100
    expect(q.cash).toBe(900)
    expect(q.debt).toBe(1150)
  })

  it('prefers the most recently filed figure when a period is restated', () => {
    const r = parseCompanyFacts(
      facts({
        Assets: usd([
          { end: '2024-03-31', val: 5200, form: '10-Q', filed: '2024-04-20' },
          { end: '2024-03-31', val: 4900, form: '10-Q', filed: '2024-08-01' }, // restatement
        ]),
      })
    )
    expect(r.quarters.at(-1).assets).toBe(4900)
  })

  it('ignores non-10-K/Q filings', () => {
    const r = parseCompanyFacts(
      facts({
        Assets: usd([
          { end: '2024-03-31', val: 5200, form: '10-Q', filed: '2024-04-20' },
          { end: '2024-06-30', val: 9999, form: 'S-1', filed: '2024-07-01' },
        ]),
      })
    )
    expect(r.quarters.map((q) => q.asOf)).not.toContain('2024-06-30')
  })

  it('recovers liabilities from the accounting identity when untagged', () => {
    const f = facts()
    delete f.facts['us-gaap'].Liabilities
    f.facts['us-gaap'].StockholdersEquity = usd([e('2024-03-31', 2100)])
    const r = parseCompanyFacts(f)
    expect(r.quarters.at(-1).liabilities).toBe(3100) // 5200 - 2100
  })

  it('sums cash with short-term investments and long with short-term debt', () => {
    const r = parseCompanyFacts(
      facts({
        ShortTermInvestments: usd([e('2024-03-31', 400)]),
        LongTermDebtCurrent: usd([e('2024-03-31', 50)]),
      })
    )
    const q = r.quarters.at(-1)
    expect(q.cash).toBe(1300) // 900 + 400
    expect(q.debt).toBe(1200) // 1150 + 50
  })

  it('carries the latest share count onto the newest quarter even when filed later', () => {
    // Cover-page share counts are filed after the period they describe, so an
    // exact as-of match would leave the newest quarter without shares.
    const f = facts()
    f.facts.dei.EntityCommonStockSharesOutstanding = sh([e('2024-05-15', 1234)])
    const r = parseCompanyFacts(f)
    expect(r.quarters.at(-1).shares).toBe(1234)
  })

  it('takes quarterly income figures and rejects the annual ones filed alongside them', () => {
    // A 10-K carries a 12-month revenue figure under the same tag as the
    // quarterly ones. Mixing them would compare a year against a quarter and
    // silently corrupt every year-over-year trend.
    const f = facts()
    f.facts['us-gaap'].Revenues = usd([
      { start: '2024-01-01', end: '2024-03-31', val: 500, form: '10-Q', filed: '2024-04-20' },
      { start: '2023-04-01', end: '2024-03-31', val: 2000, form: '10-K', filed: '2024-04-20' }, // trailing year
    ])
    f.facts['us-gaap'].NetIncomeLoss = usd([
      { start: '2024-01-01', end: '2024-03-31', val: 50, form: '10-Q', filed: '2024-04-20' },
    ])
    const q = parseCompanyFacts(f).quarters.at(-1)
    expect(q.revenue).toBe(500)
    expect(q.netIncome).toBe(50)
  })

  it('leaves income null when only annual figures exist', () => {
    const f = facts()
    f.facts['us-gaap'].Revenues = usd([
      { start: '2023-04-01', end: '2024-03-31', val: 2000, form: '10-K', filed: '2024-04-20' },
    ])
    expect(parseCompanyFacts(f).quarters.at(-1).revenue).toBeNull()
  })

  it('does not borrow an adjacent quarter\'s revenue for a period that has none', () => {
    const f = facts()
    f.facts['us-gaap'].Revenues = usd([
      { start: '2023-10-01', end: '2023-12-31', val: 400, form: '10-Q', filed: '2024-01-20' },
    ])
    const qs = parseCompanyFacts(f).quarters
    expect(qs.find((q) => q.asOf === '2023-12-31').revenue).toBe(400)
    expect(qs.find((q) => q.asOf === '2024-03-31').revenue).toBeNull()
  })

  it('returns null rather than a hollow object when the filing has no balance sheet', () => {
    expect(parseCompanyFacts({ facts: { 'us-gaap': {} } })).toBeNull()
    expect(parseCompanyFacts({})).toBeNull()
    expect(parseCompanyFacts(null)).toBeNull()
  })
})

// Both of these shapes are real: XOM came back with 2 quarters where every
// other company had 12, and META has produced no fundamental layer at all
// since the feature was added.
describe('concept selection across a fallback chain', () => {
  it('does not lose ten quarters to a sparse higher-priority concept', () => {
    // StockholdersEquity is preferred, but here it exists in only one filing
    // while the noncontrolling-interest variant covers both periods. Taking
    // the first non-empty tag drops the period it cannot answer.
    const f = facts({
      Liabilities: undefined,
      StockholdersEquity: usd([e('2024-03-31', 2100)]),
      StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: usd([
        e('2023-12-31', 2000),
        e('2024-03-31', 2100),
      ]),
    })
    delete f.facts['us-gaap'].Liabilities
    const r = parseCompanyFacts(f)
    expect(r.quarters.map((q) => q.asOf)).toEqual(['2023-12-31', '2024-03-31'])
    expect(r.quarters[0].equity).toBe(2000)
  })

  it('still prefers the higher-priority concept when it covers everything', () => {
    // Coverage is a tie-breaker, never a reason to swap in a semantically
    // different concept that happens to have more rows.
    const f = facts({
      StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
      StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: usd([
        e('2023-06-30', 1900),
        e('2023-09-30', 1950),
        e('2023-12-31', 9999),
        e('2024-03-31', 9999),
      ]),
    })
    const r = parseCompanyFacts(f)
    expect(r.quarters.map((q) => q.equity)).toEqual([2000, 2100])
  })

  it('picks the revenue concept that covers the periods, not the first one present', () => {
    const q = (end, start, val) => e(end, val, { start })
    const f = facts({
      StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
      // Present but sparse — a bank tagging only part of its revenue this way.
      RevenueFromContractWithCustomerExcludingAssessedTax: usd([q('2024-03-31', '2024-01-01', 10)]),
      RevenuesNetOfInterestExpense: usd([
        q('2023-12-31', '2023-10-01', 400),
        q('2024-03-31', '2024-01-01', 420),
      ]),
    })
    const r = parseCompanyFacts(f)
    expect(r.quarters.map((x) => x.revenue)).toEqual([400, 420])
  })
})

describe('multi-class filers with no undimensioned share count', () => {
  // companyfacts carries only facts with no dimensional breakdown, so a filer
  // reporting its cover-page count per share class has no consolidated count
  // in this API at all. Every quarter was dropped for a null share count.
  const multiClass = () => {
    const f = facts({
      StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
      WeightedAverageNumberOfDilutedSharesOutstanding: sh([
        e('2023-12-31', 2500, { start: '2023-10-01' }),
        e('2024-03-31', 2490, { start: '2024-01-01' }),
      ]),
    })
    delete f.facts.dei
    return f
  }

  it('falls back to weighted-average shares rather than dropping every quarter', () => {
    const r = parseCompanyFacts(multiClass())
    expect(r.quarters).toHaveLength(2)
    expect(r.quarters.map((q) => q.shares)).toEqual([2500, 2490])
  })

  it('prefers the cover-page count whenever one exists', () => {
    // The weighted average is an average over the period, not a count at the
    // end of it, so it must never displace a real cover-page figure.
    const f = facts({
      StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
      WeightedAverageNumberOfDilutedSharesOutstanding: sh([e('2023-12-31', 9999), e('2024-03-31', 9999)]),
    })
    expect(parseCompanyFacts(f).quarters.every((q) => q.shares === 1000)).toBe(true)
  })
})

describe('diagnoseCompanyFacts', () => {
  it('names the stage that failed instead of reporting a bare miss', async () => {
    const { diagnoseCompanyFacts } = await import('./edgarFacts')
    const f = facts({ StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]) })
    delete f.facts.dei
    delete f.facts['us-gaap'].Liabilities
    const d = diagnoseCompanyFacts(f)
    expect(d.reason).toBe('every period dropped')
    expect(d.droppedNoShares).toBe(2)
    expect(d.concepts.shares).toBeNull()

    expect(diagnoseCompanyFacts({ facts: { 'us-gaap': {} } }).reason).toMatch(/no Assets concept/)
    expect(diagnoseCompanyFacts(null).reason).toMatch(/no facts/)
  })

  it('reports the chosen concept and its coverage on a healthy filer', async () => {
    const { diagnoseCompanyFacts } = await import('./edgarFacts')
    const d = diagnoseCompanyFacts(facts())
    expect(d.reason).toBeNull()
    expect(d.kept).toBe(2)
    expect(d.concepts.assets).toBe('Assets (2/2)')
    expect(d.concepts.liabilities).toBe('Liabilities (2/2)')
  })
})

describe('parseCompanyFacts output shape', () => {
  it('keeps diagnostics out of the committed JSON', () => {
    const r = parseCompanyFacts(facts())
    expect(Object.keys(r).sort()).toEqual(['cik', 'entityName', 'quarters'])
  })
})

describe('share-count basis is recorded, not hidden', () => {
  it('marks a quarter that fell back to the weighted average', () => {
    const f = facts({
      StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
      WeightedAverageNumberOfDilutedSharesOutstanding: sh([e('2023-12-31', 2500), e('2024-03-31', 2490)]),
    })
    delete f.facts.dei
    const r = parseCompanyFacts(f)
    expect(r.quarters.every((q) => q.sharesBasis === 'weighted-average')).toBe(true)
  })

  it('leaves the field off entirely when a real cover-page count was used', () => {
    // Absent rather than 'cover-page': this ships to every visitor in a JSON
    // payload, and the common case should cost nothing.
    const r = parseCompanyFacts(facts())
    expect(r.quarters.every((q) => !('sharesBasis' in q))).toBe(true)
  })
})

describe('a filer that barely tags Assets', () => {
  // XOM's companyfacts carries exactly two us-gaap:Assets facts across its
  // whole history, so the period grid was two quarters long and every other
  // concept then reported perfect coverage of it.
  const sparseAssets = () =>
    facts({
      Assets: usd([e('2024-03-31', 5200)]),
      LiabilitiesAndStockholdersEquity: usd([e('2023-12-31', 5000), e('2024-03-31', 5200)]),
      StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
    })

  it('recovers the period grid from the liabilities-and-equity total', () => {
    const r = parseCompanyFacts(sparseAssets())
    expect(r.quarters.map((q) => q.asOf)).toEqual(['2023-12-31', '2024-03-31'])
    // Same number by construction, so the figure itself must be unchanged.
    expect(r.quarters.map((q) => q.assets)).toEqual([5000, 5200])
  })

  it('keeps using Assets when it is present and no less complete', () => {
    const f = facts({
      Assets: usd([e('2023-12-31', 5000), e('2024-03-31', 5200)]),
      LiabilitiesAndStockholdersEquity: usd([e('2023-12-31', 1), e('2024-03-31', 2)]),
      StockholdersEquity: usd([e('2023-12-31', 2000), e('2024-03-31', 2100)]),
    })
    expect(parseCompanyFacts(f).quarters.map((q) => q.assets)).toEqual([5000, 5200])
  })
})

describe('the accounting identity recovers a sparse leg', () => {
  // XOM's real shape: two Assets facts and two LiabilitiesAndStockholders-
  // Equity facts across its whole history, while liabilities and equity are
  // reported every quarter. Anchoring the period grid on assets threw the
  // rest away and then reported flawless 2/2 coverage of the two that
  // survived.
  const sparseAssetsLeg = () => {
    const f = facts({
      Assets: usd([e('2024-03-31', 5200)]),
      Liabilities: usd([e('2023-09-30', 2800), e('2023-12-31', 3000), e('2024-03-31', 3100)]),
      StockholdersEquity: usd([e('2023-09-30', 1900), e('2023-12-31', 2000), e('2024-03-31', 2100)]),
    })
    return f
  }

  it('keeps every period the other two legs cover', () => {
    const r = parseCompanyFacts(sparseAssetsLeg())
    expect(r.quarters.map((q) => q.asOf)).toEqual(['2023-09-30', '2023-12-31', '2024-03-31'])
  })

  it('derives the missing assets figure rather than leaving it null or stale', () => {
    const r = parseCompanyFacts(sparseAssetsLeg())
    // liabilities + equity, exactly — never a carried-forward earlier value.
    expect(r.quarters.map((q) => q.assets)).toEqual([4700, 5000, 5200])
  })

  it('never carries an older balance sheet total forward into a later period', () => {
    // A period with no equity anywhere must come back null, not inherit the
    // previous quarter's figure — that would publish stale equity as current.
    const f = facts({
      Assets: usd([e('2023-12-31', 5000), e('2024-03-31', 5200)]),
      Liabilities: usd([e('2023-12-31', 3000)]),
      StockholdersEquity: usd([e('2023-12-31', 2000)]),
    })
    const r = parseCompanyFacts(f)
    expect(r.quarters.map((q) => q.asOf)).toEqual(['2023-12-31'])
  })
})

describe('reported equity and derived equity are not the same measure', () => {
  // StockholdersEquity is the parent's stake; assets minus liabilities is
  // total equity and includes noncontrolling interests. The gap is billions
  // at CVX, XOM, TSLA and BAC, and the table was silently mixing the two.
  it('flags a quarter whose equity came from the identity', () => {
    const f = facts({ Assets: usd([e('2024-03-31', 5200)]), Liabilities: usd([e('2024-03-31', 3100)]) })
    delete f.facts['us-gaap'].StockholdersEquity
    const q = parseCompanyFacts(f).quarters.at(-1)
    expect(q.equity).toBe(2100)
    expect(q.equityBasis).toBe('derived')
  })

  it('leaves the flag off when the filer reports equity directly', () => {
    const f = facts({
      Assets: usd([e('2024-03-31', 5200)]),
      Liabilities: usd([e('2024-03-31', 3100)]),
      // Deliberately not 5200 - 3100: a filer with minority interests reports
      // a smaller parent-only figure, and that is the one to keep.
      StockholdersEquity: usd([e('2024-03-31', 2000)]),
    })
    const q = parseCompanyFacts(f).quarters.at(-1)
    expect(q.equity).toBe(2000)
    expect('equityBasis' in q).toBe(false)
  })
})
