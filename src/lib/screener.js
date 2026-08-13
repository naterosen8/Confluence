import { computeSignals } from './indicators.js'
import { bestAvailableStat, FORWARD_DAYS } from './backtest.js'
import { scoreDirectionCheck } from './signalValidation.js'
import { leaderboardCheck } from './leaderboardCheck.js'
import { readSetup } from './setupRead.js'
import { marketRead } from './marketRead.js'

// The dashboard's rows, computed once by the daily job instead of by every
// visitor's browser.
//
// Today the dashboard downloads the entire bar history for every tracked
// symbol and recomputes RSI, MACD, trend, divergence and a full base-rate
// backtest for all of them before it can paint a single row. At 24 symbols
// that is ~487 KB gzipped and a few hundred milliseconds. It does not survive
// growth: the payload is ~20 KB gzipped per symbol, so 150 symbols is 3 MB
// before the first row appears and 500 is 10 MB, and the work is linear on
// top of that. The same numbers are identical for every visitor and change
// once a day.
//
// So the job computes them and ships a summary. Each row is a few hundred
// bytes rather than ~92 KB of raw bars, which is the difference between a
// screener that can hold a hundred tickers and one that cannot.
//
// Deliberately NOT precomputed: anything on a ticker's own page. Those pages
// load that symbol's bars on demand, so their tables stay derived from real
// history rather than from a summary that could drift away from it.

// Enough points to show a shape, few enough to keep a row small. At four
// significant figures a 40-point spark is ~240 bytes of the ~400-byte row.
export const SPARK_POINTS = 40

const round = (n, dp) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp)

// The flags column, computed here so the dashboard does not need divergence
// detection — the single most expensive check — just to render a table cell.
export function flagsFor(signals) {
  const flags = []
  if (signals.divergence?.lowUnconfirmed) flags.push('low unconfirmed by momentum')
  if (signals.divergence?.highUnconfirmed) flags.push('high unconfirmed by momentum')
  if (signals.squeeze?.isSqueeze) flags.push('volatility squeeze')
  if (signals.relVolume != null && signals.relVolume >= 1.5) flags.push(`${signals.relVolume.toFixed(1)}x volume`)
  return flags
}

export function buildScreenerRow({ ticker, bars, spyBars }) {
  const signals = computeSignals(bars)
  const setup = bestAvailableStat(bars, spyBars)
  const stat = setup.stat
  return {
    symbol: ticker.symbol,
    name: ticker.name,
    kind: ticker.kind,
    price: round(signals.price, 4),
    rsi: round(signals.rsi, 1),
    // Only the side of the signal line is shown, so only that is shipped.
    macd: signals.macd ? (signals.macd.histogram > 0 ? 'above' : 'below') : null,
    score: signals.score,
    verdict: signals.verdict,
    bullishPoints: signals.bullishPoints,
    bearishPoints: signals.bearishPoints,
    flags: flagsFor(signals),
    // Just the label, not the prose. A one-word structure per row is what
    // makes twenty-four charts scannable without opening twenty-four pages;
    // the full read stays on the ticker page where there is room for it.
    setup: (() => {
      const r = readSetup(bars, signals)
      return r ? { key: r.key, name: r.name } : null
    })(),
    spark: bars.slice(-SPARK_POINTS).map((b) => round(b.close, 4)),
    edge: round(setup.edge, 4),
    stat: stat
      ? {
          winRate: round(stat.winRate, 2),
          sampleSize: stat.sampleSize,
          avgReturn: round(stat.avgReturn, 4),
          distinguishable: Boolean(stat.distinguishable),
          source: setup.source,
        }
      : null,
  }
}

export function buildScreener({ barsBySymbol, tickers }) {
  const spyBars = barsBySymbol.SPY || []
  const rows = []
  for (const ticker of tickers) {
    const bars = barsBySymbol[ticker.symbol]
    // A symbol the sync could not fetch is omitted rather than shipped with
    // invented numbers — the dashboard shows what it actually has.
    if (!bars?.length) continue
    rows.push(buildScreenerRow({ ticker, bars, spyBars }))
  }

  // The site's own self-check reads every ticker's full history and is run on
  // the methodology page and behind the banner on every ticker page. That is
  // the one client-side computation whose cost scales with the size of the
  // universe rather than with what the visitor is looking at, so it moves
  // here too.
  const symbols = rows.map((r) => r.symbol)
  const directionCheck = scoreDirectionCheck(barsBySymbol, symbols)

  // Whether the leaderboard's ordering survives having been selected. Computed
  // here because the correction has to know how many tickers were looked at,
  // and that number is only known to the job that looked at all of them.
  const leaderboard = leaderboardCheck({ barsBySymbol, tickers })

  // What kind of market this is right now. Needs every ticker at once —
  // breadth is not visible from any single page — so it belongs here.
  const market = marketRead({ barsBySymbol, tickers })

  return {
    generatedAt: new Date().toISOString(),
    forwardDays: FORWARD_DAYS,
    rows,
    directionCheck,
    leaderboard,
    market,
  }
}
