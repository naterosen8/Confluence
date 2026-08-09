import { useEffect, useMemo, useState } from 'react'
import { technicalLayer, fundamentalLayer, macroLayer, combineLayers, CONFLUENCE_NAME } from '../lib/confluence'
import { getSeries } from '../lib/dataProvider'

let cache = null
let inFlight = null
function loadFundamentals() {
  if (cache) return Promise.resolve(cache)
  if (!inFlight) {
    inFlight = fetch('/fundamentals.json')
      .then((r) => (r.ok ? r.json() : { companies: {} }))
      .catch(() => ({ companies: {} }))
      .then((d) => (cache = d))
  }
  return inFlight
}

const ALIGNMENT = {
  'aligned-bullish': { label: 'All available layers lean bullish', tone: 'bullish' },
  'aligned-bearish': { label: 'All available layers lean bearish', tone: 'bearish' },
  conflicting: { label: 'The layers disagree', tone: 'mixed' },
  mixed: { label: 'No clear lean', tone: 'mixed' },
  unknown: { label: 'Nothing to assess yet', tone: 'mixed' },
}

function Layer({ layer }) {
  if (!layer.available) {
    return (
      <div className="confluence-layer confluence-layer-missing">
        <div className="confluence-layer-head">
          <strong>{layer.label}</strong>
          <span className="explain-basis">Not available</span>
        </div>
        <p className="muted small">{layer.reason}</p>
      </div>
    )
  }
  const tone = layer.score > 0 ? 'bullish' : layer.score < 0 ? 'bearish' : 'mixed'
  return (
    <div className={`confluence-layer confluence-layer-${tone}`}>
      <div className="confluence-layer-head">
        <strong>{layer.label}</strong>
        <span className={`top-setup-${tone === 'mixed' ? 'bullish' : tone}`} style={{ fontSize: '0.8rem', fontWeight: 700 }}>
          {layer.lean}
        </span>
      </div>
      <ul className="confluence-reasons">
        {layer.reasons.map((r, i) => (
          <li key={i} className={`factor-${r.direction}`}>
            <span className="factor-sign">{r.direction === 'bullish' ? '+' : '−'}</span> {r.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ConfluencePanel({ symbol, kind, bars, price }) {
  const [fundamentals, setFundamentals] = useState(null)

  useEffect(() => {
    let alive = true
    loadFundamentals().then((d) => alive && setFundamentals(d))
    return () => {
      alive = false
    }
  }, [])

  const combined = useMemo(() => {
    const technical = technicalLayer(bars)
    const fundamental =
      kind === 'stock'
        ? fundamentalLayer({ company: fundamentals?.companies?.[symbol], price })
        : {
            available: false,
            reason:
              kind === 'crypto'
                ? 'No issuer, no filings — a spot crypto pair has no fundamentals to read.'
                : 'An ETF has no operating business of its own; its fundamentals are those of what it holds.',
          }
    const macro = macroLayer({ tltBars: getSeries('TLT'), hygBars: getSeries('HYG') })
    return combineLayers({ technical, fundamental, macro })
  }, [bars, price, symbol, kind, fundamentals])

  const alignment = ALIGNMENT[combined.alignment]

  return (
    <div className="confluence-panel">
      <p className="muted small">
        {CONFLUENCE_NAME.why}
      </p>

      <div className={`callout ${combined.alignment === 'conflicting' ? 'callout-highlight' : 'callout-highlight'}`}>
        <strong>{alignment.label}</strong>
        {' — '}
        {combined.complete ? (
          <>all three layers have data behind them.</>
        ) : combined.availableCount === 0 ? (
          <>none of the three layers has data yet.</>
        ) : (
          <>
            based on {combined.availableCount} of {combined.totalLayers} layers. {combined.missing.join(' and ')}{' '}
            {combined.missing.length === 1 ? 'is' : 'are'} missing, which is not the same as{' '}
            {combined.missing.length === 1 ? 'it being' : 'them being'} neutral — this is a{' '}
            {combined.availableCount}-layer reading, not a {combined.totalLayers}-layer one.
          </>
        )}
        {combined.alignment === 'conflicting' && (
          <>
            {' '}
            Disagreement between layers is information in its own right, and it is shown rather than averaged into a
            single score.
          </>
        )}
      </div>

      <div className="confluence-grid">
        {combined.layers.map((l) => (
          <Layer key={l.key} layer={l} />
        ))}
      </div>

      <p className="muted small">{CONFLUENCE_NAME.caveat}</p>
    </div>
  )
}
