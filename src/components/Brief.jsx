import { Link } from 'react-router-dom'
import Explain from './Explain'

// The brief, rendered.
//
// Deliberately plain: a heading, a paragraph, four numbers, and links into the
// chapters each figure came from. No panels, no per-item caveats, no colour
// carrying meaning. The whole point of assembling this was that six separately
// hedged boxes read as evasion — putting the assembly back into six boxes
// would undo it.

export default function Brief({ brief, hrefFor }) {
  if (!brief) return null

  return (
    <div className="brief">
      {/* No badge here. The page header already carries one three inches
          above, and a second copy beside the headline made the lean the
          loudest thing on a page built specifically so the lean cannot be
          read without what it has been worth. */}
      <h2 className="brief-headline">{brief.headline}</h2>

      {brief.figures.length > 0 && (
        <div className="brief-figures">
          {brief.figures.map((f) => (
            <div key={f.key} className="brief-figure">
              <span className="muted small">
                <Explain term={f.term}>{f.label}</Explain>
              </span>
              <strong>{f.value}</strong>
              <span className="muted small">{f.note}</span>
            </div>
          ))}
        </div>
      )}

      {brief.sections.map((s) => (
        <section key={s.key} className="brief-section">
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </section>
      ))}

      <p className="muted small brief-caveat">{brief.caveat}</p>

      <p className="muted small">
        Every figure above is worked through on its own page:{' '}
        <Link to={hrefFor('signals')}>the readings</Link>,{' '}
        <Link to={hrefFor('record')}>what they have been worth</Link>,{' '}
        <Link to={hrefFor('risk')}>size, stops and what a session absorbs</Link>, and{' '}
        <Link to={hrefFor('layers')}>the three evidence streams read side by side</Link>.
      </p>
    </div>
  )
}
