import { scoreSeries } from './indicators'
import { FORWARD_DAYS } from './backtest'
import { meanWithInterval } from './stats'

// Measures, from the live snapshot, whether the confluence score has actually
// been followed by the direction its label implies.
//
// This exists because the honest answer on the current data is no. Across
// every tracked ticker the correlation between score and forward return is
// negative: higher scores have been followed by *lower* returns. That is
// consistent with short-horizon mean reversion — by the time trend, MACD and
// price-above-average all agree, the move has largely happened — but whatever
// the cause, a site that prints "Strong Bullish" while its own data says the
// opposite is misleading its readers.
//
// Computed at runtime rather than hardcoded so it can never go stale against
// the data it describes, and so it will change on its own if the relationship
// changes.

function correlation(xs, ys) {
  const n = xs.length
  if (n < 12) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

export function scoreDirectionCheck(barsBySymbol, symbols) {
  const perTicker = []
  const buckets = new Map()

  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol]
    if (!bars || bars.length < 210) continue
    const closes = bars.map((b) => b.close)
    const scores = scoreSeries(bars)
    const xs = []
    const ys = []
    for (let i = 0; i < bars.length - FORWARD_DAYS; i++) {
      if (scores[i] == null) continue
      const ret = (closes[i + FORWARD_DAYS] - closes[i]) / closes[i]
      xs.push(scores[i])
      ys.push(ret)
      if (!buckets.has(scores[i])) buckets.set(scores[i], [])
      buckets.get(scores[i]).push(ret)
    }
    const corr = correlation(xs, ys)
    if (corr != null) perTicker.push({ symbol, corr, n: xs.length })
  }

  if (!perTicker.length) return null

  const corrs = perTicker.map((t) => t.corr)
  const stats = meanWithInterval(corrs)
  const negative = corrs.filter((c) => c < 0).length

  const rows = [...buckets.entries()]
    .map(([score, rets]) => ({
      score,
      n: rets.length,
      meanReturn: (rets.reduce((a, b) => a + b, 0) / rets.length) * 100,
    }))
    .sort((a, b) => b.score - a.score)

  // "Aligned" means higher scores were followed by higher returns, which is
  // what the badge's wording implies. Anything else is worth saying out loud.
  const direction = !stats
    ? 'unknown'
    : stats.upper < 0
    ? 'inverted'
    : stats.lower > 0
    ? 'aligned'
    : 'indistinguishable'

  return {
    perTicker,
    rows,
    tickerCount: perTicker.length,
    negativeCount: negative,
    meanCorr: stats?.mean ?? null,
    lower: stats?.lower ?? null,
    upper: stats?.upper ?? null,
    direction,
    scoredDays: perTicker[0]?.n ?? 0,
    forwardDays: FORWARD_DAYS,
  }
}

export const DIRECTION_COPY = {
  inverted: {
    headline: 'On the tracked data, a higher confluence score has been followed by LOWER returns.',
    detail:
      'The relationship runs opposite to what the badge wording implies. This is consistent with short-horizon mean reversion — by the time trend, MACD and price-versus-average all agree, most of the move has already happened — but the cause matters less than the fact. Read the badge as a description of how much the indicators currently agree with each other, not as a direction to expect.',
  },
  aligned: {
    headline: 'On the tracked data, a higher confluence score has been followed by higher returns.',
    detail:
      'The relationship currently runs in the direction the badge implies. That is a measurement over one short window, not a property of markets, and it can reverse.',
  },
  indistinguishable: {
    headline: 'On the tracked data, the confluence score shows no reliable relationship to forward returns.',
    detail:
      'The measured relationship cannot be distinguished from zero. The badge describes how much the indicators agree with each other; on this sample that agreement has not translated into a directional edge.',
  },
  unknown: {
    headline: 'Not enough scored history yet to test the score against outcomes.',
    detail: 'This check needs a longer synced history before it can say anything.',
  },
}
