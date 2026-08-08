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
