import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSeries, hasRealData, screenerRows } from '../lib/dataProvider'
import { computeSignals, atrSeries } from '../lib/indicators'
import { riskRead, stopRead, drawdownRead, recoveryRead } from '../lib/riskRead'
import { liquidityRead } from '../lib/liquidityRead'
import { plainRisks } from '../lib/plainRisk'
import { useBars } from '../lib/useMarketData'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { price as fmtPrice, rate } from '../lib/format'
import { useTrackSummary } from '../lib/useTrackSummary'

// The front door: one question, one box.
//
// Three versions of this page have now existed. The screener, which put a
// verdict badge reading "leaning up" in front of everyone before explaining
// that the badge means nothing. Then the argument, which led with the finding
// — right about the priority, wrong about the audience, because it asked
// someone to care about measurement before giving them any reason to.
//
// This one asks what they are about to buy. The person who most needs these
// numbers is about to put real money on a chart pattern; they did not arrive
// wanting a thesis, and every paragraph between them and "how big is too big"
// is a paragraph where they leave.
//
// The argument is not gone, it moved to where it lands: the moment someone
// notices they have been given three numbers and no recommendation. That is
// when "why won't you tell me?" is a live question rather than a lecture.

export default function Home() {
  useDocumentTitle('Confluence')
  const [params, setParams] = useSearchParams()
  const summary = useTrackSummary()
  const rows = useMemo(() => screenerRows(), [])
  const symbol = (params.get('symbol') || '').toUpperCase()
  const [draft, setDraft] = useState(symbol)
  useEffect(() => setDraft(symbol), [symbol])

  const known = useMemo(() => rows.map((r) => r.symbol), [rows])
  const tracked = symbol && known.includes(symbol)
  const barsReady = useBars(tracked ? [symbol] : [])
  const ready = tracked && barsReady && hasRealData(symbol)

  const read = useMemo(() => {
    if (!ready) return null
    const bars = getSeries(symbol)
    const atr = atrSeries(bars, 14).at(-1)
    return {
      price: computeSignals(bars).price,
      name: rows.find((r) => r.symbol === symbol)?.name,
      risks: plainRisks({
        risk: riskRead({ bars, symbol }),
        drawdown: drawdownRead({ bars, symbol }),
        recovery: recoveryRead({ bars, symbol, atr }),
        liquidity: liquidityRead({ bars, symbol }),
      }),
    }
  }, [ready, symbol, rows])

  const submit = (e) => {
    e.preventDefault()
    const next = draft.trim().toUpperCase()
    if (known.includes(next)) setParams({ symbol: next })
  }

  return (
    <div className="ask">
      <section className="ask-lede">
        <h1>What are you about to buy?</h1>
        <form className="ask-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="ask-symbol">
            Ticker symbol
          </label>
          <input
            id="ask-symbol"
            list="ask-symbols"
            value={draft}
            placeholder="NVDA"
            autoComplete="off"
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <datalist id="ask-symbols">
            {known.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button type="submit" className="home-cta" disabled={!known.includes(draft.trim().toUpperCase())}>
            Show me
          </button>
        </form>
        {!symbol && (
          <p className="ask-hint muted">
            Three things worth knowing before you put money on it: how big is too big, how far down it goes while
            you hold it, and whether it comes back. Measured from what this instrument has actually done — not
            predicted.
          </p>
        )}
        {symbol && !tracked && (
          <p className="ask-hint muted">
            “{symbol}” isn’t one of the {known.length} tracked here. Try another, or{' '}
            <Link to="/screener">browse the list</Link>.
          </p>
        )}
        {tracked && !barsReady && <p className="ask-hint muted">Loading {symbol}’s history…</p>}
      </section>

      {ready && read && (
        <>
          <div className="ask-subject">
            <h2>
              {symbol} <span className="muted">{read.name}</span>
            </h2>
            <span className="muted small">last close {fmtPrice(read.price)}</span>
          </div>

          <div className="ask-answers">
            {read.risks.map((r) => (
              <section key={r.key} className="ask-answer">
                {r.figure && (
                  <div className="ask-figure">
                    <strong>{r.figure}</strong>
                    <span className="muted small">{r.label}</span>
                  </div>
                )}
                <div className="ask-answer-body">
                  <h3>{r.headline}</h3>
                  <p>{r.body}</p>
                </div>
              </section>
            ))}
          </div>

          {/* The refusal, placed where it is a live question rather than a
              lecture: they have just been given three numbers and no verdict,
              and this is the moment they notice. */}
          <div className="ask-refusal">
            <h3>We haven’t told you whether to buy it.</h3>
            {/* Both figures read from the published record. Writing "49.8%"
                here — which the first version did — puts a number that was
                true once on the most-read page on the site, and it is exactly
                the thing lib/verdict.js exists to prevent. */}
            <p>
              That’s deliberate. This site tests whether the usual chart signals predict which way price goes:{' '}
              {summary?.resolvedCount ? (
                <>
                  every call published before the outcome was known, {summary.resolvedCount.toLocaleString()} of them
                  resolved so far, and the hit rate is {rate(summary.overall.winRate, 1)} — a coin flip.
                </>
              ) : (
                <>every call published before the outcome was known, and scored automatically five sessions later.</>
              )}{' '}
              Anyone telling you otherwise is selling something.
            </p>
            <p>
              <Link to="/why">See the evidence →</Link>
            </p>
          </div>

          <p className="muted small ask-more">
            <Link to={`/check?symbol=${encodeURIComponent(symbol)}`}>Work out a position size</Link> from what you
            have and what you’d risk · <Link to={`/ticker/${encodeURIComponent(symbol)}`}>Everything on {symbol}</Link>{' '}
            · <Link to="/screener">All {known.length} tracked</Link>
          </p>
        </>
      )}
    </div>
  )
}
