import { useCallback, useEffect, useState } from 'react'

// The two numbers only the person has, remembered between pages.
//
// The sizing panel is worthless if it has to be refilled on every ticker —
// comparing what a fixed risk budget buys in NVDA against what it buys in KO
// is most of the reason to have it, and that comparison dies if the inputs
// reset on navigation.
//
// Deliberately localStorage, like the watchlist and for the same reasons: it
// is a preference rather than a record, it must work on a first visit with no
// account, and account size is precisely the kind of thing that should never
// be sent anywhere. Nothing here leaves the browser.
//
// There is no default. An empty risk field stays empty, because a pre-filled
// "1%" would be this site proposing a risk budget, which is the one half of
// the sizing question it has no standing to answer.

const KEY = 'confluence.sizing.v1'

const clean = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export function readPrefs() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { equity: null, riskPct: null }
    const parsed = JSON.parse(raw)
    return { equity: clean(parsed?.equity), riskPct: clean(parsed?.riskPct) }
  } catch {
    return { equity: null, riskPct: null }
  }
}

export function writePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ equity: clean(prefs?.equity), riskPct: clean(prefs?.riskPct) }))
  } catch {
    /* persistence unavailable; the numbers still work for this page */
  }
}

export function clearPrefs() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do — there was nothing stored to begin with */
  }
}

export function useSizingPrefs() {
  const [prefs, setPrefs] = useState(readPrefs)

  // Two tabs open on the same site should not disagree about the account
  // size, the same rule the watchlist follows.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY || e.key == null) setPrefs(readPrefs())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((next) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next }
      writePrefs(merged)
      return merged
    })
  }, [])

  const forget = useCallback(() => {
    clearPrefs()
    setPrefs({ equity: null, riskPct: null })
  }, [])

  return { ...prefs, update, forget }
}
