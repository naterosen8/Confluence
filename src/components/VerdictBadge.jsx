import { leanByKey, LEAN_COLORS } from '../lib/lean'

// Shows what the indicators are doing, not what price is expected to do, and
// carries the raw tally so the label is never the only thing on offer — the
// difference between 5-0 and 4-1 is real information that a single word hides.
export default function VerdictBadge({ verdict, bullishPoints, bearishPoints }) {
  const lean = leanByKey(verdict)
  if (!lean) return null
  const color = LEAN_COLORS[lean.key]
  const hasTally = Number.isFinite(bullishPoints) && Number.isFinite(bearishPoints)

  return (
    <span
      className="badge badge-lean"
      style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}55` }}
      title={lean.blurb}
    >
      {lean.short}
      {hasTally && <span className="badge-tally">{bullishPoints}–{bearishPoints}</span>}
    </span>
  )
}
