export default function Sparkline({ values, width = 120, height = 36, stroke = '#0d9488' }) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / range) * height).toFixed(2)}`)
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', maxWidth: width, height: 'auto', display: 'block' }}
      role="img"
      aria-label="price trend"
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  )
}
