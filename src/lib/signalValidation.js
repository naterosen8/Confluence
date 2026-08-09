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

  // Significance and magnitude are different questions, and conflating them
  // is how a trivial effect gets reported as a finding. With ~800 scored
  // sessions across two dozen tickers, a correlation of 0.05 is comfortably
  // "statistically significant" while explaining about a quarter of one
  // percent of the variance — far too small to act on and far smaller than
  // costs. So an effect must clear a magnitude floor before it is described
  // as a direction at all.
  //
  // This threshold matters: on a single twelve-month window this same check
  // measured -0.27 and read as a decisive inversion. Four years of data cut
  // it to -0.06. The short window was the artefact, and without a magnitude
  // floor the site would have kept reporting the artefact as a fact.
  const MEANINGFUL_CORR = 0.1
  const direction = !stats
    ? 'unknown'
    : Math.abs(stats.mean) < MEANINGFUL_CORR
    ? 'negligible'
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
  negligible: {
    headline: 'The confluence score has no usable relationship to what happens next.',
    detail:
      'Across the tracked history the measured link between the score and the following sessions is close enough to zero to be worthless for anticipating direction — small enough that ordinary trading costs would dwarf it, whichever way it points. The score is a fair description of how much the indicators currently agree with each other. It is not a forecast, and this measurement is the reason the site does not present it as one.',
  },
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

// Cached across the session: the check scans every tracked ticker, and the
// snapshot does not change while the page is open. Memoised here rather than
// in a component so the ticker pages and the methodology page are guaranteed
// to be describing the same computation.
let cached
export function cachedScoreDirectionCheck(barsBySymbol, symbols) {
  if (cached === undefined) cached = scoreDirectionCheck(barsBySymbol, symbols)
  return cached
}

// Short form for the banner shown above every ticker chart. Derived from the
// measurement rather than written by hand: a hardcoded sentence saying the
// score is inverted would quietly become false the moment the relationship
// changed, which is exactly the failure this whole check exists to prevent.
export function directionBanner(result) {
  if (!result) return null
  const n = result.forwardDays
  switch (result.direction) {
    case 'negligible':
      return `Measured against this site's own history, the score has no usable relationship to returns over the next ${n} sessions — it describes indicator agreement, not expected direction.`
    case 'inverted':
      return `On the data this site has, a higher confluence score has been followed by lower returns over the next ${n} sessions — the opposite of what the badge wording suggests.`
    case 'aligned':
      return `On the data this site has, a higher confluence score has been followed by higher returns over the next ${n} sessions. That is one window's measurement, not a property of markets.`
    case 'indistinguishable':
      return `On the data this site has, the confluence score shows no reliable relationship to returns over the next ${n} sessions.`
    default:
      return null
  }
}
