import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { getSeries, refreshAll, HAS_LIVE_DATA } from '../lib/dataProvider'
import { computeSignals } from '../lib/indicators'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'

const REFRESH_MS = HAS_LIVE_DATA ? 3 * 60 * 1000 : 15 * 1000

export default function Dashboard() {
  const [tick, setTick] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    const symbols = TICKERS.map((t) => t.symbol)

    const run = () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      refreshAll(symbols, () => setTick((t) => t + 1), { signal: controller.signal }).then(() =>
        setLastUpdated(new Date())
      )
    }

    run()
    const interval = setInterval(run, REFRESH_MS)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [])

  const rows = useMemo(
    () =>
      TICKERS.map((t) => {
        const closes = getSeries(t.symbol)
        const signals = computeSignals(closes)
        return { ...t, closes, signals }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  )

  return (
    <div>
      <div className="toolbar">
        <span className="muted">
          {HAS_LIVE_DATA ? 'Live data (Twelve Data)' : 'Demo data — set VITE_TWELVE_DATA_KEY for live quotes'}
        </span>
        <span className="muted">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}</span>
      </div>

      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Trend</th>
            <th>RSI(14)</th>
            <th>MACD</th>
            <th>Confluence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol}>
              <td>
                <Link to={`/ticker/${encodeURIComponent(row.symbol)}`} className="symbol-link">
                  <strong>{row.symbol}</strong>
                  <span className="muted small">{row.name}</span>
                </Link>
              </td>
              <td>${row.signals.price.toFixed(2)}</td>
              <td>
                <Sparkline values={row.closes.slice(-40)} />
              </td>
              <td>{row.signals.rsi != null ? row.signals.rsi.toFixed(1) : '—'}</td>
              <td>
                {row.signals.macd
                  ? row.signals.macd.histogram > 0
                    ? 'Bullish cross'
                    : 'Bearish cross'
                  : '—'}
              </td>
              <td>
                <VerdictBadge verdict={row.signals.verdict} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
