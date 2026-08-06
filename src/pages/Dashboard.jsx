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
        const bars = getSeries(t.symbol)
        const signals = computeSignals(bars)
        return { ...t, bars, signals }
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
            <th>Flags</th>
            <th>Confluence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { signals } = row
            const flags = []
            if (signals.divergence.bullish) flags.push('bullish divergence')
            if (signals.divergence.bearish) flags.push('bearish divergence')
            if (signals.squeeze?.isSqueeze) flags.push('volatility squeeze')
            if (signals.relVolume != null && signals.relVolume >= 1.5) flags.push(`${signals.relVolume.toFixed(1)}x volume`)

            return (
              <tr key={row.symbol}>
                <td>
                  <Link to={`/ticker/${encodeURIComponent(row.symbol)}`} className="symbol-link">
                    <strong>{row.symbol}</strong>
                    <span className="muted small">{row.name}</span>
                  </Link>
                </td>
                <td>${signals.price.toFixed(2)}</td>
                <td>
                  <Sparkline values={row.bars.slice(-40).map((b) => b.close)} />
                </td>
                <td>{signals.rsi != null ? signals.rsi.toFixed(1) : '—'}</td>
                <td>{signals.macd ? (signals.macd.histogram > 0 ? 'Above signal' : 'Below signal') : '—'}</td>
                <td className="muted small">{flags.length ? flags.join(', ') : '—'}</td>
                <td>
                  <VerdictBadge verdict={signals.verdict} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
