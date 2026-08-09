import { Link } from 'react-router-dom'
import { BASIS, glossaryByBasis } from '../lib/glossary'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { FORWARD_DAYS } from '../lib/backtest'
import { CONFLUENCE_NAME } from '../lib/confluence'

const ORDER = ['current', 'measured', 'hypothetical', 'accounting']

export default function Methodology() {
  useDocumentTitle('Methodology')
  const groups = glossaryByBasis()

  return (
    <div className="methodology">
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <h1>How to read this site</h1>
      <p className="muted">
        Every number here is defined below, along with how it is computed and — the part that matters most — what it
        does not mean. The same definitions appear inline next to the numbers themselves, behind the{' '}
        <span className="explain-toggle explain-toggle-inline-demo">?</span> marks.
      </p>

      <section className="detail-section">
        <h2>Why it is called Confluence</h2>
        <p>
          <strong>Confluence</strong> — {CONFLUENCE_NAME.what}
        </p>
        <p className="muted small">{CONFLUENCE_NAME.why}</p>
        <p className="muted small">
          There is a trap in the name worth being explicit about. Stacking several indicators that all read the same
          price series is not confluence — trend, MACD and price-versus-average agree with each other almost by
          construction, so combining them produces a larger number rather than more evidence. That is why the site
          separates three streams that can genuinely disagree: <strong>technical</strong> (what price and volume are
          doing), <strong>fundamental</strong> (whether the business underneath is improving), and{' '}
          <strong>macro</strong> (the price of money and the appetite for risk). Each is scored on its own, and a
          layer with no data is reported as missing rather than counted as neutral.
        </p>
        <p className="small explain-isnot">
          <em>What it is not:</em> {CONFLUENCE_NAME.caveat}
        </p>
      </section>

      <section className="detail-section">
        <h2>How confident any of this is</h2>
        <p className="muted small">
          Every win rate on the site carries a 95% confidence interval, and the site says plainly when that interval
          spans 50% — because a sample that cannot be distinguished from a coin flip should not be presented as an
          edge, however far its headline percentage sits from 50. There is no model here, and could not be one, that
          knows where a price is going. What the numbers can support is a description of what has happened before
          under similar conditions, with the uncertainty attached.
        </p>
        <p className="muted small">
          Two further limits are structural rather than fixable. Occurrences close together in time share overlapping
          forward windows, so the evidence is always thinner than the raw count suggests. And every backtest assumes
          you transact at the printed price — an order large relative to what actually trades moves the market against
          itself while it fills, so both the entry and the equity marked against it are worse in reality than in any
          simulation. The leverage study flags position sizes where that stops being a rounding error.
        </p>
      </section>

      <section className="detail-section">
        <h2>Four different kinds of number</h2>
        <p className="muted small">
          This is the distinction worth internalising before anything else. The site shows four kinds of claim, and
          they look alike on the page while meaning very different things.
        </p>
        <div className="basis-grid">
          {ORDER.map((key) => (
            <div key={key} className={`basis-card basis-card-${key}`}>
              <span className={`explain-basis explain-basis-${key}`}>{BASIS[key].label}</span>
              <p className="muted small">{BASIS[key].blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <h2>The three things this site will never tell you</h2>
        <ul className="plain-list">
          <li>
            <strong>What to buy or sell.</strong> Nothing here is a recommendation, and no part of the app picks a
            direction for you. The simulator records positions you chose yourself; the leverage study replays
            verdicts the app already published.
          </li>
          <li>
            <strong>What is going to happen.</strong> Every indicator here is computed from past prices and turns
            after price does. Base rates describe what followed similar setups before, which is not a forecast.
          </li>
          <li>
            <strong>That a number is meaningful when it isn't.</strong> Where a sample is too thin or a ratio does
            not apply to a business of that kind, the app says so instead of showing a figure.
          </li>
        </ul>
      </section>

      <section className="detail-section">
        <h2>The most common misreadings</h2>
        <ul className="plain-list">
          <li>
            <strong>The verdict badge and the historical record often disagree.</strong> The badge reads today's
            indicators. The base rate says what happened after similar setups before. A "Strong Bullish" badge sitting
            above a 30% historical win rate is not a bug — it is the two measures telling you different things, which
            is why they are shown together.
          </li>
          <li>
            <strong>Win rate is not profitability.</strong> Price being higher {FORWARD_DAYS} sessions later, more
            often than not, is compatible with losing money overall. Read it beside the average return.
          </li>
          <li>
            <strong>N is not independent trials.</strong> Occurrences close together in time cover overlapping
            forward windows, so the real number of independent episodes is much smaller than the count.
          </li>
          <li>
            <strong>A high price-to-book is not evidence of overpricing.</strong> Book value leaves out software,
            brands and research, so asset-light businesses trade far above it as a matter of course.
          </li>
          <li>
            <strong>More leverage does not mean more expected return.</strong> It scales outcomes both ways and adds
            a floor at total loss, which lowers the average even when the direction is unchanged.
          </li>
        </ul>
      </section>

      {ORDER.map((basisKey) => (
        <section className="detail-section" key={basisKey}>
          <h2>
            <span className={`explain-basis explain-basis-${basisKey}`}>{BASIS[basisKey].label}</span>
          </h2>
          <p className="muted small">{BASIS[basisKey].blurb}</p>
          <div className="glossary-list">
            {(groups[basisKey] || []).map((entry) => (
              <div className="glossary-entry" key={entry.key} id={`term-${entry.key}`}>
                <h3>{entry.term}</h3>
                <p>{entry.what}</p>
                <p className="muted small">
                  <em>How:</em> {entry.how}
                </p>
                <p className="small explain-isnot">
                  <em>What it is not:</em> {entry.isNot}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="detail-section">
        <h2>Known limitations</h2>
        <ul className="plain-list">
          <li>
            Roughly one year of daily price history per ticker, so every base rate is computed over a short window
            that contains only a few market regimes.
          </li>
          <li>
            Prices update once daily after the close. The optional live overlay is cosmetic and never feeds any
            calculation.
          </li>
          <li>
            Balance sheet figures are as filed and can be up to a quarter stale, while the price is current — the two
            sides of every valuation ratio are measured at different moments.
          </li>
          <li>
            The ticker list is a fixed, curated set. That avoids survivorship bias in the sense that nothing is
            removed for performing badly, but it is not a random or representative sample of the market.
          </li>
          <li>
            Backtests ignore fees, spread, slippage and taxes, and assume every signal is acted on mechanically.
          </li>
        </ul>
      </section>
    </div>
  )
}
