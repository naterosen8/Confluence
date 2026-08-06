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

function generateMockSeries(symbol, length = 220) {
  const rand = mulberry32(hashCode(symbol))
  let price = 20 + (Math.abs(hashCode(symbol)) % 400)
  const closes = []
  for (let i = 0; i < length; i++) {
    const drift = (rand() - 0.5) * 0.02
    price = Math.max(1, price * (1 + drift))
    closes.push(price)
  }
  return closes
}

const seriesStore = {}

export function getSeries(symbol) {
  if (!seriesStore[symbol]) seriesStore[symbol] = generateMockSeries(symbol)
  return seriesStore[symbol]
}

function tickMock(symbol) {
  const series = getSeries(symbol)
  const last = series[series.length - 1]
  const drift = (Math.random() - 0.5) * 0.015
  series.push(Math.max(1, last * (1 + drift)))
  if (series.length > 300) series.shift()
  return series
}

async function fetchLiveSeries(symbol, interval = '1day', outputsize = 220) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    symbol
  )}&interval=${interval}&outputsize=${outputsize}&apikey=${API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data request failed')
  const closes = data.values
    .slice()
    .reverse()
    .map((v) => parseFloat(v.close))
  seriesStore[symbol] = closes
  return closes
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Refreshes every symbol in sequence, calling onUpdate(symbol, series) as each lands.
// Throttled to stay under Twelve Data's free-tier 8 req/min cap when a key is set.
export async function refreshAll(symbols, onUpdate, { signal } = {}) {
  for (const symbol of symbols) {
    if (signal?.aborted) return
    let series
    try {
      series = HAS_LIVE_DATA ? await fetchLiveSeries(symbol) : tickMock(symbol)
    } catch {
      series = tickMock(symbol)
    }
    onUpdate(symbol, series)
    if (HAS_LIVE_DATA) await sleep(7500)
  }
}
