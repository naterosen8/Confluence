import Explain from './Explain'

// The plain-language read, given top billing on the Signals chapter.
//
// It goes first because it is the only thing on the page that answers "what am
// I looking at" in one sentence. Everything below it is evidence; this is the
// description the evidence is about.
export default function SetupRead({ setup }) {
  if (!setup) return null
  return (
    <div className={`setup-read setup-read-${setup.key}`}>
      <div className="setup-read-head">
        <Explain term="setupRead">
          <strong>{setup.name}</strong>
        </Explain>
      </div>
      <p className="setup-read-body">{setup.read}</p>
      {setup.invalidation && (
        <p className="setup-read-invalidation">
          <span className="setup-read-label">Wrong if:</span> {setup.invalidation.text}
          {setup.invalidation.level != null && (
            <> — currently ${setup.invalidation.level.toFixed(2)}</>
          )}
        </p>
      )}
      <p className="muted small">{setup.caveat}</p>
    </div>
  )
}
