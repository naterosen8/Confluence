import { scoreSeries } from './indicators'
import { FORWARD_DAYS } from './backtest'
// Single definition, shared with the trade simulator, so the two features
// cannot disagree about whether the same position survived. At Nx a 1/N
// adverse move is fatal: 10x dies on 10%, 25x on 4%. The number people
// underestimate is not the upside, it is how little movement takes you to
// zero.
import { liquidationPrice } from './pnl'

export { liquidationPrice }

// Walks one hypothetical position forward bar by bar. Critically this checks
// each bar's intraday low (long) or high (short) rather than its close: a
// leveraged position is liquidated the moment price *touches* the level, so
// scoring on closes alone would quietly report survivors that were actually
// wiped out mid-session and "recovered" by the bell. That single detail is
// the difference between an honest study and a flattering one.
export function simulatePosition(bars, entryIndex, direction, leverage, forwardDays) {
  const entryPrice = bars[entryIndex].close
  const window = bars.slice(entryIndex + 1, entryIndex + 1 + forwardDays)
  if (window.length < forwardDays) return null

  const liq = liquidationPrice(entryPrice, direction, leverage)
  for (const bar of window) {
    const wipedOut = direction === 'long' ? bar.low <= liq : bar.high >= liq
    if (wipedOut) {
      return { returnPct: -1, liquidated: true, entryPrice, exitPrice: liq, exitDate: bar.date }
    }
  }

  const exit = window[window.length - 1]
  const dirMult = direction === 'long' ? 1 : -1
  const move = (exit.close - entryPrice) / entryPrice
  return {
    returnPct: Math.max(-1, dirMult * leverage * move),
    liquidated: false,
    entryPrice,
    exitPrice: exit.close,
    exitDate: exit.date,
  }
}

function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Replays every past day matching `matchesScore` as a hypothetical position:
// the direction is taken from what the app's own confluence score said at
// that time (bullish score -> long, bearish -> short), so this measures the
// app's published stance, not a direction chosen with hindsight.
//
// Every qualifying occurrence is included — there is no filtering to the ones
// that worked. The losers and the wipeouts are the point.
export function leverageStudy({ bars, capital, leverage, matchesScore, forwardDays = FORWARD_DAYS }) {
  const scores = scoreSeries(bars)
  const results = []

  for (let i = 0; i < bars.length; i++) {
    const score = scores[i]
    if (score == null || score === 0 || !matchesScore(score)) continue
    const outcome = simulatePosition(bars, i, score > 0 ? 'long' : 'short', leverage, forwardDays)
    if (!outcome) continue
    results.push({ ...outcome, date: bars[i].date, direction: score > 0 ? 'long' : 'short', score })
  }

  if (!results.length) return { sampleSize: 0 }

  const returns = results.map((r) => r.returnPct)
  const liquidated = results.filter((r) => r.liquidated).length
  const wins = returns.filter((r) => r > 0).length
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length

  return {
    sampleSize: results.length,
    liquidatedCount: liquidated,
    liquidatedPct: (liquidated / results.length) * 100,
    winRate: (wins / results.length) * 100,
    avgReturnPct: avg * 100,
    medianReturnPct: median(returns) * 100,
    bestPct: Math.max(...returns) * 100,
    worstPct: Math.min(...returns) * 100,
    avgDollars: capital * avg,
    bestDollars: capital * Math.max(...returns),
    worstDollars: capital * Math.min(...returns),
    forwardDays,
    results,
  }
}

// Deliberately NOT provided: a compounded equity curve ("stake it every time
// and you'd have $X"). Chaining these together implies a mechanical strategy
// nobody ran, hides that the trades overlap in time, and turns a modest edge
// into an exponential-looking chart. Per-trade distribution is the honest
// unit here.
