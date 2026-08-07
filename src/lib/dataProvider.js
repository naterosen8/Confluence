import marketData from '../../data/market-data.json'

// True once a real snapshot has been synced (see scripts/sync-market-data.mjs)
// — not tied to any browser-side API key, because there isn't one anymore.
// Every indicator here is daily-bar based, so there's nothing to gain from
// polling continuously from the client: the snapshot updates once a day,
// server-side, and every visitor reads the same file. No API key ships to
// the browser, and usage doesn't scale with how many people have the site
// open — it's a fixed ~22 requests/day regardless of traffic.
export const HAS_LIVE_DATA = Object.keys(marketData.bars || {}).length > 0
export const DATA_GENERATED_AT = marketData.generatedAt

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
// is fully explorable before the first sync has run, or for any symbol the
// sync failed to fetch. Backtest stats computed against it are illustrative
// of the *mechanism* only — they say nothing about real markets.
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

// Real synced data for a symbol is returned as-is (frozen for the session —
// it only changes when the next daily sync ships a new build). Falls back
// to a demo random walk for any symbol the snapshot doesn't have.
export function getSeries(symbol) {
  if (marketData.bars?.[symbol]?.length) return marketData.bars[symbol]
  if (!seriesStore[symbol]) seriesStore[symbol] = generateMockBars(symbol)
  return seriesStore[symbol]
}

export function hasRealData(symbol) {
  return Boolean(marketData.bars?.[symbol]?.length)
}
