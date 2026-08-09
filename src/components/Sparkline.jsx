import { scalePoints } from '../lib/scalePoints'

export default function Sparkline({ values, width = 120, height = 36, stroke = '#0d9488' }) {
  if (!values || values.length < 2) return null
  const points = scalePoints(values, width, height)
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
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
