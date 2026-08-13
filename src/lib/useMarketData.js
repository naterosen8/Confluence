import { useEffect, useState } from 'react'
import { loadBars } from './dataProvider.js'

// Bar history is fetched per symbol, on demand.
//
// The dashboard is the page most people land on and it needs no bars at all —
// it reads the precomputed screener index. Fetching the full history for every
// tracked symbol just in case someone clicks through is what kept the ticker
// list from growing: at ~20 KB gzipped per symbol that is 3 MB at 150 tickers
// and 10 MB at 500, spent on a page that never reads a byte of it.
//
// Pages that do need bars name the symbols they need. A ticker page wants its
// own plus SPY, whose trend defines the market regime the base rates are
// matched against; the simulator wants whichever symbols have positions.
export function useBars(symbols) {
  const key = [...new Set(symbols.filter(Boolean))].sort().join(',')
  const [readyKey, setReadyKey] = useState(null)
  useEffect(() => {
    let alive = true
    loadBars(key ? key.split(',') : []).then(() => alive && setReadyKey(key))
    return () => {
      alive = false
    }
  }, [key])
  return readyKey === key
}
