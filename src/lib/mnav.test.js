import { describe, it, expect } from 'vitest'
import { balanceSheetValuation, classifyValuation, priceToBookHistory, summarizeHistory } from './mnav'

const quarter = (over = {}) => ({
  asOf: '2024-03-31',
  form: '10-Q',
  shares: 1000,
  assets: 5000,
  liabilities: 3000,
  equity: 2000,
  currentAssets: 2500,
  currentLiabilities: 1000,
  cash: 900,
  debt: 400,
  ...over,
})

describe('balanceSheetValuation', () => {
  it('computes market cap, book value and the gap between them', () => {
    const v = balanceSheetValuation({ price: 4, quarter: quarter() })
    expect(v.marketCap).toBe(4000)
    expect(v.bookEquity).toBe(2000)
    expect(v.bookValuePerShare).toBe(2)
    expect(v.priceToBook).toBe(2)
    expect(v.premiumToBook).toBe(2000)
    expect(v.premiumPct).toBe(100)
  })

  it('derives book equity from assets minus liabilities when equity is absent', () => {
    const v = balanceSheetValuation({ price: 4, quarter: quarter({ equity: null }) })
    expect(v.bookEquity).toBe(2000)
  })

  it('computes net cash, enterprise value and NCAV', () => {
    const v = balanceSheetValuation({ price: 4, quarter: quarter() })
    expect(v.netCash).toBe(500) // 900 - 400
    expect(v.netCashPerShare).toBe(0.5)
    expect(v.enterpriseValue).toBe(3500) // 4000 - 500
    expect(v.ncav).toBe(-500) // 2500 current assets - 3000 total liabilities
  })

  it('flags a net-net only when market cap is under two-thirds of NCAV', () => {
    const q = quarter({ currentAssets: 6000, liabilities: 3000 }) // NCAV 3000
    expect(balanceSheetValuation({ price: 1.9, quarter: q }).isNetNet).toBe(true) // cap 1900 < 2000
    expect(balanceSheetValuation({ price: 2.1, quarter: q }).isNetNet).toBe(false) // cap 2100 > 2000
  })

  it('marks negative book equity instead of returning a nonsense ratio', () => {
    const v = balanceSheetValuation({ price: 4, quarter: quarter({ equity: -500, liabilities: 5500 }) })
    expect(v.hasPositiveBook).toBe(false)
    expect(v.priceToBook).toBeNull()
    expect(v.premiumPct).toBeNull()
  })

  it('returns null when required inputs are missing rather than guessing', () => {
    expect(balanceSheetValuation({ price: 4, quarter: null })).toBeNull()
    expect(balanceSheetValuation({ price: 0, quarter: quarter() })).toBeNull()
    expect(balanceSheetValuation({ price: 4, quarter: quarter({ shares: null }) })).toBeNull()
    expect(balanceSheetValuation({ price: 4, quarter: quarter({ equity: null, liabilities: null }) })).toBeNull()
  })
})

describe('classifyValuation', () => {
  const classify = (price, over) => classifyValuation(balanceSheetValuation({ price, quarter: quarter(over) }))

  it('names each regime', () => {
    expect(classify(0.5).key).toBe('below-book') // cap 500 vs book 2000
    expect(classify(2.5).key).toBe('near-book') // P/B 1.25
    expect(classify(10).key).toBe('above-book') // P/B 5
    expect(classify(4, { equity: -500 }).key).toBe('negative-equity')
    expect(classify(1.9, { currentAssets: 6000 }).key).toBe('net-net')
  })

  it('always pairs the finding with its counter-argument', () => {
    // The whole point: no branch may read as a recommendation.
    for (const c of [classify(0.5), classify(2.5), classify(10), classify(4, { equity: -500 })]) {
      expect(c.detail.length).toBeGreaterThan(80)
    }
  })

  it('reports net cash exceeding the market cap', () => {
    const v = classify(0.3, { cash: 5000, debt: 0, currentAssets: 100 })
    expect(v.key).toBe('net-cash-exceeds-cap')
  })
})

describe('priceToBookHistory', () => {
  const bars = [
    { date: '2023-12-29', close: 4 },
    { date: '2024-03-28', close: 6 },
  ]
  const quarters = [
    { asOf: '2023-12-31', shares: 1000, equity: 2000 },
    { asOf: '2024-03-31', shares: 1000, equity: 2500 },
  ]

  it('uses the book value reported for each quarter, not the latest one', () => {
    const h = priceToBookHistory({ quarters, bars })
    expect(h).toEqual([
      { asOf: '2023-12-31', priceToBook: 2, price: 4 }, // 4*1000/2000
      { asOf: '2024-03-31', priceToBook: 2.4, price: 6 }, // 6*1000/2500
    ])
  })

  it('skips quarters with no usable price or non-positive equity', () => {
    expect(priceToBookHistory({ quarters, bars: [{ date: '2025-01-01', close: 9 }] })).toEqual([])
    expect(priceToBookHistory({ quarters: [{ asOf: '2024-03-31', shares: 10, equity: -5 }], bars })).toEqual([])
    expect(priceToBookHistory({ quarters: [], bars })).toEqual([])
  })
})

describe('summarizeHistory', () => {
  it('places the current ratio within its own history', () => {
    const h = [1, 2, 3, 4].map((priceToBook, i) => ({ asOf: `d${i}`, priceToBook }))
    const s = summarizeHistory(h, 3.5)
    expect(s.min).toBe(1)
    expect(s.max).toBe(4)
    expect(s.percentile).toBe(75)
    expect(s.sampleSize).toBe(4)
  })

  it('returns null with nothing to summarize', () => {
    expect(summarizeHistory([], 2)).toBeNull()
    expect(summarizeHistory([{ priceToBook: 1 }], null)).toBeNull()
  })
})
