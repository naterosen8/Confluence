export function sma(values, period) {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

export function smaSeries(values, period) {
  const result = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) result[i] = sum / period
  }
  return result
}

// Aggregates daily bars into weekly (Mon-Fri) bars. Resampled from the same
// daily series rather than fetched separately — keeps demo and live modes
// consistent and costs zero extra API calls against the free-tier limit.
export function resampleWeekly(bars) {
  const weeks = []
  let bucket = []
  for (const bar of bars) {
    const dow = new Date(bar.date + 'T00:00:00Z').getUTCDay()
    if (dow === 1 && bucket.length) {
      weeks.push(bucket)
      bucket = []
    }
    bucket.push(bar)
  }
  if (bucket.length) weeks.push(bucket)
  return weeks.map((week) => ({
    date: week[week.length - 1].date,
    open: week[0].open,
    high: Math.max(...week.map((b) => b.high)),
    low: Math.min(...week.map((b) => b.low)),
    close: week[week.length - 1].close,
    volume: week.reduce((a, b) => a + b.volume, 0),
  }))
}

// Bigger-picture trend check: is price above or below its 10-week average?
// The point of checking a second timeframe is that a daily signal firing
// against the weekly trend is a materially weaker setup than one firing
// with it, even though the daily indicators look identical either way.
export function weeklyTrend(bars, period = 10) {
  const weekly = resampleWeekly(bars)
  const weeklyCloses = weekly.map((w) => w.close)
  const weeklySma = sma(weeklyCloses, period)
  if (weeklySma == null) return { trend: null, weeklySma: null, weeklyClose: null }
  const weeklyClose = weeklyCloses[weeklyCloses.length - 1]
  return { trend: weeklyClose > weeklySma ? 'up' : 'down', weeklySma, weeklyClose }
}

function stdev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function emaSeries(values, period) {
  const result = new Array(values.length).fill(null)
  if (values.length < period) return result
  const k = 2 / (period + 1)
  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  result[period - 1] = emaVal
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k)
    result[i] = emaVal
  }
  return result
}

// Wilder's smoothing — the standard RSI formula (first value is a plain average
// of the first `period` changes, every value after is smoothed against it).
export function rsiSeries(closes, period = 14) {
  const result = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return result
  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

export function rsi(closes, period = 14) {
  const series = rsiSeries(closes, period)
  return series[series.length - 1]
}

// Returns the MACD histogram (macd line minus signal line) for every index,
// null until enough history exists. Single pass — used by both the live
// snapshot and the backtester so "just crossed" events are detected the
// same way in both places.
export function macdHistogramSeries(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = emaSeries(closes, fast)
  const slowEma = emaSeries(closes, slow)
  const macdLine = closes.map((_, i) => (fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null))
  const validStart = macdLine.findIndex((v) => v != null)
  const histogram = new Array(closes.length).fill(null)
  if (validStart === -1) return histogram
  const compact = macdLine.slice(validStart)
  const signalCompact = emaSeries(compact, signalPeriod)
  for (let i = 0; i < compact.length; i++) {
    if (signalCompact[i] != null) histogram[validStart + i] = { macd: compact[i], signal: signalCompact[i], histogram: compact[i] - signalCompact[i] }
  }
  return histogram
}

export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const series = macdHistogramSeries(closes, fast, slow, signalPeriod)
  return series[series.length - 1]
}

function trueRanges(bars) {
  const tr = new Array(bars.length).fill(null)
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]
    const prevClose = bars[i - 1].close
    tr[i] = Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose))
  }
  return tr
}

export function atrSeries(bars, period = 14) {
  const tr = trueRanges(bars)
  const result = new Array(bars.length).fill(null)
  for (let i = period; i < bars.length; i++) {
    const window = tr.slice(i - period + 1, i + 1)
    if (window.some((v) => v == null)) continue
    result[i] = window.reduce((a, b) => a + b, 0) / period
  }
  return result
}

// Where today's ATR sits versus its own recent history — 0-100 percentile.
// Low percentile = volatility is compressed ("squeeze"), which historically
// often precedes a larger move (direction unknown). High percentile = the
// move has likely already happened; late to chase.
export function atrPercentile(bars, period = 14, lookback = 100) {
  const series = atrSeries(bars, period).filter((v) => v != null)
  if (series.length < 10) return null
  const recent = series.slice(-lookback)
  const latest = recent[recent.length - 1]
  const below = recent.filter((v) => v < latest).length
  return (below / recent.length) * 100
}

export function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  const middle = slice.reduce((a, b) => a + b, 0) / period
  const sd = stdev(slice)
  const upper = middle + mult * sd
  const lower = middle - mult * sd
  const price = closes[closes.length - 1]
  return { middle, upper, lower, percentB: (price - lower) / (upper - lower), bandwidth: (upper - lower) / middle }
}

export function bollingerSqueeze(closes, period = 20, mult = 2, lookback = 100) {
  const series = []
  for (let i = period - 1; i < closes.length; i++) {
    const b = bollinger(closes.slice(0, i + 1), period, mult)
    series.push(b ? b.bandwidth : null)
  }
  const valid = series.filter((v) => v != null)
  if (valid.length < 20) return null
  const recent = valid.slice(-lookback)
  const latest = recent[recent.length - 1]
  const below = recent.filter((v) => v < latest).length
  const percentile = (below / recent.length) * 100
  return { percentile, isSqueeze: percentile < 20 }
}

export function relativeVolume(bars, period = 20) {
  if (bars.length < period + 1) return null
  const latest = bars[bars.length - 1].volume
  const priorSlice = bars.slice(-period - 1, -1).map((b) => b.volume)
  const avg = priorSlice.reduce((a, b) => a + b, 0) / priorSlice.length
  if (!avg) return null
  return latest / avg
}

// Local extrema: a bar whose high/low is the most extreme within `strength`
// bars on either side. This is what real support/resistance is — a price
// level the market has already reacted to — as opposed to a moving average,
// which is just a lagging trend line with no reason for price to respect it.
export function findSwingPoints(bars, strength = 3) {
  const highs = []
  const lows = []
  for (let i = strength; i < bars.length - strength; i++) {
    const window = bars.slice(i - strength, i + strength + 1)
    if (bars[i].high === Math.max(...window.map((b) => b.high))) {
      highs.push({ index: i, price: bars[i].high, date: bars[i].date })
    }
    if (bars[i].low === Math.min(...window.map((b) => b.low))) {
      lows.push({ index: i, price: bars[i].low, date: bars[i].date })
    }
  }
  return { highs, lows }
}

export function nearestLevels(bars, price, lookback = 150) {
  const recentBars = bars.slice(-lookback)
  const { highs, lows } = findSwingPoints(recentBars, 3)
  const resistance = highs.filter((h) => h.price > price).sort((a, b) => a.price - b.price)[0] || null
  const support = lows.filter((l) => l.price < price).sort((a, b) => b.price - a.price)[0] || null
  return { support, resistance }
}

// Bearish divergence: price makes a higher swing high, RSI makes a lower one
// — momentum isn't confirming the new high. Bullish divergence is the mirror
// case on swing lows. Restricted to the most recent two swings within
// `lookback` bars so it reflects current structure, not ancient history.
export function detectDivergence(bars, lookback = 60) {
  const closes = bars.map((b) => b.close)
  const rsiArr = rsiSeries(closes)
  const { highs, lows } = findSwingPoints(bars, 3)
  const floor = bars.length - lookback

  let bearish = null
  const recentHighs = highs.filter((h) => h.index >= floor).slice(-2)
  if (recentHighs.length === 2) {
    const [a, b] = recentHighs
    const rsiA = rsiArr[a.index]
    const rsiB = rsiArr[b.index]
    if (b.price > a.price && rsiA != null && rsiB != null && rsiB < rsiA) {
      bearish = { priorDate: a.date, priorPrice: a.price, priorRsi: rsiA, recentDate: b.date, recentPrice: b.price, recentRsi: rsiB }
    }
  }

  let bullish = null
  const recentLows = lows.filter((l) => l.index >= floor).slice(-2)
  if (recentLows.length === 2) {
    const [a, b] = recentLows
    const rsiA = rsiArr[a.index]
    const rsiB = rsiArr[b.index]
    if (b.price < a.price && rsiA != null && rsiB != null && rsiB > rsiA) {
      bullish = { priorDate: a.date, priorPrice: a.price, priorRsi: rsiA, recentDate: b.date, recentPrice: b.price, recentRsi: rsiB }
    }
  }

  return { bullish, bearish }
}

// The confluence score computed for every historical day, not just today.
// This is what makes the backtest a real statement about "confluence" as a
// combined condition, rather than four separate single-signal base rates
// added together after the fact. Deliberately excludes divergence — swing
// detection is expensive to recompute per day across the whole history —
// so this tracks RSI + MACD + trend + weekly alignment only.
export function scoreSeries(bars) {
  const closes = bars.map((b) => b.close)
  const rsiArr = rsiSeries(closes, 14)
  const macdArr = macdHistogramSeries(closes)
  const sma50Arr = smaSeries(closes, 50)
  const sma200Arr = smaSeries(closes, 200)
  const scores = new Array(bars.length).fill(null)

  for (let i = 0; i < bars.length; i++) {
    if (sma200Arr[i] == null) continue
    let bullish = 0
    let bearish = 0
    if (rsiArr[i] != null) {
      if (rsiArr[i] < 30) bullish++
      else if (rsiArr[i] > 70) bearish++
    }
    if (macdArr[i] != null) {
      if (macdArr[i].histogram > 0) bullish++
      else bearish++
    }
    if (sma50Arr[i] != null) {
      if (sma50Arr[i] > sma200Arr[i]) bullish++
      else bearish++
      if (closes[i] > sma50Arr[i]) bullish++
      else bearish++
    }
    const weekly = weeklyTrend(bars.slice(0, i + 1))
    if (weekly.trend === 'up') bullish++
    else if (weekly.trend === 'down') bearish++

    scores[i] = bullish - bearish
  }
  return scores
}

export function computeSignals(bars) {
  const closes = bars.map((b) => b.close)
  const price = closes[closes.length - 1]
  const rsiVal = rsi(closes, 14)
  const sma50 = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const macdRes = macd(closes)
  const atrPct = atrPercentile(bars)
  const squeeze = bollingerSqueeze(closes)
  const relVol = relativeVolume(bars)
  const divergence = detectDivergence(bars)
  const levels = nearestLevels(bars, price)

  let bullish = 0
  let bearish = 0
  const notes = []

  if (rsiVal != null) {
    if (rsiVal < 30) {
      bullish++
      notes.push('RSI oversold (<30) — recent selling has outpaced buying by a wide margin')
    } else if (rsiVal > 70) {
      bearish++
      notes.push('RSI overbought (>70) — recent buying has outpaced selling by a wide margin')
    }
  }

  if (macdRes) {
    if (macdRes.histogram > 0) {
      bullish++
      notes.push('MACD above signal — short-term momentum (12/26-day EMA spread) is accelerating upward')
    } else {
      bearish++
      notes.push('MACD below signal — short-term momentum is accelerating downward')
    }
  }

  if (sma50 != null && sma200 != null) {
    if (sma50 > sma200) {
      bullish++
      notes.push('50-day average above 200-day average — intermediate trend is up')
    } else {
      bearish++
      notes.push('50-day average below 200-day average — intermediate trend is down')
    }
  }

  if (sma50 != null) {
    if (price > sma50) bullish++
    else bearish++
  }

  const weekly = weeklyTrend(bars)
  if (weekly.trend) {
    const dailyLean = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral'
    if (weekly.trend === 'up') {
      bullish++
      notes.push(
        dailyLean === 'bearish'
          ? 'Weekly trend is up (price above its 10-week average) — this daily signal is fighting the bigger-picture trend, a weaker setup than it looks'
          : 'Weekly trend is up (price above its 10-week average) — the bigger picture agrees with the daily signal'
      )
    } else {
      bearish++
      notes.push(
        dailyLean === 'bullish'
          ? 'Weekly trend is down (price below its 10-week average) — this daily signal is fighting the bigger-picture trend, a weaker setup than it looks'
          : 'Weekly trend is down (price below its 10-week average) — the bigger picture agrees with the daily signal'
      )
    }
  }

  if (divergence.bullish) {
    bullish += 2
    notes.push('Bullish RSI divergence — price made a lower low but RSI made a higher low, momentum is fading on the downside')
  }
  if (divergence.bearish) {
    bearish += 2
    notes.push('Bearish RSI divergence — price made a higher high but RSI made a lower high, momentum is fading on the upside')
  }

  const score = bullish - bearish
  let verdict = 'Neutral'
  if (score >= 3) verdict = 'Strong Bullish'
  else if (score >= 1) verdict = 'Bullish'
  else if (score <= -3) verdict = 'Strong Bearish'
  else if (score <= -1) verdict = 'Bearish'

  return {
    price,
    rsi: rsiVal,
    macd: macdRes,
    sma50,
    sma200,
    atrPercentile: atrPct,
    squeeze,
    relVolume: relVol,
    divergence,
    levels,
    weekly,
    score,
    verdict,
    notes,
  }
}
