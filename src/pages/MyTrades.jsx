import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEnsureSession } from '../context/AuthContext'
import { HAS_SUPABASE } from '../lib/supabaseClient'
import { listTrades, closeTrade, deleteTrade } from '../lib/trades'
import { getSeries } from '../lib/dataProvider'
import { evaluatePosition } from '../lib/pnl'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function pct(v) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function evaluate(trade) {
  return evaluatePosition({
    bars: getSeries(trade.symbol),
    entryDate: trade.entry_date.slice(0, 10),
    entryPrice: trade.entry_price,
    direction: trade.direction,
    capital: trade.capital,
    leverage: trade.leverage,
  })
}

export default function MyTrades() {
  useDocumentTitle('My trades')
  const { user, loading, error: sessionError } = useEnsureSession()
  const [trades, setTrades] = useState(null)
  const [error, setError] = useState(null)
  const [closingId, setClosingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    if (!user) return
    listTrades(user.id)
      .then(async (loaded) => {
        // A leveraged position can hit -100% on a day nobody was looking and
        // recover before the next visit — walk each open trade's real price
        // path since entry and settle it as liquidated then, not "now."
        const resolved = await Promise.all(
          loaded.map(async (trade) => {
            if (trade.status !== 'open') return trade
            const result = evaluate(trade)
            if (!result.liquidated) return trade
            try {
              return await closeTrade(trade.id, {
                closePrice: result.asOfPrice,
                liquidated: true,
                closeDate: new Date(result.asOfDate).toISOString(),
              })
            } catch {
              return trade
            }
          })
        )
        setTrades(resolved)
      })
      .catch((err) => setError(err.message || 'Failed to load trades'))
  }, [user])

  async function handleClose(trade) {
    setClosingId(trade.id)
    try {
      const result = evaluate(trade)
      const updated = await closeTrade(trade.id, {
        closePrice: result.asOfPrice,
        liquidated: result.liquidated,
        closeDate: result.liquidated ? new Date(result.asOfDate).toISOString() : undefined,
      })
      setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err.message || 'Failed to close trade')
    } finally {
      setClosingId(null)
    }
  }

  async function handleDelete(trade) {
    if (!window.confirm(`Delete this simulated ${trade.direction} on ${trade.symbol}? This can't be undone.`)) return
    setDeletingId(trade.id)
    try {
      await deleteTrade(trade.id)
      setTrades((prev) => prev.filter((t) => t.id !== trade.id))
    } catch (err) {
      setError(err.message || 'Failed to delete trade')
    } finally {
      setDeletingId(null)
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

  if (sessionError) {
    return (
      <div>
        <h1>My trades</h1>
        <p className="muted small">Error: {sessionError}</p>
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

  const openTrades = trades?.filter((t) => t.status === 'open') ?? []
  const pastTrades = trades?.filter((t) => t.status !== 'open') ?? []

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
        <>
          <section className="detail-section">
            <h2>Open positions</h2>
            {openTrades.length === 0 ? (
              <p className="muted small">No open positions right now.</p>
            ) : (
              <div className="table-wrap">
                <table className="grid trades-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Direction</th>
                      <th>Entry</th>
                      <th>Current</th>
                      <th>Capital</th>
                      <th>Leverage</th>
                      <th>P&amp;L</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTrades.map((trade) => {
                      const result = evaluate(trade)
                      return (
                        <tr key={trade.id}>
                          <td>
                            <Link to={`/ticker/${encodeURIComponent(trade.symbol)}`} className="symbol-link">
                              <strong>{trade.symbol}</strong>
                            </Link>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{trade.direction}</td>
                          <td>${trade.entry_price.toFixed(2)}</td>
                          <td>${result.asOfPrice.toFixed(2)}</td>
                          <td>${trade.capital.toFixed(0)}</td>
                          <td>{trade.leverage}x</td>
                          <td className={result.pnlDollars >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {pct(result.pnlPct)} ({result.pnlDollars >= 0 ? '+' : ''}${result.pnlDollars.toFixed(2)})
                          </td>
                          <td>
                            <div className="trade-actions">
                              <button className="button-secondary" disabled={closingId === trade.id} onClick={() => handleClose(trade)}>
                                {closingId === trade.id ? 'Closing…' : 'Close'}
                              </button>
                              <button
                                className="button-secondary"
                                disabled={deletingId === trade.id}
                                onClick={() => handleDelete(trade)}
                              >
                                {deletingId === trade.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {pastTrades.length > 0 && (
            <section className="detail-section">
              <h2>Past trades</h2>
              <div className="table-wrap">
                <table className="grid trades-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Direction</th>
                      <th>Entry</th>
                      <th>Close</th>
                      <th>Capital</th>
                      <th>Leverage</th>
                      <th>P&amp;L</th>
                      <th>Result</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastTrades.map((trade) => {
                      const dirMult = trade.direction === 'long' ? 1 : -1
                      const pnlPct = Math.max(
                        -1,
                        dirMult * trade.leverage * ((trade.close_price - trade.entry_price) / trade.entry_price)
                      )
                      const pnlDollars = trade.capital * pnlPct
                      return (
                        <tr key={trade.id}>
                          <td>
                            <Link to={`/ticker/${encodeURIComponent(trade.symbol)}`} className="symbol-link">
                              <strong>{trade.symbol}</strong>
                            </Link>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{trade.direction}</td>
                          <td>${trade.entry_price.toFixed(2)}</td>
                          <td>${trade.close_price.toFixed(2)}</td>
                          <td>${trade.capital.toFixed(0)}</td>
                          <td>{trade.leverage}x</td>
                          <td className={pnlDollars >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {pct(pnlPct * 100)} ({pnlDollars >= 0 ? '+' : ''}${pnlDollars.toFixed(2)})
                          </td>
                          <td className={trade.status === 'liquidated' ? 'pnl-negative' : 'muted small'} style={{ textTransform: 'capitalize' }}>
                            {trade.status}
                          </td>
                          <td>
                            <button
                              className="button-secondary"
                              disabled={deletingId === trade.id}
                              onClick={() => handleDelete(trade)}
                            >
                              {deletingId === trade.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
