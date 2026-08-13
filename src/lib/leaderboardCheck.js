import { bestAvailableStat, FORWARD_DAYS } from './backtest.js'

// Is the leaderboard telling you anything, or is it just the loudest noise?
//
// The dashboard ranks tickers by how far their historical win rate sits from a
// coin flip and shows the top five. That is a *selection*, and selections lie:
// take the most extreme five of K tickers and you get impressive numbers from
// pure chance, with the exaggeration growing as K grows. Which is precisely
// the reason a bigger ticker list would otherwise make this site less
// trustworthy rather than more.
//
// The page used to carry a hardcoded "p ≈ 0.5" from a measurement taken once
// by hand. It would have kept saying 0.5 at five hundred tickers, when the
// true figure would be very different — the one hardcoded honesty claim on a
// site whose other self-checks all derive themselves.
//
// This computes it, every sync, and gets stricter automatically as the list
// grows. Two corrections that the raw ranking ignores:
//
//   1. The null is not a coin flip. Over a rising market, price is up after
//      five sessions more often than not no matter what any indicator said,
//      so a 55% win rate against a 55% drift is zero skill. Each ticker is
//      tested against its own drift, not against 50%.
//
//   2. Testing K tickers and reporting the best is K chances to get lucky.
//      Benjamini-Hochberg controls the false discovery rate across the whole
//      set, so "how many survive" is a question with an honest answer rather
//      than a foregone one.

// log(n!) via Lanczos, so the binomial stays exact at the sample sizes here
// (hundreds of observations) without overflowing a factorial.
function logGamma(z) {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  z -= 1
  let x = 0.99999999999980993
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1)
  const t = z + g.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

const logChoose = (n, k) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1)

export function binomialPmf(k, n, p) {
  if (k < 0 || k > n) return 0
  if (p <= 0) return k === 0 ? 1 : 0
  if (p >= 1) return k === n ? 1 : 0
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

// Two-sided exact binomial test: the total probability of any outcome no more
// likely than the one observed. Preferred over a normal approximation because
// several of these buckets are small, which is exactly where the approximation
// is worst and where an overstated result would do the most damage.
export function binomialTwoSidedP(k, n, p) {
  if (n <= 0) return 1
  const observed = binomialPmf(k, n, p)
  // Floating point makes an exact equality test unreliable at the boundary.
  const threshold = observed * (1 + 1e-9)
  let total = 0
  for (let i = 0; i <= n; i++) {
    const prob = binomialPmf(i, n, p)
    if (prob <= threshold) total += prob
  }
  return Math.min(1, total)
}

// Share of forward windows in which price simply rose. This is the rate a
// win has to beat to mean anything, and it is per ticker because a stock that
// doubled and one that halved do not share a null.
export function driftRate(bars, forwardDays = FORWARD_DAYS) {
  if (!bars || bars.length <= forwardDays) return null
  let up = 0
  let n = 0
  for (let i = 0; i + forwardDays < bars.length; i++) {
    n++
    if (bars[i + forwardDays].close > bars[i].close) up++
  }
  return n ? up / n : null
}

// Benjamini-Hochberg. Returns the indices that survive at false-discovery
// rate q, given p-values in any order.
export function benjaminiHochberg(pValues, q = 0.05) {
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
  const m = indexed.length
  let cutoff = -1
  for (let rank = 0; rank < m; rank++) {
    if (indexed[rank].p <= ((rank + 1) / m) * q) cutoff = rank
  }
  if (cutoff < 0) return []
  return indexed.slice(0, cutoff + 1).map((x) => x.i).sort((a, b) => a - b)
}

export function leaderboardCheck({ barsBySymbol, tickers, q = 0.05, forwardDays = FORWARD_DAYS }) {
  const spyBars = barsBySymbol.SPY || []
  const tested = []

  for (const ticker of tickers) {
    const bars = barsBySymbol[ticker.symbol]
    // Macro proxies are excluded from the leaderboard itself, so they are
    // excluded from the test of it — testing symbols the ranking never shows
    // would make the correction look harsher than the selection it describes.
    if (!bars?.length || ticker.kind === 'macro') continue
    const { stat } = bestAvailableStat(bars, spyBars)
    if (!stat) continue
    const drift = driftRate(bars, forwardDays)
    if (drift == null) continue

    // The bucket counts wins in the direction the readings leaned. Against a
    // downward lean the relevant null is the chance of falling, not rising.
    const n = stat.sampleSize
    const wins = Math.round((stat.winRate / 100) * n)
    const nullRate = stat.winRate >= 50 ? drift : 1 - drift
    const expectedWins = nullRate * n
    tested.push({
      symbol: ticker.symbol,
      sampleSize: n,
      winRate: stat.winRate,
      driftRate: drift * 100,
      nullRate: nullRate * 100,
      excessPoints: stat.winRate - nullRate * 100,
      p: binomialTwoSidedP(wins, n, nullRate),
      expectedWins,
    })
  }

  const survivorIdx = benjaminiHochberg(tested.map((t) => t.p), q)
  const survivors = survivorIdx.map((i) => tested[i].symbol)

  return {
    q,
    testedCount: tested.length,
    survivors,
    survivorCount: survivors.length,
    minP: tested.length ? Math.min(...tested.map((t) => t.p)) : null,
    // The threshold the single best result had to clear to count as anything.
    strictestThreshold: tested.length ? q / tested.length : null,
    rows: tested.sort((a, b) => a.p - b.p),
  }
}

// The sentence the dashboard prints. Derived, so it stays true as the ticker
// list grows instead of asserting a number measured once by hand.
export function leaderboardVerdict(check) {
  if (!check || !check.testedCount) {
    return 'Not enough tracked history yet to test whether this ordering means anything.'
  }
  const { survivorCount, testedCount, q, minP } = check
  const pText = minP == null ? '' : ` The strongest single result has p ≈ ${minP.toFixed(2)}.`
  if (survivorCount === 0) {
    return (
      `Tested against each ticker's own drift rate and corrected for having looked at ${testedCount} of them, ` +
      `none of these records is distinguishable from chance.${pText} Treat this as a starting point for looking, ` +
      `not as evidence that these are the strongest setups.`
    )
  }
  return (
    `Tested against each ticker's own drift rate and corrected for having looked at ${testedCount} of them, ` +
    `${survivorCount} of ${testedCount} survive at a ${(q * 100).toFixed(0)}% false-discovery rate: ` +
    `${check.survivors.join(', ')}.${pText} Surviving the correction means the record is unlikely to be pure ` +
    `selection — it is not a forecast, and it says nothing about what happens next.`
  )
}
