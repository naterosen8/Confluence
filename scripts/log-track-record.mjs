// Runs daily via .github/workflows/track-record.yml. Fetches real bars for
// every tracked ticker, resolves any prior call that's now 5 trading
// sessions old (win/loss, actual return), and logs today's non-neutral
// verdicts. Committed straight to data/track-record.json — this file *is*
// the app's public track record, misses included.
import fs from 'fs'
import { computeSignals } from '../src/lib/indicators.js'
import { TICKERS } from '../src/lib/tickers.js'

const API_KEY = process.env.TWELVE_DATA_KEY
const LOG_PATH = new URL('../data/track-record.json', import.meta.url)
const FORWARD_SESSIONS = 5

if (!API_KEY) {
  console.error('TWELVE_DATA_KEY is not set — cannot log real track record data.')
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

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) return []
  return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'))
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2) + '\n')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const log = loadLog()
  const barsBySymbol = {}

  for (const t of TICKERS) {
    try {
      barsBySymbol[t.symbol] = await fetchBars(t.symbol)
    } catch (e) {
      console.error(`Failed to fetch ${t.symbol}: ${e.message}`)
    }
    await sleep(7500) // stay under Twelve Data's free-tier 8 req/min
  }

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
  saveLog(log)
  console.log(`Resolved ${resolvedCount} prior call(s), logged ${loggedCount} new call(s) for ${today}.`)
}

main()
