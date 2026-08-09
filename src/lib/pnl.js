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

// The price at which a leveraged position loses its entire stake: at Nx, a
// 1/N move against it is fatal. Defined here, in the position-math module,
// and imported by the historical leverage study so both features settle the
// same event by the same rule. Two copies of this logic existed once and
// disagreed — the study counted a position as wiped out while the simulator
// still showed it alive and winning.
//
// Real venues liquidate earlier, at a maintenance margin above zero equity,
// so this threshold is optimistic in the holder's favour.
export function liquidationPrice(entryPrice, direction, leverage) {
  if (leverage <= 1) return direction === 'long' ? 0 : Infinity
  return direction === 'long' ? entryPrice * (1 - 1 / leverage) : entryPrice * (1 + 1 / leverage)
}

// Walks the real price path forward from entry and stops at the first
// session the position would have been wiped out.
//
// Two things a close-to-close check gets wrong:
//
//   1. Liquidation is intraday. A leveraged position dies the moment price
//      *touches* the level, so a session that spikes through it and closes
//      back above still ends the position. Scoring on closes alone reported
//      those as survivors — and as winners if price later recovered.
//   2. Bars at or before the entry date cannot liquidate. The entry price is
//      the close of the last bar at or before entryDate, so that bar's own
//      low happened before the position existed.
export function evaluatePosition({ bars, entryDate, entryPrice, direction, capital, leverage }) {
  const path = bars.filter((b) => b.date > entryDate)
  const liq = liquidationPrice(entryPrice, direction, leverage)

  for (const bar of path) {
    // Fall back to the close for any series lacking intraday extremes.
    const low = bar.low ?? bar.close
    const high = bar.high ?? bar.close
    const wipedOut = direction === 'long' ? low <= liq : high >= liq
    if (wipedOut) {
      return { pnlPct: -100, pnlDollars: -capital, liquidated: true, asOfDate: bar.date, asOfPrice: liq }
    }
  }

  const last = path[path.length - 1]
  const asOfDate = last ? last.date : entryDate
  const asOfPrice = last ? last.close : entryPrice
  return { ...computePnl({ direction, entryPrice, currentPrice: asOfPrice, capital, leverage }), asOfDate, asOfPrice }
}
