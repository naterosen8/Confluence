import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY, BASIS } from '../lib/glossary'

// A small "?" next to a number that reveals what it measures, how it is
// computed, and — the part that actually matters — what it does not mean.
//
// Progressive disclosure rather than more inline prose: these pages already
// carry a lot of caveat text, and past a certain density caveats become
// wallpaper that people scroll past. Collapsed by default keeps the page
// scannable while putting the explanation exactly where the confusion
// happens, instead of on a methodology page nobody opens.
//
// The panel is portalled to <body> and positioned as a fixed overlay rather
// than opened in normal flow. In flow it was unusable in the two places it
// matters most: a table header would blow its column out to the panel's width
// and shove every other column sideways, and the scroll wrappers around those
// tables (overflow-x: auto, which makes overflow-y auto too) clipped anything
// positioned out of flow inside them. An overlay anchored to the button
// escapes both problems and shifts no surrounding layout at all.

const PANEL_WIDTH = 460
const GAP = 6
const EDGE = 8

export default function Explain({ term, children }) {
  const entry = GLOSSARY[term]
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const id = useId()

  const place = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE * 2)
    const left = Math.min(Math.max(EDGE, r.left), Math.max(EDGE, window.innerWidth - width - EDGE))
    const height = panelRef.current?.offsetHeight ?? 0
    const below = r.bottom + GAP
    // Flip above only when there is genuinely room there — otherwise a panel
    // opened near the bottom of a long page would land off-screen upward,
    // which is worse than one that runs a little past the fold.
    const flip = height > 0 && below + height > window.innerHeight - EDGE && r.top - GAP - height > EDGE
    setPos({ top: flip ? r.top - GAP - height : below, left, width })
  }, [])

  // Measured after the panel exists so its real height drives the flip test.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    // Fixed to the viewport, so any scroll or resize would otherwise leave the
    // panel floating away from the "?" it belongs to. Capture phase catches
    // scrolling inside the table wrappers, not just the window.
    const reposition = () => place()
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, place])

  // An unknown term renders its children untouched rather than throwing. The
  // glossary test is what makes that silence safe: it fails the build if any
  // term referenced in the UI is missing from the glossary.
  if (!entry) return children ?? null

  const basis = BASIS[entry.basis]

  return (
    <span className="explain-wrap">
      {children}
      <button
        ref={btnRef}
        type="button"
        className={`explain-toggle${open ? ' explain-toggle-open' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What does ${entry.term} mean?`}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open &&
        createPortal(
          <span
            className="explain-panel"
            id={id}
            role="note"
            ref={panelRef}
            style={
              pos
                ? { top: pos.top, left: pos.left, width: pos.width }
                : // First paint before measurement: kept out of sight rather
                  // than flashed at the top-left corner.
                  { top: 0, left: 0, width: PANEL_WIDTH, visibility: 'hidden' }
            }
          >
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
          </span>,
          document.body
        )}
    </span>
  )
}
