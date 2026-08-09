import { smaSeries, findSwingPoints, relativeVolume, computeSignals } from './indicators'
import { balanceSheetValuation } from './mnav'

// ---------------------------------------------------------------------------
// Why this file exists, and why the app is called Confluence.
//
// A confluence is where separate streams meet. The premise of the name is
// that a single indicator is mostly noise, and that agreement between
// genuinely *independent* sources of evidence is worth more than the sum of
// its parts.
//
// The uncomfortable part, which this app previously glossed over: the
// technical checks are not independent of one another. Trend, MACD, and
// price-versus-average are three readings of the same price series, so they
// agree with each other almost by construction. Stacking them produces a
// bigger number, not more evidence — the confluence was an illusion.
//
// Real confluence needs streams that can actually disagree, because they are
// measuring different things:
//
//   Technical   — what price and volume are doing now (breakout, participation,
//                 position against structural support)
//   Fundamental — whether the business underneath is improving (earnings
//                 direction, what the balance sheet supports)
//   Macro       — whether the tide is coming in or going out (the price of
//                 money, and appetite for risk)
//
// A setup where all three point the same way is a materially different claim
// from three momentum indicators agreeing. This module scores each layer
// separately and refuses to blend them into a single number when a layer has
// no data behind it — a missing layer is reported as missing, never as
// neutral, because "we don't know" and "it's balanced" are different states
// and conflating them is how a two-layer reading gets mistaken for a
// three-layer one.
// ---------------------------------------------------------------------------

export const CONFLUENCE_NAME = {
  term: 'Confluence',
  what: 'The point where separate streams meet. Here: technical, fundamental and macro evidence considered together.',
  why: 'One indicator on its own is mostly noise. The premise of the name is that agreement between independent kinds of evidence carries more weight than any single reading — and, just as importantly, that disagreement between them is a warning the site should show you rather than average away.',
  caveat:
    'Agreement is not proof. Independent streams can be wrong together, particularly at turning points, and three layers pointing the same way is a common feature of the top of a cycle. The site reports the alignment; it does not promise an outcome.',
}

// --- Technical layer -------------------------------------------------------

// A breakout worth the name is price clearing a level the market has actually
// defended, with participation behind it. Price alone clearing a line is the
// most commonly faked signal there is, so volume confirmation is required
// rather than optional, and the two are reported separately so a breakout on
// thin volume is visibly a weaker thing.
export function detectBreakout(bars, { lookback = 150, volumeThreshold = 1.3, crossWindow = 20 } = {}) {
  if (!bars || bars.length < 30) return null
  const recent = bars.slice(-lookback)
  const price = bars[bars.length - 1].close
  const { highs, lows } = findSwingPoints(recent, 3)

  // The most recent swing high strictly below today's price is the level just
  // cleared; the nearest one above is the level still overhead.
  const cleared = highs.filter((h) => h.price < price).sort((a, b) => b.price - a.price)[0] || null
  const overhead = highs.filter((h) => h.price > price).sort((a, b) => a.price - b.price)[0] || null
  const support = lows.filter((l) => l.price < price).sort((a, b) => b.price - a.price)[0] || null

  const relVol = relativeVolume(bars)
  // Some feeds report no volume at all for certain instruments (spot crypto
  // pairs on this provider return zero). "Unconfirmed" would wrongly imply we
  // looked and found weak participation; the honest state is that volume is
  // unavailable, and the two must not be collapsed.
  const volumeAvailable = relVol != null
  const confirmed = volumeAvailable && relVol >= volumeThreshold

  // What has to be recent is the *crossing*, not the level. A ceiling the
  // market defended for a year and only just gave way is the most meaningful
  // breakout there is, so ageing out old levels would discard exactly the
  // cases worth finding. Instead: price is above a former resistance, and was
  // still below it inside the recent window.
  const crossedRecently =
    cleared != null && recent.slice(-crossWindow).some((b) => b.close <= cleared.price)
  const distanceToSupport = support ? ((price - support.price) / price) * 100 : null

  return {
    price,
    isBreakout: Boolean(cleared && price > cleared.price && crossedRecently),
    volumeConfirmed: confirmed,
    volumeAvailable,
    relVolume: relVol,
    clearedLevel: cleared,
    overheadLevel: overhead,
    support,
    distanceToSupportPct: distanceToSupport,
    // Sitting just above a defended level is a structurally different
    // position from being extended far above one, whatever the momentum says.
    nearSupport: distanceToSupport != null && distanceToSupport <= 3,
  }
}

export function technicalLayer(bars) {
  if (!bars || bars.length < 60) return { available: false, reason: 'Not enough price history yet.' }
  const signals = computeSignals(bars)
  const breakout = detectBreakout(bars)
  const closes = bars.map((b) => b.close)
  const sma50 = smaSeries(closes, 50).at(-1)

  const reasons = []
  let score = 0

  if (breakout?.isBreakout) {
    const level = `$${breakout.clearedLevel.price.toFixed(2)}`
    if (breakout.volumeConfirmed) {
      score += 2
      reasons.push({
        direction: 'up',
        text: `Cleared the ${level} swing high on ${breakout.relVolume.toFixed(1)}× average volume`,
      })
    } else if (breakout.volumeAvailable) {
      score += 1
      reasons.push({
        direction: 'up',
        text: `Cleared the ${level} swing high, but on only ${breakout.relVolume.toFixed(1)}× average volume — participation has not confirmed it`,
      })
    } else {
      // No volume credit either way: the check could not be run.
      score += 1
      reasons.push({
        direction: 'up',
        text: `Cleared the ${level} swing high — no volume data for this instrument, so participation could not be checked either way`,
      })
    }
  }

  if (breakout?.nearSupport) {
    score += 1
    reasons.push({
      direction: 'up',
      text: `Sitting ${breakout.distanceToSupportPct.toFixed(1)}% above the $${breakout.support.price.toFixed(2)} swing low — a defined level to fail against`,
    })
  }

  if (sma50 != null) {
    const above = signals.price > sma50
    score += above ? 1 : -1
    reasons.push({
      direction: above ? 'up' : 'down',
      text: above ? 'Price above its 50-day average' : 'Price below its 50-day average',
    })
  }

  if (signals.divergence.highUnconfirmed) {
    score -= 2
    reasons.push({ direction: 'down', text: 'Price set a new high that momentum did not confirm' })
  }
  if (signals.divergence.lowUnconfirmed) {
    score += 2
    reasons.push({ direction: 'up', text: 'Price set a new low that momentum did not confirm' })
  }

  return { available: true, score, lean: leanOf(score), reasons, breakout, signals }
}

// --- Fundamental layer -----------------------------------------------------

// "Improving" is a direction, not a level. A company earning less than last
// year while its stock rallies is a different proposition from one compounding
// earnings, and neither is captured by a price chart at all — which is the
// entire point of having this layer.
export function earningsTrend(quarters) {
  if (!quarters || quarters.length < 5) return null

  // Year-over-year rather than sequential: quarterly results are seasonal, and
  // comparing Q4 to Q3 mostly measures the calendar.
  //
  // Matched by DATE, not by array position. Quarterly income figures have real
  // gaps — a fiscal-year-end quarter is usually only reported inside the
  // annual total, so filers routinely show 6 of 8 quarters. Taking "four
  // entries back" from a compacted array then silently compares against five
  // or six quarters ago, which is not a year-over-year comparison at all and
  // is impossible to spot in the output.
  const yoy = (key) => {
    const withValue = quarters.filter((q) => q[key] != null)
    if (withValue.length < 2) return null
    const latest = withValue[withValue.length - 1]
    const target = Date.parse(latest.asOf) - 365 * 86400000

    let best = null
    let bestGap = Infinity
    for (const q of withValue.slice(0, -1)) {
      const gap = Math.abs(Date.parse(q.asOf) - target)
      if (gap < bestGap) {
        bestGap = gap
        best = q
      }
    }
    // Only accept a genuine year-ago comparison; anything further out is a
    // different question and is reported as unavailable instead.
    if (!best || bestGap > 45 * 86400000 || best[key] === 0) return null
    return { pct: ((latest[key] - best[key]) / Math.abs(best[key])) * 100, from: best.asOf, to: latest.asOf }
  }

  const rev = yoy('revenue')
  const inc = yoy('netIncome')
  return {
    revenueYoY: rev ? rev.pct : null,
    revenuePeriod: rev ? `${rev.from} → ${rev.to}` : null,
    incomeYoY: inc ? inc.pct : null,
    incomePeriod: inc ? `${inc.from} → ${inc.to}` : null,
    latestAsOf: quarters[quarters.length - 1].asOf,
  }
}

export function fundamentalLayer({ company, price }) {
  if (!company?.quarters?.length) {
    return { available: false, reason: 'No filings synced for this company yet.' }
  }
  const latest = company.quarters[company.quarters.length - 1]
  const valuation = balanceSheetValuation({ price, quarter: latest })
  const trend = earningsTrend(company.quarters)

  const reasons = []
  let score = 0

  if (trend?.revenueYoY != null) {
    const up = trend.revenueYoY > 0
    score += up ? 1 : -1
    reasons.push({
      direction: up ? 'up' : 'down',
      text: `Revenue ${up ? 'up' : 'down'} ${Math.abs(trend.revenueYoY).toFixed(1)}% year over year`,
    })
  }

  if (trend?.incomeYoY != null) {
    const up = trend.incomeYoY > 0
    score += up ? 1 : -1
    reasons.push({
      direction: up ? 'up' : 'down',
      text: `Net income ${up ? 'up' : 'down'} ${Math.abs(trend.incomeYoY).toFixed(1)}% year over year`,
    })
  }

  if (valuation?.netCash != null && valuation.marketCap) {
    const pct = (valuation.netCash / valuation.marketCap) * 100
    if (pct > 10) {
      score += 1
      reasons.push({ direction: 'up', text: `Net cash is ${pct.toFixed(0)}% of market cap — balance sheet carries the downside` })
    } else if (pct < -30) {
      score -= 1
      reasons.push({ direction: 'down', text: `Net debt is ${Math.abs(pct).toFixed(0)}% of market cap — leverage on the business itself` })
    }
  }

  if (!reasons.length) {
    return { available: false, reason: 'Filings synced, but not enough comparable quarters to judge a trend.' }
  }

  return { available: true, score, lean: leanOf(score), reasons, valuation, trend }
}

// --- Macro layer -----------------------------------------------------------

// Rather than a separate economic data feed, this reads the price of two
// instruments the app already syncs. Bond and credit markets price the cost
// of money and the appetite for risk continuously, and they are genuinely
// independent of any single company's chart:
//
//   TLT rising  -> long rates falling  -> financial conditions easing
//   HYG rising  -> credit spreads tightening -> liquidity and risk appetite present
//
// A proxy, not a measurement. It says what markets are currently pricing, not
// what policy will do.
export function macroLayer({ tltBars, hygBars, lookback = 60 }) {
  const trendOf = (bars) => {
    if (!bars || bars.length < lookback + 1) return null
    const closes = bars.map((b) => b.close)
    const now = closes[closes.length - 1]
    const then = closes[closes.length - 1 - lookback]
    const sma = smaSeries(closes, 50).at(-1)
    return { changePct: ((now - then) / then) * 100, aboveTrend: sma != null ? now > sma : null }
  }

  const rates = trendOf(tltBars)
  const credit = trendOf(hygBars)
  if (!rates && !credit) return { available: false, reason: 'Macro proxies (TLT, HYG) not synced yet.' }

  const reasons = []
  let score = 0

  if (rates) {
    const easing = rates.changePct > 0
    score += easing ? 1 : -1
    reasons.push({
      direction: easing ? 'up' : 'down',
      text: easing
        ? `Long bonds up ${rates.changePct.toFixed(1)}% over ${lookback} sessions — long rates falling, conditions easing`
        : `Long bonds down ${Math.abs(rates.changePct).toFixed(1)}% over ${lookback} sessions — long rates rising, conditions tightening`,
    })
  }

  if (credit) {
    const risky = credit.changePct > 0
    score += risky ? 1 : -1
    reasons.push({
      direction: risky ? 'up' : 'down',
      text: risky
        ? `High-yield credit up ${credit.changePct.toFixed(1)}% — spreads tightening, risk appetite present`
        : `High-yield credit down ${Math.abs(credit.changePct).toFixed(1)}% — spreads widening, liquidity retreating`,
    })
  }

  return { available: true, score, lean: leanOf(score), reasons, rates, credit }
}

function leanOf(score) {
  if (score >= 2) return 'points up'
  if (score <= -2) return 'points down'
  if (score > 0) return 'leans up'
  if (score < 0) return 'leans down'
  return 'split'
}

// --- Combination -----------------------------------------------------------

// Deliberately does NOT produce a single number. Summing three layers of
// different units into one score is precisely the false precision this file
// exists to avoid — and it would let a strong technical reading paper over an
// absent fundamental one. What it reports instead is how many layers are
// available, which way each leans, and whether they agree.
export function combineLayers({ technical, fundamental, macro }) {
  const layers = [
    { key: 'technical', label: 'Technical', ...technical },
    { key: 'fundamental', label: 'Fundamental', ...fundamental },
    { key: 'macro', label: 'Macro', ...macro },
  ]
  const available = layers.filter((l) => l.available)
  const leans = available.map((l) => (l.score > 0 ? 1 : l.score < 0 ? -1 : 0))
  const bullish = leans.filter((v) => v > 0).length
  const bearish = leans.filter((v) => v < 0).length

  let alignment = 'mixed'
  if (available.length === 0) alignment = 'unknown'
  else if (bearish === 0 && bullish === available.length) alignment = 'aligned-up'
  else if (bullish === 0 && bearish === available.length) alignment = 'aligned-down'
  else if (bullish > 0 && bearish > 0) alignment = 'conflicting'

  return {
    layers,
    availableCount: available.length,
    totalLayers: layers.length,
    missing: layers.filter((l) => !l.available).map((l) => l.label),
    bullish,
    bearish,
    alignment,
    // The honest headline. Three layers agreeing is a real observation; two
    // layers agreeing while the third is simply absent is not the same thing,
    // and must never be presented as though it were.
    complete: available.length === layers.length,
  }
}
