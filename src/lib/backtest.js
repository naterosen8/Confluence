import { rsiSeries, macdHistogramSeries, smaSeries, scoreSeries } from './indicators'

function summarize(occurrences) {
  if (occurrences.length === 0) return { sampleSize: 0 }
  const returns = occurrences.map((o) => o.return)
  const wins = returns.filter((r) => r > 0).length
  return {
    sampleSize: occurrences.length,
    winRate: (wins / occurrences.length) * 100,
    avgReturn: (returns.reduce((a, b) => a + b, 0) / returns.length) * 100,
    bestReturn: Math.max(...returns) * 100,
    worstReturn: Math.min(...returns) * 100,
  }
}

function forwardReturns(closes, eventIndices, forwardDays) {
  const occurrences = []
  for (const i of eventIndices) {
    if (i + forwardDays >= closes.length) continue
    occurrences.push({ index: i, return: (closes[i + forwardDays] - closes[i]) / closes[i] })
  }
  return summarize(occurrences)
}

// Detects the *event* (histogram flips sign), not the ongoing state — so a
// 20-day bullish stretch counts as one occurrence, not twenty.
function findMacdCrosses(closes) {
  const hist = macdHistogramSeries(closes)
  const bullish = []
  const bearish = []
  for (let i = 1; i < hist.length; i++) {
    if (hist[i] == null || hist[i - 1] == null) continue
    if (hist[i - 1].histogram <= 0 && hist[i].histogram > 0) bullish.push(i)
    if (hist[i - 1].histogram >= 0 && hist[i].histogram < 0) bearish.push(i)
  }
  return { bullish, bearish }
}

function findRsiEvents(closes, period = 14) {
  const series = rsiSeries(closes, period)
  const exitOversold = []
  const enterOverbought = []
  for (let i = 1; i < series.length; i++) {
    if (series[i] == null || series[i - 1] == null) continue
    if (series[i - 1] < 30 && series[i] >= 30) exitOversold.push(i)
    if (series[i - 1] < 70 && series[i] >= 70) enterOverbought.push(i)
  }
  return { exitOversold, enterOverbought }
}

export const SIGNAL_LABELS = {
  macdBullishCross: 'MACD crosses above signal',
  macdBearishCross: 'MACD crosses below signal',
  rsiExitOversold: 'RSI exits oversold (crosses back above 30)',
  rsiEnterOverbought: 'RSI enters overbought (crosses above 70)',
}

// For every defined signal type, find every past occurrence in this ticker's
// history and summarize what happened over the following `forwardDays`.
// This is the base rate — the thing a human scanning a chart by eye can't
// compute in their head: "this exact setup has happened N times before, and
// here's the distribution of outcomes," instead of just "this is happening now."
export function backtestTicker(bars, { forwardDays = 5 } = {}) {
  const closes = bars.map((b) => b.close)
  const { bullish, bearish } = findMacdCrosses(closes)
  const { exitOversold, enterOverbought } = findRsiEvents(closes)

  return {
    forwardDays,
    macdBullishCross: forwardReturns(closes, bullish, forwardDays),
    macdBearishCross: forwardReturns(closes, bearish, forwardDays),
    rsiExitOversold: forwardReturns(closes, exitOversold, forwardDays),
    rsiEnterOverbought: forwardReturns(closes, enterOverbought, forwardDays),
  }
}

// Classifies each historical day as an up/down/choppy market regime using
// SPY's own 50-vs-200-day trend. A setup's base rate computed across a
// two-year raging bull market says very little about how it'll behave in a
// chop market — this lets backtests condition on "what kind of market was
// it" instead of blending every regime together.
export function regimeSeries(spyBars) {
  const closes = spyBars.map((b) => b.close)
  const sma50Arr = smaSeries(closes, 50)
  const sma200Arr = smaSeries(closes, 200)
  const map = new Map()
  for (let i = 0; i < spyBars.length; i++) {
    if (sma50Arr[i] == null || sma200Arr[i] == null) continue
    let regime = 'choppy'
    if (closes[i] > sma50Arr[i] && sma50Arr[i] > sma200Arr[i]) regime = 'up'
    else if (closes[i] < sma50Arr[i] && sma50Arr[i] < sma200Arr[i]) regime = 'down'
    map.set(spyBars[i].date, regime)
  }
  return map
}

// SPY only trades Mon-Fri, but crypto bars include weekends — an exact-date
// lookup into regimeMap silently misses every Saturday/Sunday crypto bar and
// leaves them regime-unmatched forever. This instead finds the latest SPY
// trading day at or before the target date, so a Saturday close still gets
// Friday's regime. `regimeDates` must be sorted ascending (Map insertion
// order from regimeSeries already guarantees this).
function regimeAt(regimeDates, regimeMap, date) {
  let lo = 0
  let hi = regimeDates.length - 1
  let match = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (regimeDates[mid] <= date) {
      match = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return match === -1 ? null : regimeMap.get(regimeDates[match])
}

const REGIME_LABELS = { up: 'uptrending', down: 'downtrending', choppy: 'choppy/range-bound' }

// The core of the "multi-condition" upgrade: instead of four independent
// single-signal base rates, this buckets every past day by its *combined*
// confluence score (see scoreSeries) and reports what actually happened
// afterward — split into "every time this score occurred" and "every time
// this score occurred in a market regime like today's." That second, smaller
// number is the more honest one to weigh a current setup against.
export function backtestByScore(bars, spyBars, { forwardDays = 5 } = {}) {
  const closes = bars.map((b) => b.close)
  const scores = scoreSeries(bars)
  const regimeMap = regimeSeries(spyBars)
  const regimeDates = [...regimeMap.keys()]
  const currentRegime = regimeAt(regimeDates, regimeMap, bars[bars.length - 1].date)

  const buckets = new Map()
  for (let i = 0; i < scores.length - forwardDays; i++) {
    if (scores[i] == null) continue
    const ret = (closes[i + forwardDays] - closes[i]) / closes[i]
    const regime = regimeAt(regimeDates, regimeMap, bars[i].date)
    if (!buckets.has(scores[i])) buckets.set(scores[i], { all: [], regimeMatched: [] })
    const bucket = buckets.get(scores[i])
    bucket.all.push({ return: ret })
    if (regime && currentRegime && regime === currentRegime) bucket.regimeMatched.push({ return: ret })
  }

  const rows = [...buckets.entries()]
    .map(([score, occ]) => ({ score, all: summarize(occ.all), regimeMatched: summarize(occ.regimeMatched) }))
    .sort((a, b) => b.score - a.score)

  return {
    forwardDays,
    currentScore: scores[scores.length - 1],
    currentRegime,
    currentRegimeLabel: currentRegime ? REGIME_LABELS[currentRegime] : null,
    rows,
  }
}

const MIN_SAMPLE = 8

// Ranks a ticker's *current* setup by how much real historical evidence
// backs it — not just whether the badge says Bullish. Prefers the
// regime-matched sample (today's kind of market specifically); falls back to
// the full-history sample if the regime-matched one is too thin to mean
// anything; reports no edge at all if neither has enough occurrences. Shared
// by the dashboard leaderboard and the shareable ticker card so both agree
// on what "the best available stat" means.
export function bestAvailableStat(bars, spyBars, { minSample = MIN_SAMPLE } = {}) {
  const scoreBacktest = backtestByScore(bars, spyBars)
  const row = scoreBacktest.rows.find((r) => r.score === scoreBacktest.currentScore)
  if (!row) {
    return { edge: 0, stat: null, source: null, currentScore: scoreBacktest.currentScore, currentRegimeLabel: scoreBacktest.currentRegimeLabel }
  }

  const useRegime = row.regimeMatched.sampleSize >= minSample
  const useAll = !useRegime && row.all.sampleSize >= minSample
  const stat = useRegime ? row.regimeMatched : useAll ? row.all : null
  const source = useRegime ? 'regime-matched' : useAll ? 'all-history' : null
  const edge = stat ? (stat.winRate - 50) * Math.sqrt(stat.sampleSize) : 0
  return { edge, stat, source, currentScore: scoreBacktest.currentScore, currentRegimeLabel: scoreBacktest.currentRegimeLabel }
}

// Which of the tracked events (if any) fired in the last few bars, so the
// detail page can lead with "this exact setup just triggered" rather than
// making the reader hunt for what's relevant among four stat blocks.
export function mostRecentEvent(bars, withinBars = 3) {
  const closes = bars.map((b) => b.close)
  const { bullish, bearish } = findMacdCrosses(closes)
  const { exitOversold, enterOverbought } = findRsiEvents(closes)
  const candidates = [
    { key: 'macdBullishCross', indices: bullish },
    { key: 'macdBearishCross', indices: bearish },
    { key: 'rsiExitOversold', indices: exitOversold },
    { key: 'rsiEnterOverbought', indices: enterOverbought },
  ]

  let best = null
  for (const c of candidates) {
    const last = c.indices[c.indices.length - 1]
    if (last == null) continue
    const barsAgo = closes.length - 1 - last
    if (barsAgo <= withinBars && (!best || barsAgo < best.barsAgo)) {
      best = { key: c.key, label: SIGNAL_LABELS[c.key], barsAgo }
    }
  }
  return best
}
