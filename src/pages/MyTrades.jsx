import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEnsureSession } from '../context/AuthContext'
import { HAS_SUPABASE } from '../lib/supabaseClient'
import { listTrades, closeTrade, deleteTrade } from '../lib/trades'
import { getSeries, hasRealData, loadBars } from '../lib/dataProvider'
import { evaluatePosition, computePnl } from '../lib/pnl'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import Explain from '../components/Explain'
import { pct, price, signedMoney, compactMoney } from '../lib/format'
import PlainRead from '../components/PlainRead'
import { readPosition } from '../lib/positionRead'

// Returns null when the symbol has no real synced history. getSeries() falls
// back to a demo random walk for anything it does not know, so without this
// guard a genuine recorded position would be marked to invented prices — and
// could even be auto-settled as liquidated against them. Same failure the
// ticker pages had; a real trade deserves it even less.
function evaluate(trade) {
  if (!hasRealData(trade.symbol)) return null
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
        // Bars are fetched per symbol now, so the history for these positions
        // has to be in hand before anything is marked to market. Without this
        // the settle pass below would run against no data, hasRealData would
        // be false for every symbol, and an open position that had actually
        // been wiped out would quietly stay open.
        await loadBars(loaded.map((t) => t.symbol))

        // A leveraged position can hit -100% on a day nobody was looking and
        // recover before the next visit — walk each open trade's real price
        // path since entry and settle it as liquidated then, not "now."
        const resolved = await Promise.all(
          loaded.map(async (trade) => {
            if (trade.status !== 'open') return trade
            const result = evaluate(trade)
            if (!result || !result.liquidated) return trade
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
      if (!result) {
        setError(`No synced price history for ${trade.symbol}, so this position can't be settled honestly.`)
        return
      }
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
        <Explain term="simulatedTrade">
          Hypothetical positions you opened yourself — the app never recommended any of these.
        </Explain>{' '}
        <Explain term="dailySnapshot">Prices are as of the last daily sync, not tick-live.</Explain> These are tied to
        this browser — there's no login, so a different browser or device won't see them.
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
          {/* How close each open position is to the level that ends it, in
              the instrument's own daily range. "Wipes out at $61,028" means
              nothing without knowing whether that is a normal Tuesday. */}
          {openTrades.map((trade) => {
            const result = evaluate(trade)
            const read = result ? readPosition({ bars: getSeries(trade.symbol), trade, result }) : null
            if (!read) return null
            return (
              <PlainRead
                key={`read-${trade.id}`}
                term="positionRead"
                tone={read.key}
                headline={`${trade.symbol} ${trade.direction} · ${read.headline}`}
                caveat={read.caveat}
              >
                {read.read}
              </PlainRead>
            )
          })}

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
                      <th><Explain term="longShort">Direction</Explain></th>
                      <th>Entry</th>
                      <th><Explain term="dailySnapshot">Current</Explain></th>
                      <th>Price move</th>
                      <th>Capital</th>
                      <th><Explain term="leverage">Leverage</Explain></th>
                      <th><Explain term="wipedOut">Wipes out at</Explain></th>
                      <th><Explain term="openPnl">P&amp;L</Explain></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTrades.map((trade) => {
                      const result = evaluate(trade)
                      if (!result) {
                        return (
                          <tr key={trade.id}>
                            <td data-label="Symbol">
                              <strong>{trade.symbol}</strong>
                            </td>
                            <td data-label="Direction" style={{ textTransform: 'capitalize' }}>{trade.direction}</td>
                            <td data-label="Entry">{price(trade.entry_price)}</td>
                            <td data-label="Status" colSpan={6} className="muted small">
                              No synced price history for this symbol — it can't be marked to market, so no figure is
                              shown rather than one from placeholder data.
                            </td>
                            <td data-label="">
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
                      }
                      return (
                        <tr key={trade.id}>
                          <td data-label="Symbol">
                            <Link to={`/ticker/${encodeURIComponent(trade.symbol)}`} className="symbol-link">
                              <strong>{trade.symbol}</strong>
                            </Link>
                          </td>
                          <td data-label="Direction" style={{ textTransform: 'capitalize' }}>{trade.direction}</td>
                          <td data-label="Entry">{price(trade.entry_price)}</td>
                          <td data-label="Current">{price(result.asOfPrice)}</td>
                          {/* The underlying move, so the leverage is visible as
                              arithmetic rather than taken on faith. */}
                          <td data-label="Price move" className="muted">{pct(result.underlyingPct)}</td>
                          <td data-label="Capital">{compactMoney(trade.capital)}</td>
                          <td data-label="Leverage">{trade.leverage}x</td>
                          <td data-label="Wipes out at" className="muted small">
                            {result.liquidationAt == null ? (
                              'no borrowing'
                            ) : (
                              <>
                                {price(result.liquidationAt)}
                                <br />
                                {pct(result.roomToLiquidationPct, 1)} away
                              </>
                            )}
                          </td>
                          <td data-label="P&L" className={result.pnlDollars >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {pct(result.pnlPct)} ({signedMoney(result.pnlDollars)})
                            <br />
                            <span className="muted small">
                              {pct(result.underlyingPct)} × {trade.leverage}
                            </span>
                          </td>
                          <td data-label="">
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
                      <th><Explain term="longShort">Direction</Explain></th>
                      <th>Entry</th>
                      <th>Close</th>
                      <th>Price move</th>
                      <th>Capital</th>
                      <th><Explain term="leverage">Leverage</Explain></th>
                      <th><Explain term="openPnl">P&amp;L</Explain></th>
                      <th><Explain term="wipedOut">Result</Explain></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastTrades.map((trade) => {
                      // Shared position math rather than a second inline copy.
                      // Two copies of this already drifted apart once in this
                      // codebase and disagreed about whether a position had
                      // been wiped out.
                      const settled = computePnl({
                        direction: trade.direction,
                        entryPrice: trade.entry_price,
                        currentPrice: trade.close_price,
                        capital: trade.capital,
                        leverage: trade.leverage,
                      })
                      const pnlDollars = settled.pnlDollars
                      return (
                        <tr key={trade.id}>
                          <td data-label="Symbol">
                            <Link to={`/ticker/${encodeURIComponent(trade.symbol)}`} className="symbol-link">
                              <strong>{trade.symbol}</strong>
                            </Link>
                          </td>
                          <td data-label="Direction" style={{ textTransform: 'capitalize' }}>{trade.direction}</td>
                          <td data-label="Entry">{price(trade.entry_price)}</td>
                          <td data-label="Close">{price(trade.close_price)}</td>
                          <td data-label="Price move" className="muted">{pct(settled.underlyingPct)}</td>
                          <td data-label="Capital">{compactMoney(trade.capital)}</td>
                          <td data-label="Leverage">{trade.leverage}x</td>
                          <td data-label="P&L" className={pnlDollars >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {pct(settled.pnlPct)} ({signedMoney(pnlDollars)})
                            <br />
                            <span className="muted small">
                              {pct(settled.underlyingPct)} × {trade.leverage}
                            </span>
                          </td>
                          <td data-label="Result" className={trade.status === 'liquidated' ? 'pnl-negative' : 'muted small'} style={{ textTransform: 'capitalize' }}>
                            {trade.status}
                          </td>
                          <td data-label="">
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
