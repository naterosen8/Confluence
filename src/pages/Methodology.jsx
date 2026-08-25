import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BASIS, glossaryByBasis } from '../lib/glossary'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { FORWARD_DAYS } from '../lib/backtest'
import { CONFLUENCE_NAME } from '../lib/confluence'
import SignalCheck from '../components/SignalCheck'
import { METHODOLOGY_CHAPTERS, chapterFor, chapterNeighbours } from '../lib/chapters'
import { ChapterNav, ChapterHead, ChapterPager, useChapterKeys } from '../components/ChapterNav'

const ORDER = ['current', 'measured', 'hypothetical', 'accounting']

export default function Methodology() {
  const { chapter: chapterKey } = useParams()
  const chapter = chapterFor(chapterKey, METHODOLOGY_CHAPTERS)
  const { index } = chapterNeighbours(chapter.key, METHODOLOGY_CHAPTERS)
  useDocumentTitle(`How to read this — ${chapter.label}`)
  const groups = glossaryByBasis()

  // Seventy definitions in a page twelve thousand pixels tall, with no way to
  // reach one. The glossary is a reference — the whole point is looking
  // something up — and until now that meant scrolling or using the browser's
  // own find. Searches the definition text too, not just the name, because
  // someone arrives wanting "the thing about stops" rather than a term.
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    const out = {}
    for (const [basisKey, entries] of Object.entries(groups)) {
      out[basisKey] = entries.filter((e) =>
        `${e.term} ${e.what} ${e.how} ${e.isNot}`.toLowerCase().includes(q)
      )
    }
    return out
  }, [query, groups])
  const shownCount = Object.values(matches).reduce((n, list) => n + list.length, 0)
  const totalCount = Object.values(groups).reduce((n, list) => n + list.length, 0)

  const hrefFor = useCallback(
    (key) => `/methodology${key === METHODOLOGY_CHAPTERS[0].key ? '' : `/${key}`}`,
    []
  )
  useChapterKeys({ chapters: METHODOLOGY_CHAPTERS, current: chapter.key, hrefFor })

  // Scroll position and focus are both handled by ChapterHead, which moves
  // focus to the new heading — the browser scrolls it into view as a result,
  // and doing it in one place keeps the two from fighting.

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

      <ChapterNav chapters={METHODOLOGY_CHAPTERS} current={chapter.key} hrefFor={hrefFor} />
      <ChapterHead chapter={chapter} index={index} total={METHODOLOGY_CHAPTERS.length} />

      {chapter.key === 'reading' && (<>
      <section className="detail-section">
        <h3>Why it is called Confluence</h3>
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
        <h3>Four different kinds of number</h3>
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
        <h3>What it will answer, and what it will not</h3>
        <p className="muted small">
          The site refuses one question and answers several others directly, and the line between them is not
          squeamishness — it is where the evidence runs out.
        </p>
        <p className="muted small">
          <strong>Direction: no.</strong> Four independent measurements are published on the next page, and none of
          them finds that the confluence score predicts which way price goes. A site whose own numbers say that and
          then tells you what to buy is not being helpful, it is contradicting itself. So nothing here says whether
          to take a position or which way to lean, and nothing ever will unless the measurement changes.
        </p>
        <p className="muted small">
          <strong>Size, stops, drawdown, recovery, liquidity and overlap: yes, plainly.</strong> These are facts about
          a distribution that has already happened rather than guesses about the next draw. What size this instrument
          has already liquidated, how far a stop has to sit before it stops firing on ordinary noise, how far under
          water a hold typically goes and how long it stays there, what a quiet session absorbs, and how much of a
          basket is really one position — all of it is measured from the same committed bars every other number here
          comes from, and none of it requires knowing what happens next.
        </p>
        <p className="muted small">
          The one calculation that turns those into a share count needs two numbers this site does not have and will
          not assume: how much money is at stake, and how much of it you are willing to lose being wrong once. Both
          are typed in, both stay in your browser, and neither field arrives with a suggestion in it.
        </p>
        <p className="small explain-isnot">
          <em>What it is not:</em> the risk figures are not safety limits. "Survived every entry at 5x" describes what
          has already happened to a position of that size over a particular stretch of history — not a level anyone
          has checked is safe, and not a bound on the next stretch.
        </p>
      </section>

      </>)}

      {chapter.key === 'evidence' && (<>
      <section className="detail-section">
        <h3>Why the sample is smaller than the count</h3>
        <p className="muted small">
          The track record says a few hundred resolved calls. That number is not the number of times this method has
          been tested, and the difference is large enough to change what the page is entitled to claim.
        </p>
        <p className="muted small">
          Calls are logged automatically on every ticker whose readings lean on a given session, so a single morning
          can produce seventy-odd of them. Every one is then scored over the same five sessions of the same market.
          They do not fail independently: if that week rose, the upward-leaning calls made that morning are right
          together, and how many there are says more about how many tickers the site tracks than about how often the
          method was right. The forward windows overlap on top of that — consecutive call dates held five sessions
          each share most of their outcome.
        </p>
        <p className="muted small">
          So the headline interval is computed across <em>call days</em> rather than across calls: each day scored
          once, and the range taken from how much the days disagree. It is roughly twice as wide as the per-call
          version, which is also shown, next to the reason it is wrong.
        </p>
        <p className="small explain-isnot">
          <em>What it is not:</em> a correction that recovers the lost evidence. It does not make a small sample
          bigger; it stops a small sample being reported as a large one.
        </p>
      </section>

      <section className="detail-section">
        <h3>Does the score actually work? (the app's own self-check)</h3>
        <p className="muted small">
          Computed live from the same snapshot the rest of the site uses, so it cannot drift out of date and will
          change on its own if the relationship changes. Published whatever it says.
        </p>
        <SignalCheck />
      </section>

      <section className="detail-section">
        <h3>How confident any of this is</h3>
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

      </>)}

      {chapter.key === 'limits' && (<>
      <section className="detail-section">
        <h3>The three things this site will never tell you</h3>
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
        <h3>The most common misreadings</h3>
        <ul className="plain-list">
          <li>
            <strong>The verdict badge and the historical record often disagree.</strong> The badge reads today's
            indicators. The base rate says what happened after similar setups before. An "Aligned ↑" badge sitting
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

      <section className="detail-section">
        <h3>Known limitations</h3>
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

      </>)}

      {chapter.key === 'glossary' && (<>
      <GlossaryFilter query={query} onQuery={setQuery} shown={shownCount} total={totalCount} />

      {ORDER.map((basisKey) => (
        (matches[basisKey] || []).length > 0 && (
        <section className="detail-section" key={basisKey}>
          <h3>
            <span className={`explain-basis explain-basis-${basisKey}`}>{BASIS[basisKey].label}</span>
          </h3>
          <p className="muted small">{BASIS[basisKey].blurb}</p>
          <div className="glossary-list">
            {(matches[basisKey] || []).map((entry) => (
              <div className="glossary-entry" key={entry.key} id={`term-${entry.key}`}>
                <h4>{entry.term}</h4>
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
        )
      ))}

      {shownCount === 0 && (
        <div className="callout">
          <strong>No term matches “{query}”.</strong> Definitions are searched by name and by what they mean, so a
          plain word like “drift” or “stop” usually finds the right one.
        </div>
      )}
      </>)}

      <ChapterPager chapters={METHODOLOGY_CHAPTERS} current={chapter.key} hrefFor={hrefFor} />

    </div>
  )
}

function GlossaryFilter({ query, onQuery, shown, total }) {
  return (
    <div className="glossary-filter">
      <label className="visually-hidden" htmlFor="glossary-q">
        Search definitions
      </label>
      <input
        id="glossary-q"
        type="search"
        className="filter-search"
        placeholder="Search definitions…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <span className="muted small" role="status">
        {shown === total ? `${total} terms` : `${shown} of ${total}`}
      </span>
    </div>
  )
}
