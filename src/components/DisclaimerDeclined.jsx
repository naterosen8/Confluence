// Someone said no. The honest response is to stop, not to nag or to quietly
// let them in anyway — and to leave the door open, because "not right now" is
// a reasonable answer to a wall of caveats.
export default function DisclaimerDeclined({ onReconsider }) {
  return (
    <div className="gate-backdrop">
      <div className="gate" role="dialog" aria-modal="true" aria-labelledby="declined-title">
        <h1 id="declined-title">That is a reasonable call</h1>
        <p className="gate-intro">
          A screener whose own record shows no edge is genuinely not worth much to most people, and declining it is not
          the wrong answer. Nothing here is hidden behind the gate for any reason other than making sure the caveats are
          read first.
        </p>
        <div className="gate-actions">
          <button type="button" className="primary" onClick={onReconsider}>
            Go back to the terms
          </button>
        </div>
      </div>
    </div>
  )
}
