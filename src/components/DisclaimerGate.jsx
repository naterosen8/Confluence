import { useEffect, useRef, useState } from 'react'
import { DISCLAIMER_POINTS, writeAcceptance } from '../lib/disclaimer'

// The gate in front of the site.
//
// A real gate, not a dismissible banner: the app does not render behind it,
// there is no close button, and Escape does nothing. Someone who has not read
// this has not seen a screener that says "aligned up" next to a control that
// goes to 50x, which is the whole reason it exists.
//
// The checkbox is not decoration either — the button stays disabled until it
// is ticked, so entering requires one deliberate act rather than a reflexive
// click on the only thing that looks pressable.
export default function DisclaimerGate({ onAccept, onDecline }) {
  const [agreed, setAgreed] = useState(false)
  const dialogRef = useRef(null)
  const headingRef = useRef(null)

  useEffect(() => {
    // Focus lands on the heading rather than the checkbox, so a screen reader
    // announces what this is before offering the way past it.
    headingRef.current?.focus()

    // The page behind must not scroll while a modal owns the screen.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Tab must not reach the page underneath — there is nothing there yet, but
    // a focus ring disappearing into a blank region is its own kind of broken.
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function accept() {
    if (!agreed) return
    writeAcceptance()
    onAccept()
  }

  return (
    <div className="gate-backdrop">
      <div
        className="gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-intro"
        ref={dialogRef}
      >
        <h1 id="gate-title" tabIndex={-1} ref={headingRef}>
          Before you go in
        </h1>
        <p id="gate-intro" className="gate-intro">
          Confluence is a technical-analysis screener that publishes how well its own readings have worked. The short
          version of that answer is: they have not. Read what that means before using it.
        </p>

        <ul className="gate-points">
          {DISCLAIMER_POINTS.map((p) => (
            <li key={p.key}>{p.text}</li>
          ))}
        </ul>

        <label className="gate-agree">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I have read the points above and understand this site gives no financial advice and shows no demonstrated
            edge.
          </span>
        </label>

        <div className="gate-actions">
          <button type="button" className="primary" onClick={accept} disabled={!agreed}>
            I understand — continue
          </button>
          <button type="button" className="link-button" onClick={onDecline}>
            No thanks
          </button>
        </div>

        <p className="muted small gate-foot">
          Kept in this browser so you are asked once, not on every visit. It is a preference, not an account — nothing
          is sent anywhere. You can read this again any time from the footer.
        </p>
      </div>
    </div>
  )
}
