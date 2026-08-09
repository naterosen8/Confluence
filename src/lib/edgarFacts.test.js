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

  it('returns null rather than a hollow object when the filing has no balance sheet', () => {
    expect(parseCompanyFacts({ facts: { 'us-gaap': {} } })).toBeNull()
    expect(parseCompanyFacts({})).toBeNull()
    expect(parseCompanyFacts(null)).toBeNull()
  })
})
