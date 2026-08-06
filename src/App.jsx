import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import TickerDetail from './pages/TickerDetail'
import TrackRecord from './pages/TrackRecord'

export default function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <Link to="/" className="brand">
          Confluence
        </Link>
        <span className="tagline">A live TA screener — not a signal service</span>
        <nav className="site-nav">
          <Link to="/track-record">Track record</Link>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ticker/:symbol" element={<TickerDetail />} />
          <Route path="/track-record" element={<TrackRecord />} />
        </Routes>
      </main>

      <footer className="site-footer">
        Indicators are lagging by construction and everyone else sees the same numbers. This is a screening tool
        to scan many tickers at once, not investment advice.
      </footer>
    </BrowserRouter>
  )
}
