import { smaSeries, atrPercentile } from './indicators.js'
import { macroQuadrant } from './macroRead.js'

// One read of the whole tape, for the top of the screener.
//
// Every other number on the site describes one ticker. None of them answered
// the first question a person actually has when they open a screener: what
// kind of market is this right now. Twenty-four rows of individually-correct
// readings do not add up to that on their own — and the answer changes how
// every row below should be taken, because in a narrow tape most of those
// "trend intact" labels are the same trade wearing different tickers.
//
// Strictly a claim about now. Breadth, position against trend and the price of
// risk are all facts about the present tape, measured not guessed. Nothing
// here says what comes next.

// The share of tracked equities holding above their own 50-day average. This
// is the one number that separates a broad advance from an index carried by a
// handful of names, and no individual ticker page can show it.
export function breadthOf({ barsBySymbol, tickers }) {
  let above = 0
  let counted = 0
  for (const t of tickers) {
    if (t.kind === 'macro') continue
    const bars = barsBySymbol[t.symbol]
    if (!bars || bars.length < 50) continue
    const sma50 = smaSeries(bars.map((b) => b.close), 50).at(-1)
    if (sma50 == null) continue
    counted++
    if (bars.at(-1).close > sma50) above++
  }
  return counted ? { above, counted, pct: (above / counted) * 100 } : null
}

function trendOf(bars) {
  if (!bars || bars.length < 200) return null
  const closes = bars.map((b) => b.close)
  const price = closes.at(-1)
  const sma50 = smaSeries(closes, 50).at(-1)
  const sma200 = smaSeries(closes, 200).at(-1)
  if (sma50 == null || sma200 == null) return null
  return { price, sma50, sma200, aboveBoth: price > sma50 && price > sma200, golden: sma50 > sma200 }
}

// Change over a window, as a percentage. Used on the two macro proxies, where
// direction is the whole signal.
function changePct(bars, lookback = 60) {
  if (!bars || bars.length < lookback + 1) return null
  const now = bars.at(-1).close
  const then = bars.at(-1 - lookback).close
  return then ? ((now - then) / then) * 100 : null
}

export function marketRead({ barsBySymbol, tickers }) {
  const spy = barsBySymbol.SPY
  const spyTrend = trendOf(spy)
  const breadth = breadthOf({ barsBySymbol, tickers })
  const vol = spy ? atrPercentile(spy) : null
  const ratesPct = changePct(barsBySymbol.TLT)
  const creditPct = changePct(barsBySymbol.HYG)

  if (!spyTrend || !breadth) return null

  const parts = []

  // Index position first, because it is the frame everything else sits in.
  if (spyTrend.aboveBoth && spyTrend.golden) {
    parts.push('The index is above both its 50- and 200-day averages with the 50 above the 200 — an uptrend by every conventional definition.')
  } else if (!spyTrend.aboveBoth && !spyTrend.golden) {
    parts.push('The index is below its major averages with the 50-day under the 200 — a downtrend by every conventional definition.')
  } else {
    parts.push('The index is caught between its major averages, which is the condition trend-following does worst in.')
  }

  // Breadth, and the disagreement between breadth and the index when there is
  // one. That divergence is the most informative thing here and it is
  // invisible on any single ticker page.
  const b = breadth.pct
  if (b >= 70) {
    parts.push(`Breadth is broad: ${breadth.above} of ${breadth.counted} tracked names hold above their own 50-day.`)
  } else if (b <= 30) {
    parts.push(`Breadth is narrow: only ${breadth.above} of ${breadth.counted} tracked names hold above their own 50-day.`)
  } else {
    parts.push(`Breadth is mixed — ${breadth.above} of ${breadth.counted} tracked names above their own 50-day.`)
  }
  if (spyTrend.aboveBoth && b < 50) {
    parts.push('The index is holding up while most individual names are not, which means the average is being carried by a few of them.')
  }
  if (!spyTrend.aboveBoth && b > 60) {
    parts.push('Most individual names are holding their trend while the index is not — weakness concentrated in the largest weights.')
  }

  // The price of money and the appetite for risk. One shared quadrant with the
  // ticker page's macro read — these were two separate copies of the same
  // four-way branch, which is how the same two numbers end up described two
  // different ways on two pages. See src/lib/macroRead.js.
  const quadrant = macroQuadrant({ ratesChangePct: ratesPct, creditChangePct: creditPct })
  if (quadrant) parts.push(quadrant.short)

  if (vol != null) {
    if (vol < 25) parts.push(`Index volatility sits at the ${vol.toFixed(0)}th percentile of its own recent range — a quiet tape, and quiet tapes do not stay quiet indefinitely.`)
    else if (vol > 75) parts.push(`Index volatility is at the ${vol.toFixed(0)}th percentile of its own recent range — moves are large by this market's own recent standard.`)
  }

  const headline = spyTrend.aboveBoth && spyTrend.golden
    ? b >= 60 ? 'Broad uptrend' : 'Uptrend, narrow participation'
    : !spyTrend.aboveBoth && !spyTrend.golden
    ? b <= 40 ? 'Broad downtrend' : 'Index weak, internals holding'
    : 'No clear trend'

  return {
    headline,
    read: parts.join(' '),
    breadth,
    volatilityPercentile: vol,
    spyAboveBoth: spyTrend.aboveBoth,
    goldenCross: spyTrend.golden,
    ratesChangePct: ratesPct,
    creditChangePct: creditPct,
    macro: quadrant,
    // Derived, not written. This said "a two-dozen-name sample" for as long as
    // the universe was two dozen, and went on saying it after the universe
    // became eighty-nine — directly under a sentence reporting "58 of 87
    // tracked names". A count stated in prose is a count that goes stale.
    caveat: `A description of the tape as it stands, measured across the ${breadth.counted} tickers this site tracks — not a forecast, and ${breadth.counted} names is not the whole market.`,
  }
}
