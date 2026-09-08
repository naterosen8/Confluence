import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSeries, hasRealData, screenerRows, loadCorrelations, correlationData } from '../lib/dataProvider'
import { computeSignals, atrSeries } from '../lib/indicators'
import { riskRead, stopRead, drawdownRead, recoveryRead } from '../lib/riskRead'
import { liquidityRead } from '../lib/liquidityRead'
import { overlapRead } from '../lib/overlapRead'
import { useWatchlist } from '../lib/watchlist'
import { useBars } from '../lib/useMarketData'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import PositionSizer from '../components/PositionSizer'
import PlainRead from '../components/PlainRead'
import Explain from '../components/Explain'

// The tool half of the product.
//
// Everything here already existed, spread across a ticker page's risk chapter,
// the overlap page and a sizing panel at the bottom of a scroll. What it did
// not have was a front door of its own — you reached it by picking a ticker
// first, which assumes you already know which one you are worried about and
// that you will keep scrolling once you get there.
//
// This asks the question directly: you are thinking about a position, so what
// has this instrument already done to one. It does not ask which way you lean
// and it will not offer an opinion, because the front page explains at length
// why it has none worth having.

export default function RiskCheck() {
  useDocumentTitle('Risk check')
  const [params, setParams] = useSearchParams()
  const rows = useMemo(() => screenerRows(), [])
  const symbol = params.get('symbol') || ''
  const [draft, setDraft] = useState(symbol)
  const watchlist = useWatchlist()
  const [matrix, setMatrix] = useState(() => correlationData())

  useEffect(() => {
    let live = true
    loadCorrelations().then((m) => live && setMatrix(m))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => setDraft(symbol), [symbol])

  const known = useMemo(() => rows.map((r) => r.symbol), [rows])
  const tracked = symbol && known.includes(symbol)
  // Bar history is fetched per symbol, on demand — the page has to ask for it
  // rather than assume. Without this, getSeries' guard fired and the page
  // reported "no synced history" when the truth was "not fetched yet": the
  // guard was right to refuse and the message was wrong.
  const barsReady = useBars(tracked ? [symbol] : [])
  const valid = tracked && barsReady && hasRealData(symbol)

  const reads = useMemo(() => {
    if (!valid) return null
    const bars = getSeries(symbol)
    const atr = atrSeries(bars, 14).at(-1)
    const signals = computeSignals(bars)
    return {
      bars,
      atr,
      price: signals.price,
      risk: riskRead({ bars, symbol }),
      stop: stopRead({ bars, symbol, atr }),
      drawdown: drawdownRead({ bars, symbol }),
      recovery: recoveryRead({ bars, symbol, atr }),
      liquidity: liquidityRead({ bars, symbol }),
    }
  }, [valid, symbol])

  const overlap = useMemo(() => {
    if (!valid || !matrix) return null
    const others = watchlist.symbols.filter((s) => s !== symbol)
    if (!others.length) return null
    return overlapRead({ matrix, symbols: [symbol, ...others] })
  }, [valid, matrix, symbol, watchlist.symbols])

  const submit = (e) => {
    e.preventDefault()
    const next = draft.trim().toUpperCase()
    if (known.includes(next)) setParams({ symbol: next })
  }

  return (
    <div>
      <div className="page-head">
        <h1>Risk check</h1>
        <p className="muted">
          What this instrument has already done to a position — before you take one. Nothing here says whether to
          take it or which way to lean; <Link to="/">the front page</Link> sets out why the site has no view worth
          having on that.
        </p>
      </div>

      <form className="check-form" onSubmit={submit}>
        <label htmlFor="check-symbol">
          <span className="muted small">Instrument</span>
          <input
            id="check-symbol"
            list="check-symbols"
            value={draft}
            placeholder="NVDA"
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <datalist id="check-symbols">
          {known.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="submit" className="button-secondary" disabled={!known.includes(draft.trim().toUpperCase())}>
          Check
        </button>
      </form>

      {!symbol && (
        <div className="callout">
          <strong>Pick an instrument.</strong> Any of the {known.length} tracked here, or start from the{' '}
          <Link to="/screener">screener</Link> if you are not sure which. The check answers six questions: what size
          this has already liquidated, where a stop stops being noise, how far under water a hold goes, how long
          until it comes back, whether you can get out at the screen price, and what else you already hold that is
          the same trade.
        </div>
      )}

      {symbol && tracked && !barsReady && <p className="muted">Loading {symbol}’s history…</p>}

      {symbol && !tracked && (
        <div className="callout">
          <strong>“{symbol}” is not tracked here.</strong> The check works from real synced bars and will not compute
          risk figures without them. Pick one of the {known.length} instruments in the list.
        </div>
      )}

      {symbol && tracked && barsReady && !hasRealData(symbol) && (
        <div className="callout">
          <strong>No synced history for {symbol} yet.</strong> It is on the tracked list but has not been through a
          sync, so there is nothing real to measure. It will appear here once the daily job has run on it.
        </div>
      )}

      {valid && reads && (
        <>
          <div className="check-head">
            <h2>
              <Link to={`/ticker/${encodeURIComponent(symbol)}`}>{symbol}</Link>
            </h2>
            <span className="muted small">
              {rows.find((r) => r.symbol === symbol)?.name} · last close ${reads.price?.toFixed(2)}
            </span>
          </div>

          {reads.risk && (
            <PlainRead
              term="riskRead"
              tone={reads.risk.safeLeverage == null || reads.risk.safeLeverage < 3 ? 'down' : undefined}
              headline={reads.risk.headline}
              caveat={reads.risk.caveat}
            >
              {reads.risk.read}
            </PlainRead>
          )}
          {reads.stop && (
            <PlainRead term="stopRead" headline={reads.stop.headline} caveat={reads.stop.caveat}>
              {reads.stop.read}
            </PlainRead>
          )}
          {reads.drawdown && (
            <PlainRead term="drawdownRead" headline={reads.drawdown.headline} caveat={reads.drawdown.caveat}>
              {reads.drawdown.read}
            </PlainRead>
          )}
          {reads.recovery && (
            <PlainRead
              term="recoveryRead"
              tone={reads.recovery.neverRecoveredPct >= 25 ? 'down' : undefined}
              headline={reads.recovery.headline}
              caveat={reads.recovery.caveat}
            >
              {reads.recovery.read}
            </PlainRead>
          )}
          {reads.liquidity && (
            <PlainRead
              term="absorbableSize"
              tone={reads.liquidity.thin ? 'down' : undefined}
              headline={reads.liquidity.headline}
              caveat={reads.liquidity.caveat}
            >
              {reads.liquidity.read}
            </PlainRead>
          )}

          {overlap && overlap.count >= 2 && (
            <PlainRead term="effectiveBets" tone={overlap.tone} headline={overlap.headline} caveat={overlap.caveat}>
              {overlap.read}
            </PlainRead>
          )}
          {!overlap && (
            <p className="muted small">
              Star a few names on the <Link to="/screener">screener</Link> and this also measures how much of your
              watchlist is the same trade as {symbol}.
            </p>
          )}

          <section className="detail-section">
            <h2>
              <Explain term="positionSizing">What that works out to</Explain>
            </h2>
            <PositionSizer
              symbol={symbol}
              price={reads.price}
              atr={reads.atr}
              stop={reads.stop}
              safeLeverage={reads.risk?.safeLeverage ?? null}
              liquidity={reads.liquidity}
            />
          </section>

          <p className="muted small">
            Every figure here is worked through on{' '}
            <Link to={`/ticker/${encodeURIComponent(symbol)}/risk`}>{symbol}’s risk chapter</Link>, and the{' '}
            <Link to={`/ticker/${encodeURIComponent(symbol)}`}>brief</Link> puts the whole instrument on one screen.
          </p>
        </>
      )}
    </div>
  )
}
