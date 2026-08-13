import { useEffect, useRef } from 'react'
import { Link, useNavigate, useNavigationType } from 'react-router-dom'
import { BASIS } from '../lib/glossary'
import { chapterNeighbours } from '../lib/chapters'

// The spine of the book: a numbered strip of chapters, a header saying what
// kind of claim the open page makes, and prev/next at the foot.
//
// Chapters are real URLs rather than local state, so a page can be linked to,
// opened in a new tab, and walked with the browser's own back button. That
// also keeps the existing per-route ErrorBoundary meaningful — a chapter that
// throws no longer takes the whole ticker page with it.

export function ChapterNav({ chapters, current, hrefFor }) {
  const activeRef = useRef(null)

  // The strip scrolls horizontally on a phone, where it only fits about four
  // chapters. Landing on chapter five left the active tab off-screen to the
  // right, so the one thing the spine exists to tell you — where you are —
  // was the one thing it did not show.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [current])

  return (
    <nav className="chapter-nav" aria-label="Sections of this page">
      {chapters.map((c, i) => {
        const active = c.key === current
        return (
          <Link
            key={c.key}
            ref={active ? activeRef : undefined}
            to={hrefFor(c.key)}
            className={`chapter-tab${active ? ' chapter-tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="chapter-num" aria-hidden="true">
              {i + 1}
            </span>
            {c.label}
          </Link>
        )
      })}
    </nav>
  )
}

// Names the kind of claim before the reader meets the numbers. The basis chip
// is the same one the "?" panels use, so the colour already means something by
// the time it appears here.
export function ChapterHead({ chapter, index, total }) {
  const basis = chapter.basis ? BASIS[chapter.basis] : null
  const headingRef = useRef(null)
  const navigationType = useNavigationType()

  // Turning a page in a single-page app is silent and invisible to anyone not
  // watching pixels: the URL changes, the DOM swaps, and focus stays wherever
  // it was — which after clicking a tab means it is dropped on <body>. A
  // keyboard user then has to tab from the top of the document again, and a
  // screen reader announces nothing at all.
  //
  // Moving focus to the new chapter's heading fixes both at once: it puts the
  // keyboard caret at the start of the content that just appeared, and the
  // heading gets read out, which is the announcement.
  //
  // Gated on PUSH rather than on a "have I rendered before" ref, because a ref
  // cannot survive this: App keys the ErrorBoundary on location.pathname, so
  // every chapter turn remounts the whole subtree and any such ref is born
  // fresh each time. Navigation type is the router's own answer and is
  // remount-proof — PUSH means a link was followed, while the initial load and
  // the back button both report POP and are left alone.
  useEffect(() => {
    if (navigationType !== 'PUSH') return
    headingRef.current?.focus()
  }, [chapter.key, navigationType])

  return (
    <div className="chapter-head">
      <div className="chapter-head-line">
        {/* tabIndex -1 makes it programmatically focusable without adding a
            tab stop of its own. */}
        <h2 ref={headingRef} tabIndex={-1}>
          {chapter.label}
        </h2>
        {basis && <span className={`explain-basis explain-basis-${chapter.basis}`}>{basis.label}</span>}
        <span className="chapter-pos muted small">
          {index + 1} of {total}
        </span>
      </div>
      <p className="muted small">{chapter.blurb}</p>
    </div>
  )
}

export function ChapterPager({ chapters, current, hrefFor }) {
  const { prev, next } = chapterNeighbours(current, chapters)
  return (
    <div className="chapter-pager">
      {prev ? (
        <Link to={hrefFor(prev.key)} className="chapter-page-link">
          ← {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={hrefFor(next.key)} className="chapter-page-link chapter-page-next">
          {next.label} →
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}

// Left/right arrows turn the page, which is the whole point of calling it a
// book. Ignored while typing in the simulator's inputs, and while a modifier
// is held so browser shortcuts still work.
export function useChapterKeys({ chapters, current, hrefFor }) {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const { prev, next } = chapterNeighbours(current, chapters)
      const target = e.key === 'ArrowLeft' ? prev : next
      if (target) navigate(hrefFor(target.key))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [chapters, current, hrefFor, navigate])
}
