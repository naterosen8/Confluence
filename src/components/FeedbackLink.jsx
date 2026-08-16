import { Link, useLocation } from 'react-router-dom'

// A link to the feedback form that carries the page it was clicked from, and
// optionally which kind of report it is.
//
// Client-side navigation does not set document.referrer — react-router changes
// the URL without a document load — so the form's referrer fallback only ever
// fires for someone who typed /feedback or arrived from outside. Every link
// inside the app has to hand the origin page over explicitly, and doing that
// in one place is the only way it stays true of every link rather than of the
// two that happened to be written carefully.
//
// `kind` exists because the distance between noticing a wrong figure and
// reporting it is where almost all feedback is lost. A link sitting next to
// the number, which opens the form with the right category already chosen and
// the page already attached, is a different act from finding a nav item and
// filling in a form from scratch.
export default function FeedbackLink({ children, className, kind, note }) {
  const location = useLocation()
  return (
    <Link
      to="/feedback"
      state={{ from: location.pathname, kind, note }}
      className={className}
    >
      {children}
    </Link>
  )
}
