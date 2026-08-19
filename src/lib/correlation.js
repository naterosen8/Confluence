// How much of a basket is actually one bet.
//
// Everything else on this site describes one instrument at a time. That is
// exactly the wrong shape for the question a person asks after using a
// screener, because a screener's output is a *list*: filter eighty-nine names
// down to the six that are aligned up, and the natural reading is that you
// found six opportunities. Usually you found one, wearing six tickers. In a
// broad tape most large-cap technology names move together closely enough that
// holding all of them at a third of the size each is not diversification, it
// is the same position with extra commission.
//
// Nothing on the site said so. The screener happily hands over a correlated
// block, the risk page then tells you what size each name has survived
// individually, and those per-name numbers are misleading the moment you hold
// more than one of them: six positions that all fall together do not each get
// their own drawdown budget.
//
// This is measurement, not advice. It says what the basket has been, from the
// same bars every other number here comes from. It does not say what to hold.

// Long enough that a single shared shock does not set the number, short enough
// that it describes the current regime rather than an average of two.
export const CORRELATION_LOOKBACK = 120

// Below this there is not enough overlap for the figure to mean anything, and
// a correlation computed on thirty points is mostly noise wearing two decimals.
export const MIN_OVERLAP = 60

// Where a pair stops being two positions and starts being one. There is no
// natural threshold in the data — correlation is continuous — so this is a
// convention, chosen because it is the level at which the two names' daily
// moves share about half their variance (0.7^2 = 0.49). Stated rather than
// hidden, and the exact number is shown wherever the grouping is.
export const SAME_BET = 0.7

// Close-to-close returns keyed by date.
//
// Keyed rather than indexed because the universe mixes instruments with
// different calendars: crypto trades every day, equities do not. Lining these
// up by array position would pair a Saturday in BTC with a Thursday in SPY and
// drift a little further out of register every weekend, which produces a
// number that looks like a correlation and is not one.
export function returnsByDate(bars, lookback = CORRELATION_LOOKBACK) {
  const out = new Map()
  if (!bars || bars.length < 2) return out
  const from = Math.max(1, bars.length - lookback)
  for (let i = from; i < bars.length; i++) {
    const prev = bars[i - 1].close
    const curr = bars[i].close
    if (!prev || !Number.isFinite(prev) || !Number.isFinite(curr)) continue
    out.set(bars[i].date, (curr - prev) / prev)
  }
  return out
}

// Pearson on the dates the two series actually share.
//
// The intersection is the honest window: on a weekend the equity did not
// trade, so the crypto pair's weekend move belongs to the Friday-to-Monday
// return, which is precisely the move someone holding both would have
// experienced together.
export function correlation(a, b, minOverlap = MIN_OVERLAP) {
  const xs = []
  const ys = []
  for (const [date, x] of a) {
    const y = b.get(date)
    if (y == null) continue
    xs.push(x)
    ys.push(y)
  }
  const n = xs.length
  if (n < minOverlap) return null

  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a1 = xs[i] - mx
    const b1 = ys[i] - my
    num += a1 * b1
    dx += a1 * a1
    dy += b1 * b1
  }
  // A series that never moved has no correlation with anything — not zero
  // correlation, which would be a claim. Returning null keeps it out of the
  // averages instead of dragging them toward the middle.
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

// The lower triangle, symbol-indexed. Stored flat because the square form of
// eighty-nine symbols is 7,921 cells to ship for 3,916 distinct numbers.
export function correlationMatrix(barsBySymbol, symbols, lookback = CORRELATION_LOOKBACK) {
  const present = symbols.filter((s) => barsBySymbol[s]?.length)
  const returns = new Map(present.map((s) => [s, returnsByDate(barsBySymbol[s], lookback)]))
  const pairs = []
  for (let i = 0; i < present.length; i++) {
    for (let j = 0; j < i; j++) {
      pairs.push(correlation(returns.get(present[i]), returns.get(present[j])))
    }
  }
  return { symbols: present, lookback, pairs }
}

// Index into the flat lower triangle for the pair (i, j), i > j.
const flatIndex = (i, j) => (i * (i - 1)) / 2 + j

export function pairLookup(matrix) {
  const index = new Map(matrix.symbols.map((s, i) => [s, i]))
  return (a, b) => {
    if (a === b) return 1
    const i = index.get(a)
    const j = index.get(b)
    if (i == null || j == null) return null
    return matrix.pairs[i > j ? flatIndex(i, j) : flatIndex(j, i)] ?? null
  }
}

// Every pairwise correlation within a set, strongest first.
export function pairsWithin(matrix, symbols) {
  const at = pairLookup(matrix)
  const held = symbols.filter((s) => matrix.symbols.includes(s))
  const out = []
  for (let i = 0; i < held.length; i++) {
    for (let j = 0; j < i; j++) {
      const r = at(held[i], held[j])
      if (r != null) out.push({ a: held[j], b: held[i], r })
    }
  }
  return out.sort((x, y) => y.r - x.r)
}

// How many independent positions a basket amounts to.
//
// For N equal-risk positions whose pairwise correlations average to rho, the
// portfolio's variance is (1/N)(1 + (N-1)rho) times a single position's. A
// basket of k genuinely independent positions has variance 1/k. Setting those
// equal gives k = N / (1 + (N-1)rho): eight names averaging 0.75 correlation
// carry the variance of about 1.3 independent bets, not eight.
//
// Equal *risk* weights, not equal dollars — correlation normalises away each
// instrument's own volatility, so this measures shared direction and nothing
// else. Someone holding one name at ten times the size of the others is more
// concentrated than this says, not less.
export function effectiveBets(correlations, n) {
  if (n <= 1) return n
  const usable = correlations.filter((r) => r != null)
  if (!usable.length) return null
  const rho = usable.reduce((s, r) => s + r, 0) / usable.length
  // Below -1/(N-1) the equal-weight portfolio would have negative variance,
  // which is not a portfolio that exists — it is the floor of the formula, and
  // an average that far negative across a real basket does not occur.
  const floor = -1 / (n - 1)
  const denom = 1 + (n - 1) * Math.max(rho, floor + 1e-9)
  if (denom <= 0) return n
  return Math.min(n, n / denom)
}

// Which names are the same bet as which.
//
// Average linkage: two groups merge when the mean correlation across every
// pair spanning them clears the threshold. Single linkage would chain — A with
// B, B with C — until one group swallowed the board through a series of
// individually weak links, which is the failure mode that makes naive
// clustering produce one cluster and call it an answer.
export function clusters(matrix, symbols, threshold = SAME_BET) {
  const at = pairLookup(matrix)
  const held = symbols.filter((s) => matrix.symbols.includes(s))
  let groups = held.map((s) => [s])

  for (;;) {
    let best = null
    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < i; j++) {
        const rs = []
        for (const a of groups[i]) for (const b of groups[j]) {
          const r = at(a, b)
          if (r != null) rs.push(r)
        }
        if (!rs.length) continue
        const mean = rs.reduce((s, r) => s + r, 0) / rs.length
        if (mean >= threshold && (!best || mean > best.mean)) best = { i, j, mean }
      }
    }
    if (!best) break
    groups[best.j] = [...groups[best.j], ...groups[best.i]]
    groups = groups.filter((_, k) => k !== best.i)
  }

  return groups
    .map((members) => {
      const rs = []
      for (let i = 0; i < members.length; i++) for (let j = 0; j < i; j++) {
        const r = at(members[i], members[j])
        if (r != null) rs.push(r)
      }
      return {
        members: [...members].sort(),
        // A single name is a group of one and has no internal correlation to
        // report — null, not 1, which would read as "perfectly concentrated".
        meanCorrelation: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
      }
    })
    .sort((a, b) => b.members.length - a.members.length || a.members[0].localeCompare(b.members[0]))
}
