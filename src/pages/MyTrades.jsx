import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HAS_SUPABASE } from '../lib/supabaseClient'
import { listTrades, closeTrade } from '../lib/trades'
import { getSeries } from '../lib/dataProvider'
import { computePnl } from '../lib/pnl'

function pct(v) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function currentPriceFor(symbol) {
  const bars = getSeries(symbol)
  return bars[bars.length - 1].close
}

export default function MyTrades() {
  const { user, loading, ensureSession } = useAuth()
  const [trades, setTrades] = useState(null)
  const [error, setError] = useState(null)
  const [closingId, setClosingId] = useState(null)

  useEffect(() => {
    if (!HAS_SUPABASE || loading || user) return
    ensureSession().catch((err) => setError(err.message || 'Could not start a session'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  useEffect(() => {
    if (!user) return
    listTrades(user.id)
      .then(setTrades)
      .catch((err) => setError(err.message || 'Failed to load trades'))
  }, [user])

  async function handleClose(trade) {
    setClosingId(trade.id)
    try {
      const price = currentPriceFor(trade.symbol)
      const { liquidated } = computePnl({
        direction: trade.direction,
        entryPrice: trade.entry_price,
        currentPrice: price,
        capital: trade.capital,
        leverage: trade.leverage,
      })
      const updated = await closeTrade(trade.id, { closePrice: price, liquidated })
      setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err.message || 'Failed to close trade')
    } finally {
      setClosingId(null)
    }
  }

  if (!HAS_SUPABASE) {
    return (
      <div>
        <h1>My trades</h1>
        <p className="muted">Simulated trades aren't set up yet.</p>
      </div>
    )
  }

  if (loading || !user) {
    return (
      <div>
        <h1>My trades</h1>
        <p className="muted">Setting up…</p>
      </div>
    )
  }

  return (
    <div>
      <h1>My trades</h1>
      <p className="muted">
        Hypothetical positions you opened yourself — the app never recommended any of these. Prices are as of the
        last daily sync, not tick-live. These are tied to this browser — there's no login, so a different browser or
        device won't see them.
      </p>

      {error && <p className="muted small">Error: {error}</p>}

      {!trades ? (
        <p className="muted">Loading trades…</p>
      ) : trades.length === 0 ? (
        <p className="muted">
          No simulated trades yet. Open one from any <Link to="/">ticker's page</Link>.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="grid trades-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Direction</th>
                <th>Entry</th>
                <th>Current / Close</th>
                <th>Capital</th>
                <th>Leverage</th>
                <th>P&amp;L</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const isOpen = trade.status === 'open'
                const price = isOpen ? currentPriceFor(trade.symbol) : trade.close_price
                const pnl = computePnl({
                  direction: trade.direction,
                  entryPrice: trade.entry_price,
                  currentPrice: price,
                  capital: trade.capital,
                  leverage: trade.leverage,
                })
                return (
                  <tr key={trade.id}>
                    <td>
                      <Link to={`/ticker/${encodeURIComponent(trade.symbol)}`} className="symbol-link">
                        <strong>{trade.symbol}</strong>
                      </Link>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{trade.direction}</td>
                    <td>${trade.entry_price.toFixed(2)}</td>
                    <td>${price.toFixed(2)}</td>
                    <td>${trade.capital.toFixed(0)}</td>
                    <td>{trade.leverage}x</td>
                    <td className={pnl.pnlDollars >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                      {pct(pnl.pnlPct)} ({pnl.pnlDollars >= 0 ? '+' : ''}${pnl.pnlDollars.toFixed(2)})
                    </td>
                    <td className="muted small" style={{ textTransform: 'capitalize' }}>
                      {trade.status}
                    </td>
                    <td>
                      {isOpen && (
                        <button className="button-secondary" disabled={closingId === trade.id} onClick={() => handleClose(trade)}>
                          {closingId === trade.id ? 'Closing…' : 'Close'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
