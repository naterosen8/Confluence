const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY
export const HAS_LIVE_PRICE = Boolean(FINNHUB_KEY)

// Finnhub's free quote endpoint only covers US-listed stocks/ETFs in this
// plain-ticker format — crypto needs an exchange-prefixed symbol (e.g.
// BINANCE:BTCUSDT) and a different endpoint. Rather than half-support it,
// those symbols are simply excluded from the live overlay and keep showing
// the Twelve Data price, same as when no Finnhub key is configured at all.
function isSupported(symbol) {
  return !symbol.includes('/')
}

async function fetchQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data || data.c == null || data.c === 0) return null
  return { price: data.c, change: data.d, percentChange: data.dp, timestamp: data.t }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Runs forever (until aborted), cycling through every supported symbol with
// a fixed ~1.5s gap between calls — a full 20-symbol lap takes ~30s, well
// under Finnhub's free-tier 60 req/min cap. This is a pure display overlay:
// nothing here feeds the indicator or backtest engines, which stay on
// Twelve Data's daily bars regardless of whether this loop is running.
export async function pollLivePrices(symbols, onUpdate, { signal } = {}) {
  if (!HAS_LIVE_PRICE) return
  const supported = symbols.filter(isSupported)
  if (!supported.length) return

  while (!signal?.aborted) {
    for (const symbol of supported) {
      if (signal?.aborted) return
      try {
        const quote = await fetchQuote(symbol)
        if (quote) onUpdate(symbol, quote)
      } catch {
        // Silently skip — the price simply stays on whatever it last was.
      }
      await sleep(1500)
    }
  }
}
