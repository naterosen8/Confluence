import { rsiSeries, macdHistogramSeries } from './indicators'

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
