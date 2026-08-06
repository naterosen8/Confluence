import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { getSeries, refreshAll, HAS_LIVE_DATA } from '../lib/dataProvider'
import { computeSignals } from '../lib/indicators'
import { backtestByScore } from '../lib/backtest'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'

const REFRESH_MS = HAS_LIVE_DATA ? 3 * 60 * 1000 : 15 * 1000
const MIN_SAMPLE = 8

// Ranks a ticker's *current* setup by how much real historical evidence
// backs it — not just whether the badge says Bullish. Prefers the
// regime-matched sample (today's kind of market specifically); falls back to
// the full-history sample if the regime-matched one is too thin to mean
// anything; reports no edge at all if neither has enough occurrences.
function rankSetup(bars, spyBars) {
  const scoreBacktest = backtestByScore(bars, spyBars)
  const row = scoreBacktest.rows.find((r) => r.score === scoreBacktest.currentScore)
  if (!row) return { edge: 0, stat: null, source: null, currentScore: scoreBacktest.currentScore }

  const useRegime = row.regimeMatched.sampleSize >= MIN_SAMPLE
  const useAll = !useRegime && row.all.sampleSize >= MIN_SAMPLE
  const stat = useRegime ? row.regimeMatched : useAll ? row.all : null
  const source = useRegime ? 'regime-matched' : useAll ? 'all-history' : null
  const edge = stat ? (stat.winRate - 50) * Math.sqrt(stat.sampleSize) : 0
  return { edge, stat, source, currentScore: scoreBacktest.currentScore }
}

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

  const rows = useMemo(() => {
    const spyBars = getSeries('SPY')
    return TICKERS.map((t) => {
      const bars = getSeries(t.symbol)
      const signals = computeSignals(bars)
      const setup = rankSetup(bars, spyBars)
      return { ...t, bars, signals, setup }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

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
          {HAS_LIVE_DATA ? 'Live data (Twelve Data)' : 'Demo data — set VITE_TWELVE_DATA_KEY for live quotes'}
        </span>
        <span className="muted">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}</span>
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
                  <div className={`top-setup-stat top-setup-${direction}`}>
                    {stat.winRate.toFixed(0)}% win rate, {stat.avgReturn >= 0 ? '+' : ''}
                    {stat.avgReturn.toFixed(2)}% avg
                  </div>
                  <div className="muted small">
                    N={stat.sampleSize} ({source === 'regime-matched' ? 'this regime' : 'all history'})
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Trend</th>
            <th>RSI(14)</th>
            <th>MACD</th>
            <th>Flags</th>
            <th>Edge</th>
            <th>Confluence</th>
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
                <td>${signals.price.toFixed(2)}</td>
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
  )
}
