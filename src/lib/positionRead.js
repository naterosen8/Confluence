import { atrSeries } from './indicators.js'

// What a position actually is right now, in the terms that decide its fate.
//
// The trades table reports P&L, leverage and a liquidation price, and those
// are the right numbers, but they leave the reader to do the one piece of
// arithmetic that matters: how far is this from being over. "Wipes out at
// $61,028" means nothing without knowing whether that is a normal Tuesday for
// this instrument or a once-a-year event.
//
// Daily range is the unit that answers it. A position sitting 0.4 daily ranges
// from its liquidation level is one ordinary session from gone; one sitting
// eight ranges away is not going to be resolved by noise. Same number, and
// only one of the two framings tells you which situation you are in.
//
// Strictly a claim about now: distance measured in the instrument's own recent
// volatility, plus how often a move that size has actually occurred in the
// tracked history. No forecast — the frequency is a count of what happened,
// not a probability of what will.

// How many of the last N sessions moved at least `pct` against the position's
// direction, close to close. A count, not a rate of anything future.
function adverseSessionCount(bars, pct, direction, lookback = 250) {
  const recent = bars.slice(-lookback)
  let hits = 0
  let total = 0
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].close
    if (!prev) continue
    total++
    const move = ((recent[i].close - prev) / prev) * 100
    if (direction === 'long' ? move <= -pct : move >= pct) hits++
  }
  return { hits, total }
}

export function readPosition({ bars, trade, result }) {
  if (!bars?.length || !trade || !result) return null

  const atr = atrSeries(bars, 14).at(-1) ?? null
  const price = result.asOfPrice
  const leverage = trade.leverage ?? 1

  // Unleveraged, there is no liquidation level to be near.
  if (result.liquidationAt == null || !atr || !price) {
    return {
      key: 'unlevered',
      headline: 'No borrowing, so nothing to liquidate',
      read: `At ${leverage}x there is no borrowed size in this position, so it tracks the underlying and cannot be closed out against you. The whole stake is still at risk if price goes to zero, which is the only way to lose all of it here.`,
      caveat: null,
    }
  }

  const gapPct = Math.abs((result.liquidationAt - price) / price) * 100
  const gapAtr = Math.abs(result.liquidationAt - price) / atr
  const { hits, total } = adverseSessionCount(bars, gapPct, trade.direction)

  const frequency =
    total > 0
      ? hits === 0
        ? `No single session in the last ${total} moved that far against it.`
        : `${hits} of the last ${total} sessions moved at least that far against it in one day.`
      : ''

  let key
  let headline
  if (gapAtr < 1) {
    key = 'critical'
    headline = 'Inside one day’s normal range of being wiped out'
  } else if (gapAtr < 2.5) {
    key = 'tight'
    headline = 'A couple of ordinary sessions from being wiped out'
  } else if (gapAtr < 6) {
    key = 'moderate'
    headline = 'Some room, but a bad week would reach it'
  } else {
    key = 'wide'
    headline = 'Well clear of the liquidation level'
  }

  return {
    key,
    headline,
    read:
      `Price is ${gapPct.toFixed(1)}% from the level that ends this position — ${gapAtr.toFixed(1)} times ` +
      `${trade.symbol}'s recent average daily range. ${frequency} ` +
      `At ${leverage}x the borrowed size is what makes a move that ordinary decisive.`,
    gapPct,
    gapAtr,
    adverseSessions: hits,
    sessionsCounted: total,
    caveat:
      'Distance and past frequency only — a count of sessions that already happened, not a probability that the next one does. Real venues also close a position before equity reaches zero.',
  }
}
