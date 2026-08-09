import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Dashboard from './pages/Dashboard'
import TickerDetail from './pages/TickerDetail'
import TrackRecord from './pages/TrackRecord'
import MyTrades from './pages/MyTrades'
import NotFound from './pages/NotFound'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { loadMarketData } from './lib/dataProvider'

function RoutedContent() {
  const location = useLocation()
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/ticker/:symbol" element={<TickerDetail />} />
        <Route path="/track-record" element={<TrackRecord />} />
        <Route path="/my-trades" element={<MyTrades />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    loadMarketData().finally(() => setDataReady(true))
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
        <header className="site-header">
          <Link to="/" className="brand">
            Confluence
          </Link>
          <span className="tagline">A live TA screener — not a signal service</span>
          <nav className="site-nav">
            <Link to="/my-trades">My trades</Link>
            <Link to="/track-record">Track record</Link>
          </nav>
        </header>

        <main>{dataReady ? <RoutedContent /> : <p className="muted" style={{ padding: '24px 0' }}>Loading…</p>}</main>

        <footer className="site-footer">
          Indicators are lagging by construction and everyone else sees the same numbers. This is a screening tool
          to scan many tickers at once, not investment advice.
        </footer>
        <Analytics />
      </BrowserRouter>
    </AuthProvider>
  )
}
