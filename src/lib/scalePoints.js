// Shared point-scaling for anything that draws a min/max-normalized line
// from a series of values into a width x height box — used by both the
// in-app SVG sparkline and the downloadable share-card canvas so the two
// don't drift out of sync on the same math. Returns [x, y] pairs relative
// to the box's own origin; callers add their own offset if they're drawing
// into a larger surface.
export function scalePoints(values, width, height) {
  if (!values || values.length < 2) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  return values.map((v, i) => [i * step, height - ((v - min) / range) * height])
}
