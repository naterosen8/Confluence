import Explain from './Explain'

// Shared shell for the plain-language reads — chart, balance sheet, position.
// One component so the three cannot drift into looking like different kinds of
// claim when they are all the same kind: a description of now.
export default function PlainRead({ term, tone, headline, children, note, caveat }) {
  return (
    <div className={`plain-read${tone ? ` plain-read-${tone}` : ''}`}>
      <div className="plain-read-head">
        <Explain term={term}>
          <strong>{headline}</strong>
        </Explain>
      </div>
      <p className="plain-read-body">{children}</p>
      {note && <p className="plain-read-note">{note}</p>}
      {caveat && <p className="muted small">{caveat}</p>}
    </div>
  )
}
