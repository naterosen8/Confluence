import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { screenerRows, HAS_LIVE_DATA, DATA_GENERATED_AT, isSnapshotStale, snapshotAgeDays } from '../lib/dataProvider'
import { FORWARD_DAYS } from '../lib/backtest'
import { pollLivePrices, HAS_LIVE_PRICE } from '../lib/livePrice'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'
import Explain from '../components/Explain'
import LivePrice from '../components/LivePrice'
import { rate } from '../lib/format'

function formatSyncTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Dashboard() {
  const [livePrices, setLivePrices] = useState({})

  useEffect(() => {
    const controller = new AbortController()
    const symbols = TICKERS.map((t) => t.symbol)
    pollLivePrices(symbols, (symbol, quote) => setLivePrices((prev) => ({ ...prev, [symbol]: quote })), {
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [])

  // Read straight from the precomputed index rather than downloading every
  // ticker's full history and recomputing RSI, MACD, divergence and a base-rate
  // backtest for all of them before the first row can paint. Identical numbers
  // for every visitor, computed once a day by the job that already has the
  // bars in memory. See src/lib/screener.js.
  const rows = useMemo(() => screenerRows(), [])

  const topSetups = useMemo(
    () =>
      [...rows]
        .filter((r) => r.stat && r.kind !== 'macro')
        .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
        .slice(0, 5),
    [rows]
  )

  return (
    <div>
      {isSnapshotStale() && (
        <div className="callout impact-note">
          <strong>This data is {Math.floor(snapshotAgeDays())} days old.</strong> The daily sync has not completed
          since then, so every price, indicator and base rate on this page describes that date rather than today. It
          is shown rather than hidden, but it should not be read as current.
        </div>
      )}

      {/* The screener had no h1 at all: the outline started at the "Most
          extreme readings" h2, so the site's main page was the one page with
          no top-level heading for a screen reader to land on. */}
      <div className="page-head">
        <h1>Screener</h1>
        <p className="muted small">
          {TICKERS.length} tickers, each scored on the same checks and shown with the record behind them. Click any
          symbol for the full read.
        </p>
      </div>

      <div className="toolbar">
        <span className="muted">
          {HAS_LIVE_DATA ? (
            <Explain term="dailySnapshot">Daily market data — last synced {formatSyncTime(DATA_GENERATED_AT)}</Explain>
          ) : (
            <Explain term="demoData">Demo data — market data syncs daily via GitHub Actions (not run yet)</Explain>
          )}
          {HAS_LIVE_PRICE && <Explain term="livePrice"> + live price ticker (Finnhub)</Explain>}
        </span>
      </div>

      {topSetups.length > 0 && (
        <div className="top-setups">
          <h2>
            <Explain term="edge">Most extreme readings right now</Explain>
          </h2>
          <p className="muted small">
            Ordered by how far each ticker's historical win rate sits from a coin flip, weighted by sample size. This
            is a <em>selection</em>, not a ranking of quality: picking the five most extreme results out of two dozen
            candidates produces numbers this size from pure noise too. Tested against shuffled price histories, this
            list is not distinguishable from chance (p ≈ 0.5), so treat it as a starting point for looking, not as
            evidence that these five are the strongest setups.
          </p>
          <div className="top-setups-grid">
            {topSetups.map((row) => {
              const { stat } = row
              const direction = stat.winRate >= 50 ? 'up' : 'down'
              return (
                <Link key={row.symbol} to={`/ticker/${encodeURIComponent(row.symbol)}`} className="top-setup-card">
                  <div className="top-setup-head">
                    <strong>{row.symbol}</strong>
                    <VerdictBadge verdict={row.verdict} bullishPoints={row.bullishPoints} bearishPoints={row.bearishPoints} />
                  </div>
                  {/* Spelling out the direction matters here: a card reading
                      "0% win rate" next to a "Bullish" badge looks like a
                      contradiction until you know the win rate is what
                      *happened next* historically, not a rating of the setup.
                      Colour alone also left the whole distinction invisible to
                      colourblind readers. */}
                  <div className={`top-setup-stat top-setup-${direction === 'up' ? 'bullish' : 'bearish'}`}>
                    {direction === 'up' ? 'Rose' : 'Fell'} {Math.max(stat.winRate, 100 - stat.winRate).toFixed(0)}% of
                    the time
                  </div>
                  <div className="muted small">
                    {stat.avgReturn >= 0 ? '+' : ''}
                    {stat.avgReturn.toFixed(2)}% avg over the next {FORWARD_DAYS} sessions · N={stat.sampleSize} (
                    {stat.source === 'regime-matched' ? 'this regime' : 'all history'})
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <h2 className="table-heading">All tracked tickers</h2>
      <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th>
            <th><Explain term="livePrice">Price</Explain></th>
            <th><Explain term="sparkline">Trend</Explain></th>
            <th><Explain term="rsi">RSI(14)</Explain></th>
            <th><Explain term="macd">MACD</Explain></th>
            <th><Explain term="flags">Flags</Explain></th>
            <th><Explain term="edge">Edge</Explain></th>
            <th><Explain term="verdict">Confluence</Explain></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            return (
              <tr key={row.symbol}>
                <td>
                  <Link to={`/ticker/${encodeURIComponent(row.symbol)}`} className="symbol-link">
                    <strong>{row.symbol}</strong>
                    <span className="muted small">{row.name}</span>
                  </Link>
                </td>
                <td>
                  <LivePrice basePrice={row.price} liveQuote={livePrices[row.symbol]} />
                </td>
                <td>
                  <Sparkline values={row.spark} />
                </td>
                <td>{row.rsi != null ? row.rsi.toFixed(1) : '—'}</td>
                <td>{row.macd ? (row.macd === 'above' ? 'Above signal' : 'Below signal') : '—'}</td>
                <td className="muted small">{row.flags.length ? row.flags.join(', ') : '—'}</td>
                <td className="muted small">
                  {row.stat ? `${rate(row.stat.winRate)} (N=${row.stat.sampleSize})` : '—'}
                </td>
                <td>
                  <VerdictBadge verdict={row.verdict} bullishPoints={row.bullishPoints} bearishPoints={row.bearishPoints} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}
