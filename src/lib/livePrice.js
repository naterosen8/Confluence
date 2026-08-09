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
// a fixed gap between calls. Unlike Twelve Data, this key is unavoidably
// shared client-side — every open tab polls independently against the same
// 60 req/min account cap, not just this one. At a 2.5s gap a full ~20-symbol
// lap is ~50s (~24 req/min), leaving headroom for a couple of concurrent
// tabs before anyone hits the cap; a tighter gap looked fine for a single
// tab but left almost no margin for a second visitor. This is a pure
// display overlay: nothing here feeds the indicator or backtest engines,
// which stay on Twelve Data's daily bars regardless of whether this loop is
// running, and a rate-limited quote just silently keeps the last price
// (see the catch below) rather than breaking anything.
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
      await sleep(2500)
    }
  }
}
