const COLORS = {
  'Strong Bullish': '#0f9d58',
  Bullish: '#4caf7d',
  Neutral: '#8b8f98',
  Bearish: '#e0715a',
  // Lightened from #d63b3b, which fell below the WCAG AA 4.5:1 body-text
  // threshold against the panel background at this badge's small size.
  'Strong Bearish': '#e05252',
}

export default function VerdictBadge({ verdict }) {
  const color = COLORS[verdict] || COLORS.Neutral
  return (
    <span className="badge" style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}>
      {verdict}
    </span>
  )
}
