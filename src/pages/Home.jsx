import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSeries, hasRealData, screenerRows } from '../lib/dataProvider'
import { computeSignals, atrSeries } from '../lib/indicators'
import { riskRead, stopRead, drawdownRead, recoveryRead } from '../lib/riskRead'
import { liquidityRead } from '../lib/liquidityRead'
import { plainRisks } from '../lib/plainRisk'
import { guide, LEVERAGE_ANSWERS, HORIZON_ANSWERS } from '../lib/guided'
import { useBars } from '../lib/useMarketData'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { price as fmtPrice, rate } from '../lib/format'
import { useTrackSummary } from '../lib/useTrackSummary'

// The front door: three short questions, then the one number that matters.
//
// Three versions of this page have now existed. The screener, which put a
// verdict badge reading "leaning up" in front of everyone before explaining
// that the badge means nothing. Then the argument, which led with the finding
// — right about the priority, wrong about the audience, because it asked
// someone to care about measurement before giving them any reason to.
//
// This one asks what they are about to buy — and then two things about how,
// because the answers change which measurement they need. Showing all three at
// once was the previous version's mistake: the person paying cash read a
// paragraph about 2x liquidation that cannot happen to them, and the person
// about to use 10x got the only number that matters as one panel of three.
//
// Nothing is hidden. Everything not promoted sits behind a control that is
// always visible, and the page says it is ordered rather than pretending to be
// complete. Demoting a true number is an editorial call; hiding one is a
// different thing.
//
// The argument is not gone, it moved to where it lands: the moment someone
// notices they have been given three numbers and no recommendation. That is
// when "why won't you tell me?" is a live question rather than a lecture.

function Step({ label, options, value, onPick }) {
  return (
    <fieldset className="step">
      <legend>{label}</legend>
      <div className="step-options">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`step-option${value === o.key ? ' step-option-active' : ''}`}
            aria-pressed={value === o.key}
            onClick={() => onPick(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Answer({ risk, lead }) {
  return (
    <section className={`ask-answer${lead ? ' ask-answer-lead' : ''}`}>
      {risk.figure && (
        <div className="ask-figure">
          <strong>{risk.figure}</strong>
          <span className="muted small">{risk.label}</span>
        </div>
      )}
      <div className="ask-answer-body">
        <h3>{risk.headline}</h3>
        <p>{risk.body}</p>
        {risk.why && <p className="ask-why muted small">{risk.why}</p>}
      </div>
    </section>
  )
}

export default function Home() {
  useDocumentTitle('Confluence')
  const [params, setParams] = useSearchParams()
  const summary = useTrackSummary()
  const rows = useMemo(() => screenerRows(), [])
  const symbol = (params.get('symbol') || '').toUpperCase()
  const [draft, setDraft] = useState(symbol)
  useEffect(() => setDraft(symbol), [symbol])

  const leverage = params.get('lev') || ''
  const horizon = params.get('hold') || ''
  const [showAll, setShowAll] = useState(false)
  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    setParams(next)
  }

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

  const guided = useMemo(
    () => (read ? guide({ leverage, horizon, risks: read.risks }) : null),
    [read, leverage, horizon]
  )

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

          {/* Two questions, inline. They decide which measurement leads —
              see lib/guided.js for why these two and not others. */}
          <div className="steps">
            <Step
              label="Are you borrowing to buy it?"
              options={LEVERAGE_ANSWERS}
              value={leverage}
              onPick={(k) => setParam('lev', k)}
            />
            {leverage && (
              <Step
                label="How long do you plan to hold?"
                options={HORIZON_ANSWERS}
                value={horizon}
                onPick={(k) => setParam('hold', k)}
              />
            )}
          </div>

          {guided && (
            <>
              <div className="ask-answers">
                <Answer risk={guided.lead} lead />
                {(showAll ? [...guided.supporting, ...guided.rest] : guided.supporting).map((r) => (
                  <Answer key={r.key} risk={r} />
                ))}
              </div>

              <p className="muted small">
                {guided.note}{' '}
                {guided.rest.length > 0 && !showAll && (
                  <button type="button" className="link-button" onClick={() => setShowAll(true)}>
                    Show the {guided.rest.length} not shown
                  </button>
                )}
                {showAll && ' Showing everything measured.'}
              </p>

              {/* The refusal, placed where it is a live question rather than a
                  lecture: they have just been given an answer and no verdict,
                  and this is the moment they notice. */}
              <div className="ask-refusal">
                <h3>We haven’t told you whether to buy it.</h3>
                <p>
                  That’s deliberate. This site tests whether the usual chart signals predict which way price goes:{' '}
                  {summary?.resolvedCount ? (
                    <>
                      every call published before the outcome was known,{' '}
                      {summary.resolvedCount.toLocaleString()} of them resolved so far, and the hit rate is{' '}
                      {rate(summary.overall.winRate, 1)} — a coin flip.
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
                <Link to={`/check?symbol=${encodeURIComponent(symbol)}`}>Work out a position size</Link> ·{' '}
                <Link to={`/ticker/${encodeURIComponent(symbol)}`}>Everything on {symbol}</Link> ·{' '}
                <Link to="/screener">All {known.length} tracked</Link>
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
