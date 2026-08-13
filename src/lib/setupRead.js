import { atrSeries } from './indicators.js'

// A direct read of what a chart is actually doing, in the words a technician
// would use, plus the price that would break it.
//
// This exists because the site had become unreadable in a specific way. Every
// number was correct, every caveat was earned, and the net effect was a page
// that said "indistinguishable from chance" a dozen ways and left you with
// nothing. Honest and useless is still useless.
//
// The fix is not to start predicting. It is to describe better. "RSI 47, MACD
// below signal, score −2" is data, not a read. "Pullback inside an uptrend,
// holding above the 200-day, thesis breaks below $291.40" is a read — more
// specific, more useful, more falsifiable, and it forecasts nothing. It says
// what the chart IS, and what would prove the description wrong.
//
// Which is the honest form of conviction available here. The site's own
// measurements say the score does not predict returns, so a "buy" call would
// be invented. A structural description is not invented: either price is
// above its 200-day or it is not, either it reclaimed the level it lost or it
// did not. And every read ships with the level that falsifies it, so it can
// be checked rather than believed.

// How far price sits from a moving average, in units of its own daily range.
// Percentages are not comparable across a 4%-a-day crypto pair and a 0.8%-a-day
// utility; ATR units are.
function atrDistance(price, level, atr) {
  if (level == null || !atr) return null
  return (price - level) / atr
}

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100)

// Checked in order. The first match wins, so the more specific and more
// consequential structures are tested before the generic ones.
const PATTERNS = [
  {
    key: 'breakdown',
    name: 'Broken down through structure',
    test: (c) => c.sma200 != null && c.price < c.sma200 && c.sma50 != null && c.price < c.sma50 && c.belowSma50Atr < -0.5,
    read: (c) =>
      `Price is below both its 50-day and 200-day averages and ${Math.abs(c.belowSma50Atr).toFixed(1)} daily ranges under the 50-day. This is a downtrend, not a dip inside an uptrend — the structure that would have to hold has already gone.`,
    invalidatedBy: (c) => (c.sma50 != null ? { level: c.sma50, text: 'a daily close back above the 50-day average' } : null),
  },
  {
    key: 'failed-breakout',
    name: 'Failed breakout',
    // The nearest resistance is above price by construction, so "price is
    // below it" is not evidence of anything — that test alone matched 13 of
    // 24 tickers. A failure means the excursion through the level was
    // material and price is now materially back under it, both measured in
    // daily ranges so the threshold means the same thing on a utility and on
    // a crypto pair.
    test: (c) =>
      c.resistance != null &&
      c.atr > 0 &&
      c.recentHigh - c.resistance > 0.4 * c.atr &&
      c.resistance - c.price > 0.4 * c.atr,
    read: (c) =>
      `Price pushed $${round2(c.recentHigh - c.resistance)} through the $${round2(c.resistance)} swing high inside the last 20 sessions and is now back ${((c.resistance - c.price) / c.atr).toFixed(1)} daily ranges below it. A level reclaimed and then lost traps whoever bought the break, and that supply sits overhead.`,
    invalidatedBy: (c) => ({ level: c.resistance, text: `a daily close back above $${round2(c.resistance)}` }),
  },
  {
    key: 'capitulation',
    name: 'Washout',
    test: (c) => c.rsi != null && c.rsi < 30 && c.relVolume != null && c.relVolume >= 1.5,
    read: (c) =>
      `RSI at ${c.rsi.toFixed(0)} on ${c.relVolume.toFixed(1)}× normal volume. Heavy selling into an already-oversold reading — this is the shape of forced exits rather than an orderly decline. It marks turns and it also marks the middle of them.`,
    invalidatedBy: (c) => (c.support != null ? { level: c.support, text: `a close below the $${round2(c.support)} swing low` } : null),
  },
  {
    key: 'extended',
    name: 'Extended above trend',
    test: (c) => c.aboveSma50Atr != null && c.aboveSma50Atr > 2.5 && c.rsi != null && c.rsi > 65,
    read: (c) =>
      `Price is ${c.aboveSma50Atr.toFixed(1)} daily ranges above its 50-day average with RSI at ${c.rsi.toFixed(0)}. Stretched, not broken: a strong trend can stay stretched for weeks, but entries here are paying up and the distance back to the average is the risk.`,
    invalidatedBy: (c) => (c.sma50 != null ? { level: c.sma50, text: 'mean reversion to the 50-day average' } : null),
  },
  {
    key: 'pullback',
    name: 'Pullback inside an uptrend',
    test: (c) => c.sma200 != null && c.price > c.sma200 && c.sma50 != null && c.price < c.sma50 && c.rsi != null && c.rsi < 55,
    read: (c) =>
      `Above the 200-day, below the 50-day, RSI at ${c.rsi.toFixed(0)}. The longer-term structure is intact and the shorter one has given way — the textbook shape of either a buyable pause or the first leg of a real trend change. Nothing on this chart distinguishes those two yet.`,
    invalidatedBy: (c) => ({ level: c.sma200, text: 'a daily close below the 200-day average' }),
  },
  {
    key: 'compression',
    name: 'Compression',
    test: (c) => c.squeeze === true && c.atrPercentile != null && c.atrPercentile < 35,
    read: (c) =>
      `Bollinger bands are squeezed and daily range sits at the ${c.atrPercentile.toFixed(0)}th percentile of its own recent history. Volatility this low tends to be followed by more of it — that is the most reliable thing on this page, and it says nothing whatever about direction.`,
    invalidatedBy: (c) =>
      c.support != null && c.resistance != null
        ? { level: null, text: `resolution out of the $${round2(c.support)}–$${round2(c.resistance)} range, either way` }
        : null,
  },
  {
    key: 'trend-intact',
    name: 'Trend intact',
    test: (c) => c.sma50 != null && c.sma200 != null && c.price > c.sma50 && c.sma50 > c.sma200,
    read: (c) =>
      `Price above a rising 50-day, 50-day above the 200-day. The plainest bullish structure there is, and the most crowded — everyone else's screen shows the same thing, which is exactly why it carries no edge on its own.`,
    invalidatedBy: (c) => ({ level: c.sma50, text: 'a daily close below the 50-day average' }),
  },
  {
    key: 'no-trend',
    name: 'No trend',
    test: () => true,
    read: (c) =>
      c.support != null && c.resistance != null
        ? `Price is chopping between the $${round2(c.support)} swing low and the $${round2(c.resistance)} swing high with no clean structure either side. Trend-following indicators are at their worst here — they will whipsaw, and the score will flip around with them.`
        : `No clean structure in either direction. Trend indicators whipsaw in this state and the score will flip around with them.`,
    invalidatedBy: (c) =>
      c.resistance != null ? { level: c.resistance, text: `a decisive break of $${round2(c.resistance)} or the low beneath` } : null,
  },
]

export function readSetup(bars, signals) {
  if (!bars?.length || !signals) return null

  const atr = atrSeries(bars, 14).at(-1) ?? null
  const price = signals.price
  const resistance = signals.levels?.resistance?.price ?? null
  const support = signals.levels?.support?.price ?? null
  const recentHigh = Math.max(...bars.slice(-20).map((b) => b.high ?? b.close))

  const ctx = {
    price,
    rsi: signals.rsi,
    sma50: signals.sma50,
    sma200: signals.sma200,
    atrPercentile: signals.atrPercentile,
    squeeze: signals.squeeze?.isSqueeze ?? null,
    relVolume: signals.relVolume,
    resistance,
    support,
    recentHigh,
    atr,
    aboveSma50Atr: atrDistance(price, signals.sma50, atr),
    belowSma50Atr: atrDistance(price, signals.sma50, atr),
  }

  const pattern = PATTERNS.find((p) => {
    try {
      return p.test(ctx)
    } catch {
      return false
    }
  })
  if (!pattern) return null

  const invalidation = pattern.invalidatedBy(ctx) ?? null

  return {
    key: pattern.key,
    name: pattern.name,
    read: pattern.read(ctx),
    invalidation,
    // What the reader should weigh this against. Not a confidence score —
    // deliberately — because the site has no measured basis for one.
    caveat:
      'This describes the chart as it stands. It is not a forecast, and this site’s own measurements find no relationship between these structures and what happens next.',
  }
}
