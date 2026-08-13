// What the balance sheet and the income statement currently say, as a
// sentence rather than a row of bullet points.
//
// The confluence panel already lists the mechanical facts — revenue up 16.4%,
// net cash 8% of market cap — and a list of facts is not a read. What kind of
// business this is, and where the risk in the equity sits, are questions the
// same numbers answer once someone puts them together.
//
// Strictly a claim about now, and about a "now" that is up to a quarter stale
// by construction: these are filed figures, and the read says so.

const pct = (n, dp = 0) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(dp)}%`

// Ordered so the most consequential structure wins. Capital structure first —
// whether the equity is the thin end of a levered balance sheet decides how to
// read everything else about it.
const PATTERNS = [
  {
    key: 'levered',
    test: (c) => c.netCashPct != null && c.netCashPct < -30,
    headline: 'Leveraged balance sheet',
    read: (c) =>
      `Net debt runs to ${pct(Math.abs(c.netCashPct))} of market cap. The equity is the thin end of this capital structure: lenders are ahead of it, and a given swing in enterprise value lands on a smaller base than the share price alone suggests.`,
  },
  {
    key: 'below-ncav',
    test: (c) => c.ncav != null && c.marketCap != null && c.ncav > c.marketCap,
    headline: 'Trading below net current assets',
    read: () =>
      `Market cap sits below current assets less every liability — the deep-value screen Graham wrote about, and one that almost always fires because the market expects those assets to be consumed by losses rather than because nobody noticed.`,
  },
  {
    key: 'cash-fortress',
    test: (c) => c.netCashPct != null && c.netCashPct > 15,
    headline: 'Net cash covers a real share of the market cap',
    read: (c) =>
      `Cash and short-term investments exceed all debt by ${pct(c.netCashPct)} of market cap, so the operating business is being priced at correspondingly less than the share price implies. That cash is not necessarily distributable — it can be committed, held overseas, or a regulatory buffer.`,
  },
  {
    key: 'below-book',
    test: (c) => c.priceToBook != null && c.priceToBook < 1,
    headline: 'Priced under accounting book value',
    read: (c) =>
      `At ${c.priceToBook.toFixed(2)}× book the market is paying less than the balance sheet carries. For a bank or an insurer that is a meaningful statement about expected write-downs; for most other businesses it usually means the carrying values themselves are in question.`,
  },
  {
    key: 'compounding',
    test: (c) => c.revenueYoY > 0 && c.incomeYoY > 0,
    headline: 'Growing and converting it',
    read: (c) =>
      `Revenue up ${pct(c.revenueYoY, 1)} year over year and net income up ${pct(c.incomeYoY, 1)} — growth reaching the bottom line rather than being spent to buy the top one. At ${c.priceToBook != null ? `${c.priceToBook.toFixed(1)}× book ` : ''}the price already reflects some expectation that it continues.`,
  },
  {
    key: 'margin-squeeze',
    test: (c) => c.revenueYoY > 0 && c.incomeYoY < 0,
    headline: 'Growing, but not to the bottom line',
    read: (c) =>
      `Revenue up ${pct(c.revenueYoY, 1)} while net income fell ${pct(Math.abs(c.incomeYoY), 1)}. Growth is being bought — through spending, pricing, mix or a one-off charge — and the filing does not distinguish those from each other.`,
  },
  {
    key: 'contracting',
    test: (c) => c.revenueYoY < 0 && c.incomeYoY < 0,
    headline: 'Contracting on both lines',
    read: (c) =>
      `Revenue down ${pct(Math.abs(c.revenueYoY), 1)} and net income down ${pct(Math.abs(c.incomeYoY), 1)} against the same quarter a year ago. Both directions negative is the plainest version of a business shrinking, whatever the chart is doing.`,
  },
  {
    key: 'cost-cutting',
    test: (c) => c.revenueYoY < 0 && c.incomeYoY > 0,
    headline: 'Shrinking revenue, rising profit',
    read: (c) =>
      `Revenue down ${pct(Math.abs(c.revenueYoY), 1)} while net income rose ${pct(c.incomeYoY, 1)}. Profit improving on a smaller base is what cost reduction looks like in a filing, and it is not something that can repeat indefinitely.`,
  },
  {
    key: 'asset-light',
    test: (c) => c.priceToBook != null && c.priceToBook > 5,
    headline: 'Most of the value is off the balance sheet',
    read: (c) =>
      `At ${c.priceToBook.toFixed(1)}× book, the great majority of what the market is paying for is not on the balance sheet at all — brands, software built in-house, research and customer relationships are largely absent from it. Normal for this kind of business, and it means book value tells you very little here.`,
  },
]

export function readFundamentals({ valuation, trend }) {
  if (!valuation) return null

  const ctx = {
    priceToBook: valuation.priceToBook ?? null,
    netCashPct: valuation.netCashPctOfMarketCap ?? null,
    marketCap: valuation.marketCap ?? null,
    ncav: valuation.ncav ?? null,
    revenueYoY: trend?.revenueYoY ?? null,
    incomeYoY: trend?.incomeYoY ?? null,
  }

  const pattern = PATTERNS.find((p) => {
    try {
      return p.test(ctx)
    } catch {
      return false
    }
  })
  if (!pattern) return null

  return {
    key: pattern.key,
    headline: pattern.headline,
    read: pattern.read(ctx),
    asOf: valuation.asOf ?? null,
    caveat: valuation.asOf
      ? `From the filing dated ${valuation.asOf}, which can be up to a quarter behind the price it is being compared against.`
      : 'From the latest filing, which can be up to a quarter behind the price it is being compared against.',
  }
}
