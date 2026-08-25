import { computeSignals } from './indicators.js'
import { bestAvailableStat, FORWARD_DAYS } from './backtest.js'
import { scoreDirectionCheck } from './signalValidation.js'
import { leaderboardCheck } from './leaderboardCheck.js'
import { readSetup } from './setupRead.js'
import { marketRead } from './marketRead.js'
import { riskRead, stopRead, drawdownRead, recoveryRead } from './riskRead.js'
import { liquidityRead } from './liquidityRead.js'
import { correlationMatrix, pairLookup } from './correlation.js'
import { atrSeries } from './indicators.js'

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

// Negative zero is normalised away: JSON writes -0 as `0`, so a value that
// survives a round trip differently from the one it was computed from breaks
// any check that recomputes a published file — and "−0.00%" is not a move
// anything made.
const round = (n, dp) => {
  if (n == null || !Number.isFinite(n)) return null
  const r = Math.round(n * 10 ** dp) / 10 ** dp
  return r === 0 ? 0 : r
}

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
    // The risk figures, computed here for the same reason everything else is:
    // they need the full history, they are identical for every visitor, and
    // scanning eighty-nine tickers for the ones this instrument has already
    // gone through is a question only the screener can answer. Four numbers,
    // ~40 bytes a row.
    risk: (() => {
      const atr = atrSeries(bars, 14).at(-1)
      const surv = riskRead({ bars, symbol: ticker.symbol })
      const stop = stopRead({ bars, symbol: ticker.symbol, atr })
      const dd = drawdownRead({ bars, symbol: ticker.symbol })
      const rec = recoveryRead({ bars, symbol: ticker.symbol, atr })
      if (!surv && !stop && !dd && !rec) return null
      return {
        safeLeverage: surv?.safeLeverage ?? null,
        stopAtr: stop?.keeper?.mult ?? null,
        medianDrawdownPct: dd ? round(dd.medianAdversePct, 2) : null,
        recoverySessions: rec?.medianSessions ?? null,
        neverRecoveredPct: rec ? round(rec.neverRecoveredPct, 1) : null,
      }
    })(),
    // The current ATR in price terms, shipped because the sizing arithmetic
    // needs it and the screener is the only place that can supply it without
    // downloading a symbol's whole history first. Four bytes a row.
    atr: round(atrSeries(bars, 14).at(-1), 4),
    // What a quiet session absorbs. The other ceiling on size, and the one
    // the risk figures quietly assume away — see src/lib/liquidityRead.js.
    liquidity: (() => {
      const liq = liquidityRead({ bars, symbol: ticker.symbol })
      if (!liq.reported) return { reported: false }
      return {
        reported: true,
        absorbable: Math.round(liq.absorbable),
        absorbableQuiet: Math.round(liq.absorbableQuiet),
        medianDollarVolume: Math.round(liq.medianDollarVolume),
        thin: liq.thin,
      }
    })(),
    spark: bars.slice(-SPARK_POINTS).map((b) => round(b.close, 4)),
    edge: round(setup.edge, 4),
    stat: stat
      ? {
          winRate: round(stat.winRate, 2),
          sampleSize: stat.sampleSize,
          avgReturn: round(stat.avgReturn, 4),
          // Distinguishable from the ticker's own drift, not from a coin
          // flip. See summarize() in backtest.js.
          distinguishable: Boolean(stat.distinguishable),
          drift: stat.drift ?? null,
          gap: stat.gap ?? null,
          source: setup.source,
        }
      : null,
  }
}

// The pairwise correlation matrix, as its own file.
//
// Kept out of screener.json deliberately. Eighty-nine symbols is 3,916 pairs
// and roughly 20 KB — a fifth again on top of the index that every visitor
// waits for before the first row paints, to answer a question only someone
// looking at a basket has asked. The overlap panel fetches it when opened.
export function buildCorrelations({ barsBySymbol, tickers }) {
  const symbols = tickers.map((t) => t.symbol).filter((s) => barsBySymbol[s]?.length)
  const matrix = correlationMatrix(barsBySymbol, symbols)
  return {
    generatedAt: new Date().toISOString(),
    lookback: matrix.lookback,
    symbols: matrix.symbols,
    // Two decimals: the third digit of a correlation measured on 120 points is
    // noise, and rounding here is a quarter of the file size.
    pairs: matrix.pairs.map((p) => (p == null ? null : Math.round(p * 100) / 100)),
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

  // How much of each name is just the index. One number a row, so the screener
  // can be sorted by it: a filtered list of eight "aligned up" names that all
  // sit above 0.9 against SPY is one position, and that is not visible from
  // any of the eight rows on their own. The full pairwise matrix is too big
  // for the index and ships as its own file — see buildCorrelations().
  const matrix = correlationMatrix(barsBySymbol, symbols)
  const at = pairLookup(matrix)
  for (const row of rows) row.corrSpy = round(at(row.symbol, 'SPY'), 3)

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
