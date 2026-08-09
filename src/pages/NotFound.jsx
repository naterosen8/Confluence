import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'

// Used both for genuinely unknown URLs and for /ticker/<symbol> where the
// symbol isn't one this app tracks. The second case matters more than it
// looks: without it, an unknown symbol fell through to the demo random-walk
// generator and rendered a complete, authoritative-looking analysis —
// verdict badge, base rates, even a shareable card captioned "backtested
// against real history" — for a ticker that doesn't exist here.
export default function NotFound({ title = 'Page not found', message, children }) {
  useDocumentTitle(title)
  return (
    <div className="not-found">
      <h1>{title}</h1>
      <p className="muted">{message || "That page isn't part of this app."}</p>
      {children}
      <Link to="/" className="button-primary not-found-cta">
        Back to screener
      </Link>
    </div>
  )
}
