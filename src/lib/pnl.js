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

// Every backtest and simulation on this site assumes you can transact at the
// printed price. That assumption quietly fails as position size grows: an
// order large relative to what actually trades moves the price against itself
// while it fills, so the fill is worse than the quote and the "equity" the
// position is supposedly worth was never obtainable at that mark.
//
// Uses the square-root impact model, the standard empirical approximation:
//
//     impact ≈ c · σ_daily · sqrt(participation rate)
//
// with c ≈ 1. Deliberately rough — real impact depends on the order schedule,
// venue, spread and who else is trading. The purpose is not a precise cost
// estimate but to make visible the point at which "at the printed price"
// stops being a reasonable assumption at all.
export function marketImpactEstimate({ bars, notional, lookback = 20 }) {
  if (!bars?.length || !notional || notional <= 0) return null
  const recent = bars.slice(-lookback)
  const dollarVolumes = recent.map((b) => b.close * (b.volume || 0)).filter((v) => v > 0)
  if (!dollarVolumes.length) return null

  const sorted = [...dollarVolumes].sort((a, b) => a - b)
  const medianDollarVolume = sorted[Math.floor(sorted.length / 2)]

  // Daily volatility from close-to-close returns over the same window.
  const returns = []
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].close > 0) returns.push((recent[i].close - recent[i - 1].close) / recent[i - 1].close)
  }
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const dailyVol = returns.length > 1
    ? Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1))
    : 0

  const participation = notional / medianDollarVolume
  const impactPct = dailyVol * Math.sqrt(participation) * 100

  return {
    notional,
    medianDollarVolume,
    participationPct: participation * 100,
    dailyVolPct: dailyVol * 100,
    impactPct,
    // Below roughly 1% of a day's volume, impact is normally lost in the
    // spread; above 10% the printed-price assumption is not defensible.
    material: participation >= 0.01,
    severe: participation >= 0.1,
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
