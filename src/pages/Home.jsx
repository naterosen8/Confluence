import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { screenerRows, screenerLeaderboardCheck, screenerDirectionCheck, DATA_GENERATED_AT } from '../lib/dataProvider'
import { selfCheck, CONCLUSION_HEADLINE, CONCLUSION_BLURB } from '../lib/verdict'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useTrackSummary } from '../lib/useTrackSummary'
import Explain from '../components/Explain'

// The front door.
//
// This used to be the screener: eighty-nine rows, each with a verdict badge
// reading "leaning up" or "aligned down". Which meant the first thing the site
// showed anybody was the one thing it had spent months proving does not work,
// while the proof sat two clicks away under "Track record".
//
// So the order is inverted. The finding comes first, with its evidence, and
// the screener becomes what it always was — a finding aid. The confluence
// score survives because deleting it would delete the exhibit; it is what a
// conventional screener says, and the argument needs it visible to be about
// anything.
//
// Every number here is read from the published files at render time. See
// lib/verdict.js for why that is load-bearing rather than tidy.

export default function Home() {
  useDocumentTitle('Confluence')
  const summary = useTrackSummary()
  const screener = useMemo(
    () => ({
      rows: screenerRows(),
      directionCheck: screenerDirectionCheck(),
      leaderboard: screenerLeaderboardCheck(),
    }),
    []
  )
  const verdict = useMemo(() => selfCheck({ summary, screener }), [summary, screener])

  return (
    <div className="home">
      <section className="home-lede">
        <p className="home-eyebrow">A technical-analysis screener that measured itself</p>
        <h1>{CONCLUSION_HEADLINE[verdict.conclusion]}</h1>
        <p className="home-blurb">{CONCLUSION_BLURB[verdict.conclusion]}</p>
        <p className="muted small">
          {summary
            ? 'Updated by a job that runs every weekday after the close. Nothing on this page is written down — every figure is read from files this site publishes, so it changes when the evidence does.'
            : 'Loading the published record…'}
        </p>
      </section>

      <section className="detail-section">
        <h2>The evidence</h2>
        <p className="muted small">
          {verdict.sourceCount} independent sources, {verdict.checks.length} measurements between them. They use
          different data and can fail separately, which is what makes agreement between them mean anything — and the
          published record contributes three, because an overall hit rate and a gap against drift are different
          claims.
        </p>
        <div className="evidence">
          {verdict.checks.map((c) => (
            <div key={c.key} className={`evidence-row evidence-${c.verdict}`}>
              <div className="evidence-head">
                <span className="evidence-label">{c.label}</span>
                <strong className="evidence-finding">{c.finding}</strong>
              </div>
              <p className="muted small">{c.detail}</p>
            </div>
          ))}
        </div>
        <p className="muted small">
          The full log is a committed file — <a href="/track-record.json">every call ever published</a>, hits and
          misses alike, nothing removed after the fact. The <Link to="/track-record">track record</Link> shows the
          working, and <Link to="/methodology/evidence">the methodology</Link> explains what each test is asking.
        </p>
      </section>

      <section className="detail-section">
        <h2>What to use instead</h2>
        <p>
          Direction is the question this site cannot answer. It is not the question that decides whether a position
          survives. How much size this instrument has already gone through, how far a stop has to sit before it stops
          firing on ordinary noise, how far under water a hold typically goes and for how long, whether you can get
          out at the price on the screen — all of that is measurable, and all of it is measured here.
        </p>
        <p>
          <Link to="/check" className="home-cta">
            Run a risk check →
          </Link>
        </p>
        <p className="muted small">
          It asks for a ticker, what you have, and what you are willing to lose on one idea. It will not tell you
          whether to take the position or which way to lean, for the reason set out above.
        </p>
      </section>

      <section className="detail-section">
        <h2>The rest of it</h2>
        <ul className="home-links">
          <li>
            <Link to="/screener">Screener</Link> — all {screener.rows.length} tracked instruments, sortable by what
            they will do to you rather than by where they are going. This is also where the{' '}
            <Explain term="confluenceScore">confluence score</Explain> still lives: kept because it is the exhibit,
            demoted because it is worth nothing.
          </li>
          <li>
            <Link to="/overlap">Overlap</Link> — how many separate positions a basket actually is, once the fact that
            its names move together is accounted for.
          </li>
          <li>
            <Link to="/track-record">Track record</Link> — every published call, resolved automatically five sessions
            later.
          </li>
          <li>
            <Link to="/methodology">How to read this</Link> — what each number means, what it is not, and the
            limits the site knows it has.
          </li>
        </ul>
      </section>
    </div>
  )
}
