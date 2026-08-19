import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useEnsureSession } from '../context/AuthContext'
import { HAS_SUPABASE } from '../lib/supabaseClient'
import { probeTable, describeSupabaseError, SETUP_NEEDED } from '../lib/supabaseHealth'
import { FEEDBACK_KINDS, MESSAGE_MAX, submitFeedback, listMyFeedback, validateFeedback, resolveKind } from '../lib/feedback'
import { DATA_GENERATED_AT } from '../lib/dataProvider'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import Explain from '../components/Explain'

function formatWhen(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Feedback() {
  useDocumentTitle('Feedback')
  const location = useLocation()
  const { user, loading, error: sessionError } = useEnsureSession()

  // A contextual link ("this number looks wrong") arrives with its category
  // already decided. Validated against the offered list rather than trusted:
  // router state is just history state, and a stale or hand-edited entry
  // should not be able to put the form into a category the database will
  // reject on submit.
  const [kind, setKind] = useState(() => resolveKind(location.state?.kind))
  const [message, setMessage] = useState(() => location.state?.note ?? '')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState(null)
  const [errors, setErrors] = useState({})
  const [mine, setMine] = useState(null)
  // Asked before the form is offered, not after someone has written a
  // paragraph. A deployment whose schema has never been run is a real state
  // this app can be in, and discovering it on submit means losing the message.
  const [table, setTable] = useState(HAS_SUPABASE ? 'checking' : 'unconfigured')
  useEffect(() => {
    if (!HAS_SUPABASE) return
    let live = true
    probeTable('feedback').then((r) => live && setTable(r))
    return () => {
      live = false
    }
  }, [])

  // The page someone was looking at when they decided to complain is the
  // single most useful field on the form, and the one least likely to be
  // filled in by hand. It is prefilled from wherever they came from and shown
  // rather than hidden, because a form that quietly attaches things you
  // cannot see is not the kind of form this site should have.
  const [fromPage, setFromPage] = useState(() => location.state?.from ?? null)
  useEffect(() => {
    if (!fromPage && typeof document !== 'undefined' && document.referrer) {
      try {
        const url = new URL(document.referrer)
        if (url.origin === window.location.origin && url.pathname !== '/feedback') setFromPage(url.pathname)
      } catch {
        /* a referrer we cannot parse is not worth failing the page over */
      }
    }
  }, [fromPage])

  useEffect(() => {
    if (!user) return
    listMyFeedback(user.id)
      .then(setMine)
      .catch(() => setMine([]))
  }, [user, status])

  const activeKind = useMemo(() => FEEDBACK_KINDS.find((k) => k.key === kind), [kind])
  const remaining = MESSAGE_MAX - message.trim().length

  if (!HAS_SUPABASE || table === 'missing') {
    return (
      <div className="page-narrow">
        <h1>Feedback</h1>
        <p className="muted">
          {HAS_SUPABASE
            ? SETUP_NEEDED
            : 'The feedback form stores submissions in the same database as the trade simulator, and that is not configured on this deployment yet — so there is nowhere to put what you write. Rather than take a message and drop it, this says so.'}
        </p>
        <p className="muted small">
          If you have found a number here that looks wrong, it is still worth reporting — the repository’s issues are
          open, and the raw data behind every figure is committed as{' '}
          <a href="/screener.json">screener.json</a> and <a href="/track-record.json">track-record.json</a>.
        </p>
        <Link to="/" className="back-link">
          ← Back to the screener
        </Link>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const check = validateFeedback({ kind, message, contact })
    setErrors(check.errors)
    if (!check.ok) return

    setStatus('sending')
    try {
      await submitFeedback({
        userId: user.id,
        kind,
        message,
        contact,
        page: fromPage,
        snapshotAt: DATA_GENERATED_AT,
      })
      setStatus('sent')
      setMessage('')
      setContact('')
    } catch (err) {
      setStatus(null)
      setErrors({ form: describeSupabaseError(err, { action: 'send that' }) })
      // A table that vanished between the probe and the submit switches the
      // page into the same honest state, rather than leaving a form up that
      // cannot work.
      if (describeSupabaseError(err) === SETUP_NEEDED) setTable('missing')
    }
  }

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>Feedback</h1>
        <p className="muted small">
          Most useful of all: telling me a number here is wrong. This site's only real claim is that its figures are
          measured rather than asserted, and that claim is worth exactly as much as its willingness to be corrected.
        </p>
      </div>

      {sessionError && <p className="muted small">Error: {sessionError}</p>}

      {status === 'sent' && (
        <div className="callout callout-highlight" role="status">
          <strong>Sent — thank you.</strong> It is stored with the page and data date attached, so it can actually be
          chased down. If you left a contact you may hear back; if not, it still gets read.
        </div>
      )}

      <form className="feedback-form" onSubmit={handleSubmit}>
        <fieldset className="feedback-kinds">
          <legend className="muted small">What kind of feedback is this?</legend>
          {FEEDBACK_KINDS.map((k) => (
            <label key={k.key} className={`feedback-kind${kind === k.key ? ' feedback-kind-active' : ''}`}>
              <input
                type="radio"
                name="feedback-kind"
                value={k.key}
                checked={kind === k.key}
                onChange={() => setKind(k.key)}
              />
              <span>{k.label}</span>
            </label>
          ))}
        </fieldset>
        {activeKind?.hint && <p className="muted small">{activeKind.hint}</p>}

        <div className="simulate-field">
          <label className="muted small" htmlFor="feedback-message">
            What did you notice?
          </label>
          <textarea
            id="feedback-message"
            rows={7}
            value={message}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby="feedback-message-help"
            aria-invalid={errors.message ? 'true' : undefined}
            placeholder={
              kind === 'wrong-number'
                ? 'e.g. UNH price-to-book reads 3.1x but book equity looks like ~$106B, which would put it nearer 1x.'
                : 'As much or as little as you like.'
            }
          />
          <span id="feedback-message-help" className="muted small">
            {errors.message ? (
              <span className="field-error">{errors.message}</span>
            ) : remaining < 200 ? (
              `${remaining} characters left.`
            ) : (
              'Specific beats polite — the figure you were looking at and what you expected instead.'
            )}
          </span>
        </div>

        <div className="simulate-field">
          <label className="muted small" htmlFor="feedback-contact">
            Contact, only if you want a reply <span className="muted">(optional)</span>
          </label>
          <input
            id="feedback-contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            aria-invalid={errors.contact ? 'true' : undefined}
            placeholder="email, handle, or leave blank"
          />
          {errors.contact && <span className="field-error small">{errors.contact}</span>}
        </div>

        {/* Shown, not hidden. These two fields are what make a report about a
            number reproducible after the snapshot has rolled, and someone
            sending one deserves to see exactly what is being attached. */}
        <div className="feedback-context muted small">
          <Explain term="feedbackContext">
            <strong>Sent with this</strong>
          </Explain>
          <ul>
            <li>Page: {fromPage ? <code>{fromPage}</code> : <em>not detected — mention it above if it matters</em>}</li>
            <li>Data snapshot: {formatWhen(DATA_GENERATED_AT) ?? 'no snapshot loaded'}</li>
          </ul>
          <p>No email, no name, no tracking beyond this. The account behind it is the anonymous one this browser
          already uses for the trade simulator.</p>
        </div>

        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}

        <button type="submit" className="primary" disabled={status === 'sending' || loading || !user}>
          {status === 'sending' ? 'Sending…' : loading || !user ? 'Setting up…' : 'Send feedback'}
        </button>
      </form>

      {mine?.length > 0 && (
        <section className="feedback-mine">
          <h2>What you have sent</h2>
          <p className="muted small">
            Visible to you only, from this browser. There is no edit or delete — a report is a record of what a page
            said at a moment, and one that can be rewritten afterwards is not much of a record.
          </p>
          <ul className="feedback-list">
            {mine.map((f) => (
              <li key={f.id}>
                <div className="feedback-list-head">
                  <strong>{FEEDBACK_KINDS.find((k) => k.key === f.kind)?.label ?? f.kind}</strong>
                  <span className="muted small">{formatWhen(f.created_at)}</span>
                </div>
                <p>{f.message}</p>
                {f.page && <p className="muted small">on {f.page}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
