import { compactMoney } from './format.js'

// The other ceiling on size.
//
// The risk page answers "what size has this instrument already gone through",
// which is a question about the instrument's volatility. It quietly assumes
// the other half: that a position of that size can be got into and out of at
// the price on the screen. For a mega-cap that is true and not worth saying.
// For a thinly-traded name it is false, and it is false in the direction that
// hurts — the session you need to be out of a thin position is the session
// everyone else needs to be out of it too, and the screen price is a price
// nobody is offering.
//
// So this measures the size at which an order stops being a price-taker.
// Nothing here is a view on the instrument; it is a fact about its order flow.

// The conventional ceiling for a single order that expects to be absorbed
// rather than to move the price: one percent of a typical session's traded
// value. It is a rule of thumb rather than a measurement — real impact depends
// on the book, the venue and the hour, none of which daily bars can see — so
// it is stated as a threshold with its name on it, not dressed up as a limit.
export const MARKET_IMPACT_SHARE = 0.01

// Twenty sessions is about a month of trading: long enough to survive one
// earnings-day volume spike, short enough to describe the name as it trades
// now rather than as it traded last year.
export const LIQUIDITY_LOOKBACK = 20

// Below this, a professional-sized position cannot be expressed in the name at
// all without becoming the market in it.
export const THIN_ABSORBABLE = 250_000

function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function percentile(values, p) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))
  return s[i]
}

// Traded value per session, in dollars.
//
// Returns an empty list rather than a list of zeros when the feed does not
// carry volume for this instrument — which is the case for every crypto pair
// here, because the provider quotes them as currency pairs and a currency pair
// has no consolidated tape. Zero volume and unreported volume look identical
// in the data and mean opposite things; treating the second as the first would
// label the most liquid instruments on the board untradeable.
export function dollarVolumes(bars, lookback = LIQUIDITY_LOOKBACK) {
  if (!bars?.length) return []
  const window = bars.slice(-lookback)
  const values = window
    .filter((b) => Number.isFinite(b.volume) && b.volume > 0 && Number.isFinite(b.close))
    .map((b) => b.close * b.volume)
  // A feed that reports volume for some sessions and not others is reporting
  // it badly; require most of the window before believing any of it.
  return values.length >= Math.ceil(window.length / 2) ? values : []
}

export function liquidityRead({ bars, symbol, lookback = LIQUIDITY_LOOKBACK }) {
  const values = dollarVolumes(bars, lookback)
  if (!values.length) {
    return {
      symbol,
      reported: false,
      headline: 'Volume not reported for this instrument',
      read:
        'The data feed quotes this as a currency pair and does not carry a volume figure for it, so there is no traded value to measure. That is a gap in the data, not a statement that the instrument is thin — these pairs are among the most heavily traded on the board.',
      caveat: 'No volume in the feed. Size against the risk figures alone here, and check depth on the venue you actually trade.',
    }
  }

  const typical = median(values)
  // The tenth-percentile session, because the day you need to be out is rarely
  // an average day, and sizing against the average is sizing against a day you
  // were not planning to trade.
  const quiet = percentile(values, 10)
  const absorbable = typical * MARKET_IMPACT_SHARE
  const absorbableQuiet = quiet * MARKET_IMPACT_SHARE
  const thin = absorbable < THIN_ABSORBABLE

  const headline = thin
    ? `Thin: ${compactMoney(absorbable)} is already 1% of a session`
    : `Absorbs about ${compactMoney(absorbable)} without moving`

  const parts = [
    `A typical session trades ${compactMoney(typical)} in this name. At the conventional one-percent-of-volume ceiling, an order up to about ${compactMoney(absorbable)} is the kind of size the book absorbs rather than reprices.`,
    `On a quiet session — the tenth-percentile day of the last ${values.length} — that falls to ${compactMoney(absorbableQuiet)}. The quiet number is the one to size against, because the day a position has to come off is not usually chosen.`,
  ]
  if (thin) {
    parts.push(
      `That is small enough that a real position cannot be expressed here without becoming a meaningful share of the day's flow, and every figure on the risk page assumes fills at the screen price.`
    )
  }

  return {
    symbol,
    reported: true,
    medianDollarVolume: typical,
    quietDollarVolume: quiet,
    absorbable,
    absorbableQuiet,
    thin,
    sessions: values.length,
    headline,
    read: parts.join(' '),
    caveat: `Measured from daily close times volume over the last ${values.length} sessions with volume in the feed. Daily bars cannot see the order book, the spread, or the difference between a name that trades all day and one that trades at the open — so this is an order of magnitude, not a fill estimate.`,
  }
}
