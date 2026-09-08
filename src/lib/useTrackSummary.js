import { useEffect, useState } from 'react'

// The published track-record summary, fetched once and shared.
//
// Two pages need it now — the track record itself and the home page's verdict
// — and a second copy of the fetch would mean the two could disagree about
// what the record says, which is the one disagreement this site cannot afford.
let cached = null
let inflight = null

export function loadTrackSummary() {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetch('/track-record-summary.json')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        cached = data
        return data
      })
  }
  return inflight
}

export function useTrackSummary() {
  const [summary, setSummary] = useState(cached)
  useEffect(() => {
    let live = true
    loadTrackSummary().then((d) => live && setSummary(d))
    return () => {
      live = false
    }
  }, [])
  return summary
}
