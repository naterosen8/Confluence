import { useCallback, useEffect, useState } from 'react'

// The tickers this particular person actually cares about.
//
// The screener tracks a fixed universe and treats every symbol in it as
// equally interesting, which no trader does. Someone watching two names has to
// re-find them in an alphabetical list every visit, and the filters added
// alongside this help only if you remember to retype the same query each time.
//
// Deliberately localStorage and not the database. A watchlist is a preference,
// not a record: it should work on the first visit with no account, no
// anonymous identity minted, no network round trip before the star responds,
// and nothing about it worth putting behind row-level security. The cost is
// that it does not follow you to another device, which is the same trade the
// simulator already makes and is stated on the page rather than hidden.

const KEY = 'confluence.watchlist.v1'

// Storage throws rather than returning null in Safari private mode and when a
// browser blocks site data, and an exception here would take out the whole
// screener. A watchlist that silently fails to persist is a much smaller
// problem than a blank page.
function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

function write(symbols) {
  try {
    localStorage.setItem(KEY, JSON.stringify(symbols))
  } catch {
    /* persistence unavailable; the in-memory list still works for this visit */
  }
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState(read)

  // Two tabs open on the same site should not disagree about what is starred.
  // The storage event fires only in the *other* tabs, which is exactly the
  // ones whose state would otherwise go stale.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setSymbols(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((symbol) => {
    setSymbols((prev) => {
      const next = prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
      write(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setSymbols([])
    write([])
  }, [])

  const has = useCallback((symbol) => symbols.includes(symbol), [symbols])

  return { symbols, has, toggle, clear, count: symbols.length }
}

// Kept out of the hook so the filtering rule is testable on its own, and so
// the screener's other filters and this one compose the same way.
//
// Strict: an empty watchlist matches nothing. The obvious alternative — treat
// an empty list as "no filter" — puts the screener in a state where the
// watchlist chip is visibly active and every ticker is still listed, which
// reads as a broken filter. The caller distinguishes "nothing starred yet"
// from "starred names, none of which match the other filters" and says so;
// that is a question about wording, not about what the set operation means.
export function filterToWatchlist(rows, symbols) {
  const set = new Set(symbols ?? [])
  return rows.filter((r) => set.has(r.symbol))
}
