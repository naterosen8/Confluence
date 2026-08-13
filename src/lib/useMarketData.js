import { useEffect, useState } from 'react'
import { loadMarketData, BARS_READY } from './dataProvider'

// Bar history is fetched on demand rather than up front.
//
// The dashboard is the page most people land on and it no longer needs bars
// at all — it reads the precomputed screener index. Downloading the full
// history for every tracked symbol just in case someone clicks through is
// what made the ticker list unable to grow: at ~20 KB gzipped per symbol,
// prefetching is 3 MB at 150 tickers and 10 MB at 500, spent on a page that
// does not use a byte of it.
//
// Pages that genuinely need bars — a ticker's own page, the trades simulator —
// ask for them here and show a brief loading state on a cold visit.
export function useMarketData() {
  const [ready, setReady] = useState(BARS_READY)
  useEffect(() => {
    if (ready) return
    let alive = true
    loadMarketData().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [ready])
  return ready
}
