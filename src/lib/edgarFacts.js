// Normalizes SEC EDGAR XBRL "companyfacts" JSON into per-quarter balance
// sheet snapshots. Kept pure and free of any node/network dependency so the
// parsing rules — which are the fiddly part — can be unit tested against
// fixtures instead of only being exercised by a live API call in CI.
//
// EDGAR shape, for reference:
//   facts["us-gaap"]["Assets"]["units"]["USD"] = [
//     { end: "2024-06-30", val: 4119e8, form: "10-Q", filed: "2024-07-30", ... }, ...
//   ]

// A filer restates: the same period end appears in several filings. Keep the
// most recently *filed* figure for each period end, which is the company's
// latest word on that quarter.
function latestByPeriodEnd(entries = []) {
  const byEnd = new Map()
  for (const e of entries) {
    if (!e || typeof e.val !== 'number' || !e.end) continue
    // Annual reports and quarterlies only — skip 8-K/S-1 fragments.
    if (e.form && !/^10-[KQ]/.test(e.form)) continue
    const prev = byEnd.get(e.end)
    if (!prev || (e.filed || '') > (prev.filed || '')) byEnd.set(e.end, e)
  }
  return [...byEnd.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0))
}

function conceptEntries(facts, namespace, tag, unit) {
  const units = facts?.[namespace]?.[tag]?.units
  if (!units) return []
  return latestByPeriodEnd(units[unit] || [])
}

// First tag that yields anything — filers tag the same economic quantity
// under different concepts, so each metric needs a fallback chain.
function firstAvailable(facts, namespace, tags, unit) {
  for (const tag of tags) {
    const entries = conceptEntries(facts, namespace, tag, unit)
    if (entries.length) return entries
  }
  return []
}

function valueAsOf(entries, date) {
  let match = null
  for (const e of entries) {
    if (e.end <= date) match = e
    else break
  }
  return match ? match.val : null
}

// Share counts are the slowest-moving item on the filing and are reported on
// the cover page rather than at period end, so an as-of-only lookup drops
// every quarter older than the first observation. For the historical ratio
// chart the nearest observation in either direction is a far better answer
// than discarding the quarter; dollar figures never use this.
function nearestValue(entries, date) {
  if (!entries.length) return null
  let best = null
  let bestGap = Infinity
  for (const e of entries) {
    const gap = Math.abs(Date.parse(e.end) - Date.parse(date))
    if (gap < bestGap) {
      bestGap = gap
      best = e
    }
  }
  return best ? best.val : null
}

function sumAsOf(entryLists, date) {
  let total = null
  for (const entries of entryLists) {
    const v = valueAsOf(entries, date)
    if (v != null) total = (total ?? 0) + v
  }
  return total
}

export const CONCEPTS = {
  assets: ['Assets'],
  liabilities: ['Liabilities'],
  equity: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  ],
  currentAssets: ['AssetsCurrent'],
  currentLiabilities: ['LiabilitiesCurrent'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  shortTermInvestments: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
  longTermDebt: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  shortTermDebt: ['LongTermDebtCurrent', 'DebtCurrent'],
}

export function parseCompanyFacts(json, { maxQuarters = 12 } = {}) {
  const facts = json?.facts
  if (!facts) return null

  const pick = (key) => firstAvailable(facts, 'us-gaap', CONCEPTS[key], 'USD')
  const assets = pick('assets')
  if (!assets.length) return null

  const liabilities = pick('liabilities')
  const equity = pick('equity')
  const currentAssets = pick('currentAssets')
  const currentLiabilities = pick('currentLiabilities')
  const cash = pick('cash')
  const shortTermInvestments = pick('shortTermInvestments')
  const longTermDebt = pick('longTermDebt')
  const shortTermDebt = pick('shortTermDebt')

  // Share count lives in the DEI namespace on the filing cover page, and its
  // observation dates don't line up with period ends — hence valueAsOf rather
  // than an exact-date lookup.
  const shares = [
    ...firstAvailable(facts, 'dei', ['EntityCommonStockSharesOutstanding'], 'shares'),
  ]
  const sharesFallback = firstAvailable(facts, 'us-gaap', ['CommonStockSharesOutstanding', 'CommonStockSharesIssued'], 'shares')

  const periods = assets.slice(-maxQuarters)
  const quarters = periods.map((a) => {
    const asOf = a.end
    const eq = valueAsOf(equity, asOf)
    const li = valueAsOf(liabilities, asOf)
    return {
      asOf,
      form: a.form || null,
      assets: a.val,
      // Not every filer tags Liabilities directly; it is recoverable from the
      // accounting identity whenever equity is present.
      liabilities: li ?? (eq != null ? a.val - eq : null),
      equity: eq ?? (li != null ? a.val - li : null),
      currentAssets: valueAsOf(currentAssets, asOf),
      currentLiabilities: valueAsOf(currentLiabilities, asOf),
      cash: sumAsOf([cash, shortTermInvestments], asOf),
      debt: sumAsOf([longTermDebt, shortTermDebt], asOf),
      shares: valueAsOf(shares, asOf) ?? valueAsOf(sharesFallback, asOf) ?? nearestValue(shares, asOf) ?? nearestValue(sharesFallback, asOf),
    }
  })

  // The cover-page share count is filed *after* the period it accompanies, so
  // for the newest quarter the as-of lookup often finds nothing. Fall back to
  // the most recent observation overall, which is the current count and the
  // right number for a market cap computed from today's price.
  const newest = quarters[quarters.length - 1]
  if (newest && newest.shares == null) {
    newest.shares = shares.length ? shares[shares.length - 1].val : sharesFallback.length ? sharesFallback[sharesFallback.length - 1].val : null
  }

  return {
    cik: json.cik ?? null,
    entityName: json.entityName ?? null,
    quarters: quarters.filter((q) => q.shares != null && q.equity != null),
  }
}
