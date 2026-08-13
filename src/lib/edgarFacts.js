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

// Income-statement facts are *duration* facts carrying both start and end,
// unlike balance sheet items which are instants. A 10-K reports a 12-month
// figure alongside quarterly ones under the same tag, so without filtering by
// duration a year of revenue gets compared against a quarter of it and the
// year-over-year trend becomes nonsense. Keep only ~3-month periods.
function durationDays(e) {
  if (!e.start || !e.end) return null
  return (Date.parse(e.end) - Date.parse(e.start)) / 86400000
}

function latestQuarterlyByPeriodEnd(entries = []) {
  const byEnd = new Map()
  for (const e of entries) {
    if (!e || typeof e.val !== 'number' || !e.end) continue
    if (e.form && !/^10-[KQ]/.test(e.form)) continue
    const d = durationDays(e)
    if (d == null || d < 75 || d > 115) continue
    const prev = byEnd.get(e.end)
    if (!prev || (e.filed || '') > (prev.filed || '')) byEnd.set(e.end, e)
  }
  return [...byEnd.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0))
}

function firstAvailableQuarterly(facts, tags, unit = 'USD') {
  for (const tag of tags) {
    const units = facts?.['us-gaap']?.[tag]?.units
    if (!units) continue
    const entries = latestQuarterlyByPeriodEnd(units[unit] || [])
    if (entries.length) return entries
  }
  return []
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

// "First tag that yields anything" is the wrong rule once coverage varies.
// A filer that tags StockholdersEquity in two filings and the
// noncontrolling-interest variant in all twelve would resolve to the
// two-entry concept and lose ten quarters — which is exactly what XOM
// looked like, coming back with 2 quarters where every other company had 12.
//
// Priority still wins: the first tag that covers every period being asked
// about is taken immediately, so a higher-priority concept is never passed
// over for a better-covered but semantically different one. Only when no tag
// covers everything does the best-covered one win, and ties keep chain order.
function bestCovering(facts, namespace, tags, unit, dates, lookup = valueAsOf) {
  let best = { entries: [], tag: null, covered: -1 }
  for (const tag of tags) {
    const entries = conceptEntries(facts, namespace, tag, unit)
    if (!entries.length) continue
    const covered = dates.reduce((n, d) => n + (lookup(entries, d) != null ? 1 : 0), 0)
    if (covered === dates.length) return { entries, tag, covered }
    if (covered > best.covered) best = { entries, tag, covered }
  }
  return best
}

function bestCoveringQuarterly(facts, tags, unit, dates) {
  let best = { entries: [], tag: null, covered: -1 }
  for (const tag of tags) {
    const units = facts?.['us-gaap']?.[tag]?.units
    if (!units) continue
    const entries = latestQuarterlyByPeriodEnd(units[unit] || [])
    if (!entries.length) continue
    const covered = dates.reduce((n, d) => n + (entries.some((e) => e.end === d) ? 1 : 0), 0)
    if (covered === dates.length) return { entries, tag, covered }
    if (covered > best.covered) best = { entries, tag, covered }
  }
  return best
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
  assets: ['Assets', 'AssetsNet'],
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

// Income-statement concepts, for the "is the business improving?" layer.
export const INCOME_CONCEPTS = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    // Banks report revenue net of interest expense; without this the whole
    // financials sector comes back with no revenue at all.
    'RevenuesNetOfInterestExpense',
    'InterestAndDividendIncomeOperating',
  ],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
}

// Share counts, in order of preference.
//
// companyfacts only carries facts with no dimensional breakdown. A filer with
// multiple share classes reports the cover-page count per class, on a class
// axis, so for those companies the consolidated count is simply absent from
// this API — the first three chains all come back empty and every quarter is
// dropped for a null share count. META has failed this way for every run
// since fundamentals were added.
//
// Weighted-average shares are the escape hatch: they come off the income
// statement, are always undimensioned, and are already consolidated across
// classes. They are an average over the period rather than a count at the end
// of it, so they are a slightly different number and deliberately last — but a
// market cap within a fraction of a percent beats no fundamental layer at all.
export const SHARE_CONCEPTS = {
  dei: ['EntityCommonStockSharesOutstanding'],
  usGaap: ['CommonStockSharesOutstanding', 'CommonStockSharesIssued'],
  weightedAverage: [
    'WeightedAverageNumberOfDilutedSharesOutstanding',
    'WeightedAverageNumberOfSharesOutstandingBasic',
    'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
  ],
}

export function parseCompanyFacts(json, { maxQuarters = 12 } = {}) {
  const built = build(json, { maxQuarters })
  if (!built) return null
  return { cik: built.cik, entityName: built.entityName, quarters: built.quarters }
}

// Same work as parseCompanyFacts, but reports which concept each chain
// resolved to and where the quarters went. "No usable balance sheet" on its
// own is unactionable — the cause is always either a missing concept or a
// sparse one, and naming it turns a recurring mystery into a one-line fix.
export function diagnoseCompanyFacts(json, { maxQuarters = 12 } = {}) {
  if (!json?.facts) return { reason: 'no facts in response', concepts: {}, available: [] }
  const built = build(json, { maxQuarters })
  const available = Object.keys(json.facts['us-gaap'] ?? {})
  if (!built) {
    return {
      reason: 'no Assets concept with 10-K/Q entries',
      concepts: {},
      available: available.filter((k) => /^Assets/.test(k)),
    }
  }
  return {
    reason: built.quarters.length ? null : 'every period dropped',
    concepts: built.chosen,
    periods: built.periodCount,
    kept: built.quarters.length,
    droppedNoShares: built.droppedNoShares,
    droppedNoEquity: built.droppedNoEquity,
    available: [],
  }
}

function build(json, { maxQuarters }) {
  const facts = json?.facts
  if (!facts) return null

  // Assets defines the period grid every other concept is measured against,
  // so it is chosen on raw coverage before any target dates exist.
  const assetPick = CONCEPTS.assets
    .map((tag) => ({ tag, entries: conceptEntries(facts, 'us-gaap', tag, 'USD') }))
    .filter((c) => c.entries.length)
    .sort((a, b) => b.entries.length - a.entries.length)[0]
  if (!assetPick) return null
  const assets = assetPick.entries

  const periods = assets.slice(-maxQuarters)
  const dates = periods.map((a) => a.end)
  const chosen = { assets: assetPick.tag }

  const pick = (key) => {
    const r = bestCovering(facts, 'us-gaap', CONCEPTS[key], 'USD', dates)
    chosen[key] = r.tag ? `${r.tag} (${r.covered}/${dates.length})` : null
    return r.entries
  }

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
  const shares = firstAvailable(facts, 'dei', SHARE_CONCEPTS.dei, 'shares')
  const sharesFallback = firstAvailable(facts, 'us-gaap', SHARE_CONCEPTS.usGaap, 'shares')
  // Only consulted when the two above cannot answer — see SHARE_CONCEPTS.
  const sharesWeighted = bestCovering(facts, 'us-gaap', SHARE_CONCEPTS.weightedAverage, 'shares', dates)
  chosen.shares = shares.length
    ? 'dei:EntityCommonStockSharesOutstanding'
    : sharesFallback.length
    ? 'us-gaap:CommonStockShares*'
    : sharesWeighted.tag
    ? `us-gaap:${sharesWeighted.tag} (weighted average)`
    : null

  const revenuePick = bestCoveringQuarterly(facts, INCOME_CONCEPTS.revenue, 'USD', dates)
  const netIncomePick = bestCoveringQuarterly(facts, INCOME_CONCEPTS.netIncome, 'USD', dates)
  chosen.revenue = revenuePick.tag ? `${revenuePick.tag} (${revenuePick.covered}/${dates.length})` : null
  chosen.netIncome = netIncomePick.tag ? `${netIncomePick.tag} (${netIncomePick.covered}/${dates.length})` : null
  const revenue = revenuePick.entries
  const netIncome = netIncomePick.entries
  // Exact-date lookup here, not as-of: a quarter's revenue belongs to that
  // quarter, and silently borrowing an adjacent period's figure would corrupt
  // the year-over-year comparison this data exists to support.
  const exact = (entries, date) => entries.find((e) => e.end === date)?.val ?? null

  // A market cap built from weighted-average shares is a slightly different
  // number from one built from the cover-page count, and the UI would render
  // the two identically. Whichever was used is recorded so the page can say
  // so — only when it is the approximation, to keep the payload clean.
  const sharesFor = (asOf) => {
    const exactCount =
      valueAsOf(shares, asOf) ??
      valueAsOf(sharesFallback, asOf) ??
      nearestValue(shares, asOf) ??
      nearestValue(sharesFallback, asOf)
    if (exactCount != null) return { shares: exactCount }
    const weighted = valueAsOf(sharesWeighted.entries, asOf)
    return weighted != null ? { shares: weighted, sharesBasis: 'weighted-average' } : { shares: null }
  }

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
      ...sharesFor(asOf),
      revenue: exact(revenue, asOf),
      netIncome: exact(netIncome, asOf),
    }
  })

  // The cover-page share count is filed *after* the period it accompanies, so
  // for the newest quarter the as-of lookup often finds nothing. Fall back to
  // the most recent observation overall, which is the current count and the
  // right number for a market cap computed from today's price.
  const newest = quarters[quarters.length - 1]
  if (newest && newest.shares == null) {
    const latestOf = (entries) => (entries.length ? entries[entries.length - 1].val : null)
    newest.shares = latestOf(shares) ?? latestOf(sharesFallback)
    if (newest.shares == null) {
      newest.shares = latestOf(sharesWeighted.entries)
      if (newest.shares != null) newest.sharesBasis = 'weighted-average'
    }
  }

  const kept = quarters.filter((q) => q.shares != null && q.equity != null)

  return {
    cik: json.cik ?? null,
    entityName: json.entityName ?? null,
    quarters: kept,
    // Diagnostics — see diagnoseCompanyFacts. Stripped by parseCompanyFacts so
    // none of this reaches the committed JSON.
    chosen,
    periodCount: periods.length,
    droppedNoShares: quarters.filter((q) => q.shares == null).length,
    droppedNoEquity: quarters.filter((q) => q.equity == null).length,
  }
}
