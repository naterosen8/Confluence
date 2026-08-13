import { useEffect, useMemo, useState } from 'react'
import { balanceSheetValuation, classifyValuation, priceToBookHistory, summarizeHistory } from '../lib/mnav'
import Explain from './Explain'
// Aliased: this component takes a `price` prop, which would shadow the
// formatter and turn price(price) into a call on a number at runtime.
import { compactMoney as money, shareCount, price as priceText } from '../lib/format'

let cache = null
let inFlight = null

// Same runtime-fetch pattern as the market data: fundamentals are a separate
// static file so they never enter the JS bundle, and only this section pays
// for them.
function loadFundamentals() {
  if (cache) return Promise.resolve(cache)
  if (!inFlight) {
    inFlight = fetch('/fundamentals.json')
      .then((r) => (r.ok ? r.json() : { companies: {} }))
      .catch(() => ({ companies: {} }))
      .then((d) => {
        cache = d
        return d
      })
  }
  return inFlight
}


function Row({ label, value, note, term }) {
  return (
    <div className="stat">
      <span className="muted small">{term ? <Explain term={term}>{label}</Explain> : label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}

export default function BalanceSheetValue({ symbol, kind, price, bars }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(kind === 'stock')

  useEffect(() => {
    if (kind !== 'stock') return
    let alive = true
    loadFundamentals().then((d) => {
      if (!alive) return
      setData(d)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [kind, symbol])

  const company = data?.companies?.[symbol]
  const latest = company?.quarters?.[company.quarters.length - 1]

  const valuation = useMemo(() => balanceSheetValuation({ price, quarter: latest }), [price, latest])
  const verdict = useMemo(() => classifyValuation(valuation), [valuation])
  const history = useMemo(() => priceToBookHistory({ quarters: company?.quarters, bars }), [company, bars])
  const range = useMemo(() => summarizeHistory(history, valuation?.priceToBook), [history, valuation])

  if (kind === 'etf' || kind === 'macro') {
    return (
      <p className="muted small">
        Not applicable to an ETF. A fund's net asset value is simply the market value of what it holds, so comparing it
        to its own price measures the tracking spread — typically a few basis points on a fund this liquid — rather
        than anything about valuation.
      </p>
    )
  }

  if (kind === 'crypto') {
    return (
      <p className="muted small">
        Not applicable. There is no issuer, no balance sheet and no equity claim behind a spot crypto pair, so there is
        nothing to compare a market cap against. (This is exactly the comparison that <em>does</em> apply to
        crypto-treasury companies, which hold coins on a real balance sheet — none are in this ticker list yet.)
      </p>
    )
  }

  if (loading) return <p className="muted small">Loading balance sheet…</p>

  if (!valuation) {
    return (
      <p className="muted small">
        No balance sheet synced for {symbol} yet. Filings come from SEC EDGAR via the daily job
        (`scripts/sync-fundamentals.mjs`); until it has run, nothing is shown here rather than an estimate.
      </p>
    )
  }

  const asOfNote = `Reported ${valuation.asOf}${valuation.form ? ` (${valuation.form})` : ''}`

  return (
    <div className="balance-sheet">
      <div className={`callout ${verdict.key === 'above-book' ? '' : 'callout-highlight'}`}>
        <strong>{verdict.headline}</strong>
        <div style={{ marginTop: 6 }}>{verdict.detail}</div>
      </div>

      <div className="stat-grid">
        <Row
          term="marketCap"
          label="Market cap"
          value={money(valuation.marketCap)}
          note={
            `${shareCount(valuation.shares)} shares × ${priceText(price)}` +
            // Multi-class filers report their cover-page count per share
            // class, which the SEC's companyfacts API omits entirely, so the
            // count here is the weighted average off the income statement.
            // It is an average over the quarter rather than a count at the end
            // of it, and saying so is the difference between an approximation
            // and a wrong number presented as an exact one.
            (latest.sharesBasis === 'weighted-average'
              ? ' — weighted-average shares (this filer reports its share count per class, which the filings API omits), so the cap is approximate'
              : '')
          }
        />
        <Row
          term="bookEquity"
          label="Book equity"
          value={money(valuation.bookEquity)}
          note={
            asOfNote +
            // The old label said "(assets − liabilities)", which is only what
            // this is when the filer does not report shareholders' equity
            // directly. Where it does, this is the parent's stake and excludes
            // noncontrolling interests — billions apart at CVX, XOM and BAC.
            (latest.equityBasis === 'derived'
              ? ' · assets less liabilities, as this filer does not report shareholders\' equity directly — so it includes any minority interests'
              : ' · shareholders\' equity as reported, excluding minority interests')
          }
        />
        <Row
          term="priceToBook"
          label="Price / book"
          value={valuation.priceToBook != null ? `${valuation.priceToBook.toFixed(2)}×` : 'n/a'}
          note={
            valuation.priceToBook != null
              ? `Book value ${priceText(valuation.bookValuePerShare)}/share vs ${priceText(price)} price`
              : 'Book equity is negative, so the ratio is undefined'
          }
        />
        <Row
          term="premiumToBook"
          label="Gap vs book"
          value={valuation.premiumToBook != null ? money(valuation.premiumToBook) : 'n/a'}
          note={
            valuation.premiumPct != null
              ? `Market is paying ${valuation.premiumPct >= 0 ? '+' : ''}${valuation.premiumPct.toFixed(0)}% versus carrying value`
              : null
          }
        />
        <Row
          term="netCash"
          label="Net cash (cash − debt)"
          value={money(valuation.netCash)}
          note={`${valuation.netCashPctOfMarketCap >= 0 ? '' : '−'}${Math.abs(valuation.netCashPctOfMarketCap).toFixed(0)}% of market cap · $${valuation.netCashPerShare.toFixed(2)}/share`}
        />
        <Row
          term="enterpriseValue"
          label="Enterprise value"
          value={money(valuation.enterpriseValue)}
          note="Market cap less net cash — what the operating business alone is being priced at"
        />
        <Row
          term="ncav"
          label="Net current asset value"
          value={money(valuation.ncav)}
          note={
            valuation.ncav != null && valuation.ncav > 0
              ? `Current assets less all liabilities · $${valuation.ncavPerShare.toFixed(2)}/share`
              : 'Negative — liabilities exceed current assets, the normal case outside deep value'
          }
        />
        {range && (
          <Row
            term="pbPercentile"
            label="P/B vs its own history"
            value={`${range.percentile.toFixed(0)}th pct`}
            note={`Range ${range.min.toFixed(2)}×–${range.max.toFixed(2)}× across ${range.sampleSize} reported quarters`}
          />
        )}
      </div>

      <p className="muted small">
        Book value is an accounting figure, not an appraisal. It carries most assets at historical cost less
        depreciation and excludes internally-developed software, brands, patents and research — which is why
        asset-light businesses routinely trade at many times book without that being evidence of overpricing, and why
        the ratio is far more informative for banks, insurers and holding companies than for the rest of this list.
        Figures are as filed and can be up to a quarter stale; the price is current.
      </p>
    </div>
  )
}
