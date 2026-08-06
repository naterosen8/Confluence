import { useParams, Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { getSeries } from '../lib/dataProvider'
import { computeSignals } from '../lib/indicators'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'

export default function TickerDetail() {
  const { symbol } = useParams()
  const meta = TICKERS.find((t) => t.symbol === symbol)
  const closes = getSeries(symbol)
  const signals = computeSignals(closes)

  return (
    <div>
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <div className="detail-header">
        <div>
          <h1>{symbol}</h1>
          <p className="muted">{meta?.name || 'Unknown ticker'}</p>
        </div>
        <VerdictBadge verdict={signals.verdict} />
      </div>

      <div className="detail-chart">
        <Sparkline values={closes.slice(-90)} width={480} height={120} />
      </div>

      <div className="stat-grid">
        <Stat label="Price" value={`$${signals.price.toFixed(2)}`} />
        <Stat label="RSI (14)" value={signals.rsi != null ? signals.rsi.toFixed(1) : '—'} />
        <Stat label="50-day SMA" value={signals.sma50 != null ? `$${signals.sma50.toFixed(2)}` : 'not enough data'} />
        <Stat label="200-day SMA" value={signals.sma200 != null ? `$${signals.sma200.toFixed(2)}` : 'not enough data'} />
        <Stat
          label="MACD histogram"
          value={signals.macd ? signals.macd.histogram.toFixed(3) : 'not enough data'}
        />
        <Stat label="Confluence score" value={`${signals.score > 0 ? '+' : ''}${signals.score}`} />
      </div>

      <div className="notes">
        <h2>What's driving this</h2>
        {signals.notes.length ? (
          <ul>
            {signals.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No indicators are showing a strong lean right now.</p>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
