// Balance-sheet-versus-market-cap math. The question this answers is narrow
// and worth stating precisely: what does the accounting say the equity is
// worth, what is the market paying for it, and how big is the gap?
//
// What it deliberately does NOT answer is whether that gap is an opportunity.
// A low price-to-book is at least as often a market correctly marking down
// assets it expects to be impaired as it is a mispricing, and book value
// omits essentially everything valuable about an asset-light business. The
// classifier below therefore describes the disparity and its known caveats;
// it never rates the security.

export const NET_NET_THRESHOLD = 2 / 3

export function balanceSheetValuation({ price, quarter }) {
  if (!quarter || !price || !quarter.shares) return null

  const { shares, assets, liabilities, equity, currentAssets, cash, debt, asOf, form } = quarter
  const marketCap = price * shares
  const bookEquity = equity ?? (assets != null && liabilities != null ? assets - liabilities : null)
  if (bookEquity == null) return null

  const netCash = (cash ?? 0) - (debt ?? 0)
  // Graham's net current asset value: current assets alone, minus ALL
  // liabilities. Long-term assets are assigned zero, which is why clearing
  // this bar is rare and meaningful.
  const ncav = currentAssets != null && liabilities != null ? currentAssets - liabilities : null

  const hasPositiveBook = bookEquity > 0
  const priceToBook = hasPositiveBook ? marketCap / bookEquity : null

  return {
    asOf,
    form,
    price,
    shares,
    marketCap,
    bookEquity,
    bookValuePerShare: bookEquity / shares,
    priceToBook,
    // The disparity itself, in the units people actually think in: how much
    // more (or less) the market is paying than the accounting equity.
    premiumToBook: hasPositiveBook ? marketCap - bookEquity : null,
    premiumPct: hasPositiveBook ? (marketCap / bookEquity - 1) * 100 : null,
    netCash,
    netCashPerShare: netCash / shares,
    netCashPctOfMarketCap: (netCash / marketCap) * 100,
    enterpriseValue: marketCap - netCash,
    ncav,
    ncavPerShare: ncav != null ? ncav / shares : null,
    isNetNet: ncav != null && ncav > 0 && marketCap < ncav * NET_NET_THRESHOLD,
    hasPositiveBook,
  }
}

// Describes the gap in plain terms plus the caveat that actually applies to
// this case. Every branch carries its own counter-argument on purpose — a
// bare "trading below book value" reads as a recommendation, and it isn't one.
export function classifyValuation(v) {
  if (!v) return null

  if (!v.hasPositiveBook) {
    return {
      key: 'negative-equity',
      headline: 'Book value is negative — price-to-book does not apply',
      detail:
        'Liabilities exceed assets on the balance sheet, so there is no positive equity to compare the market cap against. This is common and not automatically alarming: sustained buybacks can drive book equity below zero at profitable companies. It does mean this particular ratio carries no information here.',
    }
  }

  if (v.isNetNet) {
    return {
      key: 'net-net',
      headline: 'Market cap is below net current asset value',
      detail:
        "The market is paying less than current assets minus all liabilities, assigning zero to every long-term asset. This is genuinely rare. It is also the classic profile of a business the market expects to burn through those assets, so the screen is a starting point for investigation, not a conclusion.",
    }
  }

  if (v.netCash > v.marketCap) {
    return {
      key: 'net-cash-exceeds-cap',
      headline: 'Net cash exceeds the entire market cap',
      detail:
        'Cash and equivalents minus all debt are worth more than the whole company at this price, implying the market assigns negative value to the operating business. Usually that reflects an expectation that the cash will be consumed, or that shareholders will never see it.',
    }
  }

  if (v.priceToBook < 1) {
    return {
      key: 'below-book',
      headline: `Market cap is ${((1 - v.priceToBook) * 100).toFixed(0)}% below book equity`,
      detail:
        'The market is valuing the equity below what the balance sheet carries it at. That gap is only an opportunity if the carrying values are honest — the same signal appears when assets are about to be written down, so it is a question to investigate rather than an answer.',
    }
  }

  if (v.priceToBook < 1.5) {
    return {
      key: 'near-book',
      headline: 'Market cap is close to book equity',
      detail:
        'The market is paying roughly what the balance sheet says the equity is worth. For asset-heavy businesses this is the usual anchor; for asset-light ones it is unusual and worth understanding.',
    }
  }

  return {
    key: 'above-book',
    headline: `Market cap is ${v.priceToBook.toFixed(1)}× book equity`,
    detail:
      'The market is paying well above accounting book value. For software, pharma, brands and other asset-light businesses this is normal rather than a warning — the assets that generate the earnings (code, patents, distribution, brand) are largely absent from the balance sheet. Book value is a weak yardstick here; it is far more informative for banks, insurers and holding companies.',
  }
}

// Price-to-book across the tracked quarters, each one using the book value
// that was actually reported for that quarter against the price on (or last
// before) the day it closed. Using today's book value with past prices would
// just replot the price chart, which would look like analysis and mean
// nothing.
export function priceToBookHistory({ quarters, bars }) {
  if (!quarters?.length || !bars?.length) return []
  const history = []
  for (const q of quarters) {
    if (!q.shares || q.equity == null || q.equity <= 0) continue
    let close = null
    for (const bar of bars) {
      if (bar.date <= q.asOf) close = bar.close
      else break
    }
    if (close == null) continue
    history.push({ asOf: q.asOf, priceToBook: (close * q.shares) / q.equity, price: close })
  }
  return history
}

export function summarizeHistory(history, current) {
  if (!history.length || current == null) return null
  const values = history.map((h) => h.priceToBook)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const below = values.filter((v) => v < current).length
  return {
    min,
    max,
    median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
    percentile: (below / values.length) * 100,
    sampleSize: values.length,
  }
}
