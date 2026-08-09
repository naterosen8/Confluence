// Pure P&L math for a hypothetical, user-chosen position — the app never
// picks direction or leverage, only computes what a trade the user decided
// on their own would have done. Losses are clamped at -100% and flagged as
// "liquidated" rather than shown going negative-beyond-capital, because
// that clamp point — not a bigger number — is the actual lesson leverage
// teaches: a leveraged position can be wiped out entirely, and fast.
export function computePnl({ direction, entryPrice, currentPrice, capital, leverage }) {
  const dirMult = direction === 'long' ? 1 : -1
  let pnlPct = dirMult * leverage * ((currentPrice - entryPrice) / entryPrice)
  const liquidated = pnlPct <= -1
  if (liquidated) pnlPct = -1
  return {
    pnlPct: pnlPct * 100,
    pnlDollars: capital * pnlPct,
    liquidated,
  }
}

// A single current-price check misses this: a highly-leveraged position can
// cross -100% mid-trade and then recover before anyone looks, which would
// otherwise get recorded as a win. This walks the real daily closes from
// entry forward and stops at the first day the position would have been
// wiped out — that day's price is the honest outcome, not whatever the
// price happens to be whenever the user next opens the app.
export function evaluatePosition({ bars, entryDate, entryPrice, direction, capital, leverage }) {
  const path = bars.filter((b) => b.date >= entryDate)
  for (const bar of path) {
    const result = computePnl({ direction, entryPrice, currentPrice: bar.close, capital, leverage })
    if (result.liquidated) {
      return { ...result, asOfDate: bar.date, asOfPrice: bar.close }
    }
  }
  const last = path[path.length - 1]
  const asOfDate = last ? last.date : entryDate
  const asOfPrice = last ? last.close : entryPrice
  return { ...computePnl({ direction, entryPrice, currentPrice: asOfPrice, capital, leverage }), asOfDate, asOfPrice }
}
