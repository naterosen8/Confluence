// Where a symbol's bar history lives, as one file per symbol.
//
// A single market-data.json was a hard ceiling, not just a slow one: at ~92 KB
// of raw bars per symbol it reaches GitHub's 100 MB per-file limit at roughly
// a thousand tickers and the push is simply rejected. Splitting by symbol
// removes that wall entirely — each file stays ~92 KB however many there are —
// and means a ticker page fetches the one symbol it is showing instead of
// every symbol the site tracks.
//
// Slashes are the only character in these symbols that a path cannot carry
// ("BTC/USD"), so they become dashes. A test asserts the mapping stays
// collision-free across the ticker list rather than trusting that it does.
export function barsFileName(symbol) {
  return `${symbol.replace(/\//g, '-')}.json`
}

export function barsPath(symbol) {
  return `/bars/${barsFileName(symbol)}`
}
