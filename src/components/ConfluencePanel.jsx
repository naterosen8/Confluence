import { useEffect, useMemo, useState } from 'react'
import { technicalLayer, fundamentalLayer, macroLayer, combineLayers, CONFLUENCE_NAME } from '../lib/confluence'
import { getSeries, hasRealData, screenerMarketRead } from '../lib/dataProvider'
import Explain from './Explain'
import PlainRead from './PlainRead'
import { readFundamentals } from '../lib/fundamentalRead'
import { macroRead, macroLayerFromQuadrant } from '../lib/macroRead'
import { LAYER_TERM, LAYER_INPUTS } from '../lib/confluenceLayers'

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
  'aligned-up': { label: 'Every available layer points up' },
  'aligned-down': { label: 'Every available layer points down' },
  conflicting: { label: 'The layers disagree' },
  mixed: { label: 'No clear lean' },
  unknown: { label: 'Nothing to assess yet' },
}

function LayerInputs({ layerKey }) {
  const inputs = LAYER_INPUTS[layerKey]
  if (!inputs) return null
  return (
    <div className="layer-inputs muted small">
      <span>Reads:</span>
      {inputs.map(([term, label], i) => (
        <Explain key={`${term}-${i}`} term={term}>
          <span className="layer-input-label">{label}</span>
        </Explain>
      ))}
    </div>
  )
}

function Layer({ layer }) {
  const term = LAYER_TERM[layer.key]
  if (!layer.available) {
    return (
      <div className="confluence-layer confluence-layer-missing">
        <div className="confluence-layer-head">
          <Explain term={term}>
            <strong>{layer.label}</strong>
          </Explain>
          <span className="explain-basis">Not available</span>
        </div>
        <p className="muted small">{layer.reason}</p>
      </div>
    )
  }
  const tone = layer.score > 0 ? 'up' : layer.score < 0 ? 'down' : 'mixed'
  return (
    <div className={`confluence-layer confluence-layer-${tone}`}>
      <div className="confluence-layer-head">
        <Explain term={term}>
          <strong>{layer.label}</strong>
        </Explain>
        <span className={`layer-lean layer-lean-${tone}`}>
          {layer.lean}
        </span>
      </div>
      <ul className="confluence-reasons">
        {layer.reasons.map((r, i) => (
          <li key={i} className={`factor-${r.direction}`}>
            <span className="factor-sign">{r.direction === 'up' ? '+' : '−'}</span> {r.text}
          </li>
        ))}
      </ul>
      <LayerInputs layerKey={layer.key} />
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
    // getSeries() falls back to a generated random walk for any symbol whose
    // bars are not loaded, and this page only loads its own ticker plus SPY —
    // so the macro layer was being handed mock TLT and HYG and reporting the
    // result as measured percentages. It said "high-yield credit rose 11.5%"
    // on data that came from a random number generator.
    //
    // The macro pair is market-wide and identical on every ticker page, so the
    // fix is not to download two more histories per visit: the sync already
    // computes it once with the real bars in memory and ships it in the
    // screener index. Fall back to the layer only when the bars are genuinely
    // present, and to "not available" otherwise — which is the truth.
    const macro =
      macroLayerFromQuadrant(screenerMarketRead()?.macro) ??
      (hasRealData('TLT') && hasRealData('HYG')
        ? macroLayer({ tltBars: getSeries('TLT'), hygBars: getSeries('HYG') })
        : { available: false, reason: 'Macro proxies (TLT, HYG) have not synced yet.' })
    return combineLayers({ technical, fundamental, macro })
  }, [bars, price, symbol, kind, fundamentals])

  const alignment = ALIGNMENT[combined.alignment]

  // The balance sheet as a sentence. The layer below already lists the
  // mechanical facts; a list of facts is not a read.
  const fundamentalRead = useMemo(() => {
    const layer = combined.layers.find((l) => l.key === 'fundamental')
    if (!layer?.available || !layer.valuation) return null
    return readFundamentals({ valuation: layer.valuation, trend: layer.trend })
  }, [combined])

  // Same treatment for the macro pair. The layer scores TLT and HYG separately
  // and sums them, which nets "bonds bid while credit is sold" to neutral —
  // the one configuration where a score is worse than no score at all.
  const macro = useMemo(
    () => macroRead({ macro: combined.layers.find((l) => l.key === 'macro') }),
    [combined]
  )

  return (
    <div className="confluence-panel">
      <p className="muted small">
        <Explain term="confluence">{CONFLUENCE_NAME.why}</Explain>
      </p>

      <div className={`callout ${combined.alignment === 'conflicting' ? 'callout-highlight' : 'callout-highlight'}`}>
        <Explain term="layerAlignment">
          <strong>{alignment.label}</strong>
        </Explain>
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

      {fundamentalRead && (
        <PlainRead term="fundamentalRead" headline={fundamentalRead.headline} caveat={fundamentalRead.caveat}>
          {fundamentalRead.read}
        </PlainRead>
      )}

      {macro && (
        <PlainRead term="macroRead" headline={macro.headline} note={macro.note} caveat={macro.caveat}>
          {macro.read}
        </PlainRead>
      )}

      <div className="confluence-grid">
        {combined.layers.map((l) => (
          <Layer key={l.key} layer={l} />
        ))}
      </div>

      <p className="muted small">{CONFLUENCE_NAME.caveat}</p>
    </div>
  )
}
