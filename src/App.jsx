import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

// The screener is the page every visit starts on, so it stays in the entry
// bundle. Everything else is fetched when someone actually goes there.
//
// It had all become one 656 KB chunk: the share-card canvas renderer, the
// leverage study, the Supabase client and the feedback form were downloaded
// and parsed before the first table row painted, by everyone — including the
// large majority who only ever look at the screener. The router is the natural
// seam, because these are already separate URLs.
// The screener is no longer the landing page, so it is no longer in the entry
// bundle either. What loads first is the argument.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const RiskCheck = lazy(() => import('./pages/RiskCheck'))
const Why = lazy(() => import('./pages/Why'))
const TickerDetail = lazy(() => import('./pages/TickerDetail'))
const TrackRecord = lazy(() => import('./pages/TrackRecord'))
const Overlap = lazy(() => import('./pages/Overlap'))
const MyTrades = lazy(() => import('./pages/MyTrades'))
const Methodology = lazy(() => import('./pages/Methodology'))
const Feedback = lazy(() => import('./pages/Feedback'))
import FeedbackLink from './components/FeedbackLink'
import ThemeToggle from './components/ThemeToggle'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { loadScreener } from './lib/dataProvider'
import DisclaimerGate from './components/DisclaimerGate'
import DisclaimerDeclined from './components/DisclaimerDeclined'
import { hasAccepted, clearAcceptance } from './lib/disclaimer'

function RoutedContent() {
  const location = useLocation()
  return (
    <ErrorBoundary key={location.pathname}>
      {/* A chunk that fails to arrive — a flaky connection, or a deploy that
          rotated the filenames mid-session — throws inside Suspense and is
          caught by the boundary above, which is the same treatment every other
          page-level failure gets. */}
      <Suspense fallback={<p className="muted" style={{ padding: '24px 0' }}>Loading…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/check" element={<RiskCheck />} />
          <Route path="/why" element={<Why />} />
          {/* The screener moved off the front door. Anyone who bookmarked it
              lands on the finding instead, which is the point of the move. */}
          <Route path="/screener" element={<Dashboard />} />
          <Route path="/ticker/:symbol" element={<TickerDetail />} />
          {/* Each chapter is its own URL, so a page can be linked to, opened
              in a new tab, and walked with the browser's own back button. */}
          <Route path="/ticker/:symbol/:chapter" element={<TickerDetail />} />
          <Route path="/overlap" element={<Overlap />} />
          <Route path="/track-record" element={<TrackRecord />} />
          <Route path="/my-trades" element={<MyTrades />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/methodology/:chapter" element={<Methodology />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  const [dataReady, setDataReady] = useState(false)
  // Read once at mount rather than on every render: a gate that re-evaluates
  // storage mid-session could reappear over someone's shoulder if another tab
  // cleared it.
  const [accepted, setAccepted] = useState(() => hasAccepted())
  const [declined, setDeclined] = useState(false)

  useEffect(() => {
    // Paint as soon as the screener index is in — a few KB — rather than
    // waiting on the full bar history, which is two orders of magnitude
    // larger and is only needed once someone opens a ticker page. The bars
    // are started in parallel so that page rarely waits either.
    loadScreener().finally(() => setDataReady(true))
  }, [])

  // Nothing renders behind the gate. The site is a screener that says "aligned
  // up" beside a control that goes to 50x, and the caveats are worth very
  // little if they arrive after someone has already formed a view.
  if (!accepted) {
    return declined ? (
      <DisclaimerDeclined onReconsider={() => setDeclined(false)} />
    ) : (
      <DisclaimerGate onAccept={() => setAccepted(true)} onDecline={() => setDeclined(true)} />
    )
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <header className="site-header">
          <Link to="/" className="brand">
            Confluence
          </Link>
          <span className="tagline">What a stock has already done to people who bought it</span>
          <nav className="site-nav">
            <Link to="/screener">Screener</Link>
            <Link to="/why">Does any of it work?</Link>
            <Link to="/methodology">How to read this</Link>
            <FeedbackLink>Feedback</FeedbackLink>
            <ThemeToggle />
          </nav>
        </header>

        <main>{dataReady ? <RoutedContent /> : <p className="muted" style={{ padding: '24px 0' }}>Loading…</p>}</main>

        <footer className="site-footer">
          Indicators are lagging by construction and everyone else sees the same numbers. This site measures whether
          they predict anything and publishes the answer; it is not investment advice.{' '}
          {/* The whole site rests on its numbers being checkable, which is
              worth nothing without a visible way to say one is wrong. */}
          <FeedbackLink>Spotted a number that looks wrong?</FeedbackLink>{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              clearAcceptance()
              setDeclined(false)
              setAccepted(false)
            }}
          >
            Read the disclaimer again
          </button>
        </footer>
        <Analytics />
      </BrowserRouter>
    </AuthProvider>
  )
}
