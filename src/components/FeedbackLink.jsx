import { Link, useLocation } from 'react-router-dom'

// A link to the feedback form that carries the page it was clicked from.
//
// Client-side navigation does not set document.referrer — react-router changes
// the URL without a document load — so the form's referrer fallback only ever
// fires for someone who typed /feedback or arrived from outside. Every link
// inside the app has to hand the origin page over explicitly, and doing that
// in one place is the only way it stays true of every link rather than of the
// two that happened to be written carefully.
export default function FeedbackLink({ children, className }) {
  const location = useLocation()
  return (
    <Link to="/feedback" state={{ from: location.pathname }} className={className}>
      {children}
    </Link>
  )
}
