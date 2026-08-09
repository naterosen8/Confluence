import Explain from './Explain'

// Shows the score as the arithmetic it actually is. A bare "+4" gets read as
// a confidence level or a probability; the same number shown as a list of
// named votes that sum to it cannot be, and it also makes the overlap
// visible — a reader can see for themselves that "trend", "price vs 50-day"
// and "MACD" are three votes measuring closely related things, not three
// independent opinions.
export default function ScoreBreakdown({ signals }) {
  const { factors = [], bullishPoints = 0, bearishPoints = 0, score } = signals
  const counted = factors.filter((f) => f.weight > 0)
  const skipped = factors.filter((f) => f.weight === 0)

  return (
    <div className="score-breakdown">
      <div className="score-sum">
        <Explain term="confluenceScore">
          <span className="score-sum-value">
            {score > 0 ? '+' : ''}
            {score}
          </span>
        </Explain>
        <span className="muted small">
          = {bullishPoints} bullish {bullishPoints === 1 ? 'point' : 'points'} − {bearishPoints} bearish{' '}
          {bearishPoints === 1 ? 'point' : 'points'}
        </span>
      </div>

      <ul className="factor-list">
        {counted.map((f, i) => (
          <li key={`${f.term}-${i}`} className={`factor factor-${f.direction}`}>
            <span className="factor-sign">
              {f.direction === 'bullish' ? '+' : '−'}
              {f.weight}
            </span>
            <Explain term={f.term}>
              <span className="factor-label">{f.label}</span>
            </Explain>
          </li>
        ))}
        {skipped.map((f, i) => (
          <li key={`skip-${i}`} className="factor factor-neutral">
            <span className="factor-sign">0</span>
            <Explain term={f.term}>
              <span className="factor-label muted">{f.label}</span>
            </Explain>
          </li>
        ))}
      </ul>

      <p className="muted small">
        These checks are not independent of one another — trend, price-versus-average and MACD all read the same
        recent price action, so they tend to move together and push the total further than the number of distinct
        pieces of evidence would justify. A higher score means more agreement among overlapping measures, not more
        certainty.
      </p>
    </div>
  )
}
