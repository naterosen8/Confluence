const API_KEY = import.meta.env.VITE_TWELVE_DATA_KEY
export const HAS_LIVE_DATA = Boolean(API_KEY)

// Deterministic PRNG so each symbol's demo history is stable across reloads.
function hashCode(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return h
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isoDaysAgo(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// NOTE: this is a random walk, not a market simulation. It's here so the app
// is fully explorable without an API key. Backtest stats computed against it
// are illustrative of the *mechanism* only — they say nothing about real
// markets until a real historical feed is behind them.
function generateMockBars(symbol, length = 260) {
  const rand = mulberry32(hashCode(symbol))
  let price = 20 + (Math.abs(hashCode(symbol)) % 400)
  const baseVolume = 500_000 + (Math.abs(hashCode(symbol + 'v')) % 8_000_000)
  const bars = []
  for (let i = 0; i < length; i++) {
    const open = price
    const drift = (rand() - 0.5) * 0.02
    const close = Math.max(1, open * (1 + drift))
    const wick = Math.abs(drift) * open * (0.5 + rand())
    const high = Math.max(open, close) + wick * rand()
    const low = Math.max(0.5, Math.min(open, close) - wick * rand())
    const spike = rand() > 0.94 ? 2 + rand() * 3 : 1
    const volume = Math.round(baseVolume * (0.6 + rand() * 0.8) * spike)
    bars.push({ date: isoDaysAgo(length - i), open, high, low, close, volume })
    price = close
  }
  return bars
}

const seriesStore = {}

export function getSeries(symbol) {
  if (!seriesStore[symbol]) seriesStore[symbol] = generateMockBars(symbol)
  return seriesStore[symbol]
}

function tickMock(symbol) {
  const bars = getSeries(symbol)
  const last = bars[bars.length - 1]
  const drift = (Math.random() - 0.5) * 0.015
  const close = Math.max(1, last.close * (1 + drift))
  const wick = Math.abs(drift) * last.close * 0.5
  bars.push({
    date: new Date().toISOString().slice(0, 10),
    open: last.close,
    high: Math.max(last.close, close) + wick * Math.random(),
    low: Math.max(0.5, Math.min(last.close, close) - wick * Math.random()),
    close,
    volume: Math.round(last.volume * (0.6 + Math.random() * 0.8)),
  })
  if (bars.length > 320) bars.shift()
  return bars
}

async function fetchLiveSeries(symbol, interval = '1day', outputsize = 260) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    symbol
  )}&interval=${interval}&outputsize=${outputsize}&apikey=${API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data request failed')
  const bars = data.values
    .slice()
    .reverse()
    .map((v) => ({
      date: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume) || 0,
    }))
  seriesStore[symbol] = bars
  return bars
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Refreshes every symbol in sequence, calling onUpdate(symbol, bars) as each lands.
// Throttled to stay under Twelve Data's free-tier 8 req/min cap when a key is set.
export async function refreshAll(symbols, onUpdate, { signal } = {}) {
  for (const symbol of symbols) {
    if (signal?.aborted) return
    let bars
    try {
      bars = HAS_LIVE_DATA ? await fetchLiveSeries(symbol) : tickMock(symbol)
    } catch {
      bars = tickMock(symbol)
    }
    onUpdate(symbol, bars)
    if (HAS_LIVE_DATA) await sleep(7500)
  }
}
