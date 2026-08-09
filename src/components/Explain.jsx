import { useId, useState } from 'react'
import { GLOSSARY, BASIS } from '../lib/glossary'

// A small "?" next to a number that reveals what it measures, how it is
// computed, and — the part that actually matters — what it does not mean.
//
// Progressive disclosure rather than more inline prose: this page already
// carries a lot of caveat text, and past a certain density caveats become
// wallpaper that people scroll past. Collapsed by default keeps the page
// scannable while putting the explanation exactly where the confusion
// happens, instead of on a methodology page nobody opens.
export default function Explain({ term, children }) {
  const entry = GLOSSARY[term]
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!entry) return children ?? null

  const basis = BASIS[entry.basis]

  return (
    <span className="explain-wrap">
      {children}
      <button
        type="button"
        className={`explain-toggle${open ? ' explain-toggle-open' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What does ${entry.term} mean?`}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span className="explain-panel" id={id} role="note">
          <span className="explain-head">
            <strong>{entry.term}</strong>
            <span className={`explain-basis explain-basis-${entry.basis}`}>{basis.label}</span>
          </span>
          <span className="explain-row">{entry.what}</span>
          <span className="explain-row muted">
            <em>How:</em> {entry.how}
          </span>
          <span className="explain-row explain-isnot">
            <em>What it is not:</em> {entry.isNot}
          </span>
        </span>
      )}
    </span>
  )
}
