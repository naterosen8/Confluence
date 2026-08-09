import { useEffect } from 'react'

const BASE = 'Confluence — Live TA Screener'

// Every route rendered the same <title>, so a tab open on AAPL was
// indistinguishable from one on the track record, and a shared link previewed
// with no indication of what it pointed at.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Confluence` : BASE
    return () => {
      document.title = BASE
    }
  }, [title])
}
