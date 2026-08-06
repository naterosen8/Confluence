export function sma(values, period) {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function emaSeries(values, period) {
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

export function rsi(values, period = 14) {
  if (values.length < period + 1) return null
  let gains = 0
  let losses = 0
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  if (values.length < slow + signalPeriod) return null
  const fastEma = emaSeries(values, fast)
  const slowEma = emaSeries(values, slow)
  const macdLine = values
    .map((_, i) => (fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null))
    .filter((v) => v != null)
  const signalSeries = emaSeries(macdLine, signalPeriod)
  const macdVal = macdLine[macdLine.length - 1]
  const signalVal = signalSeries[signalSeries.length - 1]
  if (macdVal == null || signalVal == null) return null
  return { macd: macdVal, signal: signalVal, histogram: macdVal - signalVal }
}

export function computeSignals(closes) {
  const price = closes[closes.length - 1]
  const rsiVal = rsi(closes, 14)
  const sma50 = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const macdRes = macd(closes)

  let bullish = 0
  let bearish = 0
  const notes = []

  if (rsiVal != null) {
    if (rsiVal < 30) {
      bullish++
      notes.push('RSI oversold')
    } else if (rsiVal > 70) {
      bearish++
      notes.push('RSI overbought')
    }
  }

  if (macdRes) {
    if (macdRes.histogram > 0) {
      bullish++
      notes.push('MACD above signal')
    } else {
      bearish++
      notes.push('MACD below signal')
    }
  }

  if (sma50 != null && sma200 != null) {
    if (sma50 > sma200) {
      bullish++
      notes.push('50-SMA above 200-SMA')
    } else {
      bearish++
      notes.push('50-SMA below 200-SMA')
    }
  }

  if (sma50 != null) {
    if (price > sma50) bullish++
    else bearish++
  }

  const score = bullish - bearish
  let verdict = 'Neutral'
  if (score >= 3) verdict = 'Strong Bullish'
  else if (score >= 1) verdict = 'Bullish'
  else if (score <= -3) verdict = 'Strong Bearish'
  else if (score <= -1) verdict = 'Bearish'

  return { price, rsi: rsiVal, macd: macdRes, sma50, sma200, score, verdict, notes }
}
