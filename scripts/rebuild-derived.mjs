#!/usr/bin/env node
// Recompute every derived file from the bars already committed, without
// touching the network.
//
// The daily sync fetches bars and then computes the screener index and the
// correlation matrix from them. That coupling means a change to how a derived
// number is computed does not reach the site until the next scheduled run —
// so a commit that adds a column ships a site whose rows do not have it, and
// the only way to see the new work is to wait for the market to close.
//
// The bars are committed. Nothing about recomputing from them needs an API
// key, a rate limit, or eleven minutes of sleeping between requests. This does
// exactly the derived half of the sync and nothing else: it never writes a bar
// file, so it cannot invent or alter a single price.
import fs from 'node:fs'
import { TICKERS } from '../src/lib/tickers.js'
import { buildScreener, buildCorrelations } from '../src/lib/screener.js'
import { barsFileName } from '../src/lib/barsFile.js'
import { bySymbol } from '../src/lib/tickerRecord.js'

const BARS_DIR = new URL('../public/bars/', import.meta.url)
const SCREENER_PATH = new URL('../public/screener.json', import.meta.url)
const CORRELATIONS_PATH = new URL('../public/correlations.json', import.meta.url)
const TRACK_RECORD_PATH = new URL('../public/track-record.json', import.meta.url)
const TICKER_RECORD_PATH = new URL('../public/ticker-record.json', import.meta.url)

function readAllBars() {
  const out = {}
  for (const { symbol } of TICKERS) {
    const path = new URL(barsFileName(symbol), BARS_DIR)
    if (!fs.existsSync(path)) continue
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8'))
    if (parsed?.bars?.length) out[symbol] = parsed.bars
  }
  return out
}

const barsBySymbol = readAllBars()
const have = Object.keys(barsBySymbol).length
if (!have) {
  console.error('No bar files in public/bars — nothing to rebuild from.')
  process.exit(1)
}

// Carry the existing timestamp forward. These files describe the session the
// bars came from, not the moment the code was rerun, and restamping them would
// make a stale-data check report freshness that does not exist.
const generatedAt = JSON.parse(fs.readFileSync(SCREENER_PATH, 'utf8')).generatedAt ?? null

const screener = { ...buildScreener({ barsBySymbol, tickers: TICKERS }), generatedAt }
fs.writeFileSync(SCREENER_PATH, JSON.stringify(screener) + '\n')

const correlations = { ...buildCorrelations({ barsBySymbol, tickers: TICKERS }), generatedAt }
fs.writeFileSync(CORRELATIONS_PATH, JSON.stringify(correlations) + '\n')

// Sliced from the committed log rather than from the bars, but derived all the
// same, and for the same reason: a change to how it is grouped should not have
// to wait for the market to close.
const log = fs.existsSync(TRACK_RECORD_PATH) ? JSON.parse(fs.readFileSync(TRACK_RECORD_PATH, 'utf8')) : []
const tickerRecord = { generatedAt, symbols: bySymbol(log) }
fs.writeFileSync(TICKER_RECORD_PATH, JSON.stringify(tickerRecord) + '\n')

console.log(`Rebuilt from ${have} bar files (as of ${generatedAt}).`)
console.log(`  screener.json      ${screener.rows.length} rows`)
console.log(`  correlations.json  ${correlations.symbols.length} symbols, ${correlations.pairs.length} pairs`)
console.log(`  ticker-record.json ${Object.keys(tickerRecord.symbols).length} symbols, ${log.length} logged calls`)
