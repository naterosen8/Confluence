const COLORS = {
  'Strong Bullish': '#0f9d58',
  Bullish: '#4caf7d',
  Neutral: '#8b8f98',
  Bearish: '#e0715a',
  'Strong Bearish': '#d63b3b',
}

export default function VerdictBadge({ verdict }) {
  const color = COLORS[verdict] || COLORS.Neutral
  return (
    <span className="badge" style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}>
      {verdict}
    </span>
  )
}
