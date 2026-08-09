import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { getSeries, HAS_LIVE_DATA, DATA_GENERATED_AT } from '../lib/dataProvider'
import { computeSignals } from '../lib/indicators'
import { bestAvailableStat, FORWARD_DAYS } from '../lib/backtest'
import { pollLivePrices, HAS_LIVE_PRICE } from '../lib/livePrice'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'
import Explain from '../components/Explain'
import LivePrice from '../components/LivePrice'

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

  const rows = useMemo(() => {
    const spyBars = getSeries('SPY')
    return TICKERS.map((t) => {
      const bars = getSeries(t.symbol)
      const signals = computeSignals(bars)
      const setup = bestAvailableStat(bars, spyBars)
      return { ...t, bars, signals, setup }
    })
  }, [])

  const topSetups = useMemo(
    () =>
      [...rows]
        .filter((r) => r.setup.stat)
        .sort((a, b) => Math.abs(b.setup.edge) - Math.abs(a.setup.edge))
        .slice(0, 5),
    [rows]
  )

  return (
    <div>
      <div className="toolbar">
        <span className="muted">
          {HAS_LIVE_DATA
            ? `Daily market data — last synced ${formatSyncTime(DATA_GENERATED_AT)}`
            : 'Demo data — market data syncs daily via GitHub Actions (not run yet)'}
          {HAS_LIVE_PRICE && ' + live price ticker (Finnhub)'}
        </span>
      </div>

      {topSetups.length > 0 && (
        <div className="top-setups">
          <h2>Top setups right now</h2>
          <p className="muted small">
            Ranked by how much historical evidence backs the current setup — win-rate deviation from 50%, weighted by
            sample size — not just by how bullish or bearish the badge looks.
          </p>
          <div className="top-setups-grid">
            {topSetups.map((row) => {
              const { stat, source } = row.setup
              const direction = stat.winRate >= 50 ? 'bullish' : 'bearish'
              return (
                <Link key={row.symbol} to={`/ticker/${encodeURIComponent(row.symbol)}`} className="top-setup-card">
                  <div className="top-setup-head">
                    <strong>{row.symbol}</strong>
                    <VerdictBadge verdict={row.signals.verdict} />
                  </div>
                  {/* Spelling out the direction matters here: a card reading
                      "0% win rate" next to a "Bullish" badge looks like a
                      contradiction until you know the win rate is what
                      *happened next* historically, not a rating of the setup.
                      Colour alone also left the whole distinction invisible to
                      colourblind readers. */}
                  <div className={`top-setup-stat top-setup-${direction}`}>
                    {direction === 'bullish' ? 'Rose' : 'Fell'} {Math.max(stat.winRate, 100 - stat.winRate).toFixed(0)}% of
                    the time
                  </div>
                  <div className="muted small">
                    {stat.avgReturn >= 0 ? '+' : ''}
                    {stat.avgReturn.toFixed(2)}% avg over the next {FORWARD_DAYS} sessions · N={stat.sampleSize} (
                    {source === 'regime-matched' ? 'this regime' : 'all history'})
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Trend</th>
            <th><Explain term="rsi">RSI(14)</Explain></th>
            <th><Explain term="macd">MACD</Explain></th>
            <th>Flags</th>
            <th><Explain term="edge">Edge</Explain></th>
            <th><Explain term="confluenceScore">Confluence</Explain></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { signals, setup } = row
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
                <td>
                  <LivePrice basePrice={signals.price} liveQuote={livePrices[row.symbol]} />
                </td>
                <td>
                  <Sparkline values={row.bars.slice(-40).map((b) => b.close)} />
                </td>
                <td>{signals.rsi != null ? signals.rsi.toFixed(1) : '—'}</td>
                <td>{signals.macd ? (signals.macd.histogram > 0 ? 'Above signal' : 'Below signal') : '—'}</td>
                <td className="muted small">{flags.length ? flags.join(', ') : '—'}</td>
                <td className="muted small">
                  {setup.stat ? `${setup.stat.winRate.toFixed(0)}% (N=${setup.stat.sampleSize})` : '—'}
                </td>
                <td>
                  <VerdictBadge verdict={signals.verdict} />
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
