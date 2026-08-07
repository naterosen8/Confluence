// Runs daily via .github/workflows/sync-market-data.yml, after market
// close. Every indicator this app computes (RSI, MACD, backtests, etc.)
// is based on a *daily* close, so there's no value in fetching more often
// than once a day — doing that from the browser was blowing through
// Twelve Data's 800/day free cap in under two hours with a single tab
// open. This script fetches once, server-side, and commits the result;
// every visitor reads the same static snapshot, so the free tier covers
// unlimited concurrent traffic. It also resolves/logs the public track
// record from the same fetch, so this is the only place Twelve Data
// ever gets called — no duplicate API usage between the two features.
import fs from 'fs'
import { computeSignals } from '../src/lib/indicators.js'
import { TICKERS } from '../src/lib/tickers.js'

const API_KEY = process.env.TWELVE_DATA_KEY
const MARKET_DATA_PATH = new URL('../data/market-data.json', import.meta.url)
const TRACK_RECORD_PATH = new URL('../data/track-record.json', import.meta.url)
const FORWARD_SESSIONS = 5

if (!API_KEY) {
  console.error('TWELVE_DATA_KEY is not set — cannot sync real market data.')
  process.exit(1)
}

async function fetchBars(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=260&apikey=${API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data request failed')
  return data.values
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
}

function loadJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

function saveJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const previousSnapshot = loadJson(MARKET_DATA_PATH, { generatedAt: null, bars: {} })
  const barsBySymbol = { ...previousSnapshot.bars }
  let fetchedCount = 0
  let failedCount = 0

  for (const t of TICKERS) {
    try {
      barsBySymbol[t.symbol] = await fetchBars(t.symbol)
      fetchedCount++
    } catch (e) {
      // Keep yesterday's data for this symbol rather than dropping it —
      // a single transient failure shouldn't blank out a ticker site-wide.
      console.error(`Failed to fetch ${t.symbol}: ${e.message}`)
      failedCount++
    }
    await sleep(7500) // stay under Twelve Data's free-tier 8 req/min
  }

  saveJson(MARKET_DATA_PATH, { generatedAt: new Date().toISOString(), bars: barsBySymbol })

  const log = loadJson(TRACK_RECORD_PATH, [])
  let resolvedCount = 0
  for (const entry of log) {
    if (entry.outcome) continue
    const bars = barsBySymbol[entry.symbol]
    if (!bars) continue
    const loggedIndex = bars.findIndex((b) => b.date === entry.date)
    if (loggedIndex === -1) continue
    const targetIndex = loggedIndex + FORWARD_SESSIONS
    if (targetIndex >= bars.length) continue
    const exitPrice = bars[targetIndex].close
    const returnPct = ((exitPrice - entry.price) / entry.price) * 100
    const isBullishCall = entry.verdict.includes('Bullish')
    const isBearishCall = entry.verdict.includes('Bearish')
    entry.outcome = {
      resolvedDate: bars[targetIndex].date,
      exitPrice,
      returnPct,
      correct: isBullishCall ? returnPct > 0 : isBearishCall ? returnPct < 0 : null,
    }
    resolvedCount++
  }

  const today = new Date().toISOString().slice(0, 10)
  let loggedCount = 0
  for (const t of TICKERS) {
    const bars = barsBySymbol[t.symbol]
    if (!bars) continue
    if (log.some((e) => e.symbol === t.symbol && e.date === today)) continue
    const signals = computeSignals(bars)
    if (signals.verdict === 'Neutral') continue
    log.push({ date: today, symbol: t.symbol, verdict: signals.verdict, score: signals.score, price: signals.price })
    loggedCount++
  }

  log.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)))
  saveJson(TRACK_RECORD_PATH, log)

  console.log(
    `Synced ${fetchedCount} ticker(s), ${failedCount} failure(s) (kept prior data). Resolved ${resolvedCount} prior call(s), logged ${loggedCount} new call(s) for ${today}.`
  )
}

main()
