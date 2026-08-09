import { scalePoints } from './scalePoints'

const COLORS = {
  bg: '#0b0f14',
  panel: '#121821',
  border: '#232c38',
  text: '#e6e9ee',
  muted: '#8b95a5',
  accent: '#0d9488',
}

const VERDICT_COLORS = {
  'Strong Bullish': '#0f9d58',
  Bullish: '#4caf7d',
  Neutral: '#8b8f98',
  Bearish: '#e0715a',
  'Strong Bearish': '#e05252',
}

const SIZE = 1080

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

function truncateToWidth(ctx, str, maxWidth) {
  if (ctx.measureText(str).width <= maxWidth) return str
  let cut = str
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return cut + '…'
}

const FONT = (weight, size) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

// Sets the largest font size at or below `startSize` that keeps `str` inside
// `maxWidth`. Canvas text doesn't wrap or shrink on its own — it just runs
// off the edge — so a long symbol (crypto pairs like BTC/USD, or anything
// longer than a 4-letter ticker) was being drawn straight past the card
// border and out of the image.
function fitFont(ctx, str, maxWidth, weight, startSize, minSize) {
  let size = startSize
  ctx.font = FONT(weight, size)
  while (size > minSize && ctx.measureText(str).width > maxWidth) {
    size -= 2
    ctx.font = FONT(weight, size)
  }
  return size
}

// Draws the full card onto a 1080x1080 canvas 2D context. Pure function —
// no DOM/React dependency — so it's easy to reuse from a download button or
// (later) a preview canvas without duplicating layout logic.
export function drawShareCard(ctx, { symbol, name, price, verdict, closes, statLabel, statLine, dateLabel }) {
  ctx.clearRect(0, 0, SIZE, SIZE)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  const glow = ctx.createRadialGradient(880, 120, 0, 880, 120, 420)
  glow.addColorStop(0, 'rgba(13,148,136,0.16)')
  glow.addColorStop(1, 'rgba(13,148,136,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Header: icon mark + wordmark, date top-right
  roundRect(ctx, 70, 62, 56, 56, 14)
  ctx.fillStyle = COLORS.bg
  ctx.fill()
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 3.2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  const ix = 70,
    iy = 62
  ctx.moveTo(ix + 10, iy + 40)
  ctx.lineTo(ix + 20, iy + 25)
  ctx.lineTo(ix + 26, iy + 32)
  ctx.lineTo(ix + 36, iy + 16)
  ctx.lineTo(ix + 46, iy + 27)
  ctx.stroke()

  ctx.fillStyle = COLORS.accent
  ctx.font = FONT(800, 34)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('Confluence', 142, 90)

  if (dateLabel) {
    ctx.fillStyle = COLORS.muted
    ctx.font = FONT(500, 24)
    ctx.textAlign = 'right'
    ctx.fillText(dateLabel, SIZE - 70, 90)
  }

  // Symbol + name
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.text
  const symbolMaxWidth = SIZE - 68 - 70
  fitFont(ctx, symbol, symbolMaxWidth, 800, 128, 56)
  ctx.fillText(truncateToWidth(ctx, symbol, symbolMaxWidth), 68, 300)

  ctx.fillStyle = COLORS.muted
  ctx.font = FONT(500, 36)
  const maxNameWidth = SIZE - 140
  ctx.fillText(truncateToWidth(ctx, name || '', maxNameWidth), 70, 350)

  // Price
  ctx.fillStyle = COLORS.text
  ctx.font = FONT(800, 86)
  ctx.fillText(`$${price.toFixed(2)}`, 70, 460)

  // Verdict badge
  const verdictColor = VERDICT_COLORS[verdict] || VERDICT_COLORS.Neutral
  ctx.font = FONT(700, 32)
  const badgeText = verdict
  const badgePadX = 26
  const textWidth = ctx.measureText(badgeText).width
  const badgeW = textWidth + badgePadX * 2
  const badgeH = 62
  const badgeY = 490
  roundRect(ctx, 70, badgeY, badgeW, badgeH, badgeH / 2)
  ctx.fillStyle = `${verdictColor}26`
  ctx.fill()
  ctx.strokeStyle = `${verdictColor}88`
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = verdictColor
  ctx.textBaseline = 'middle'
  ctx.fillText(badgeText, 70 + badgePadX, badgeY + badgeH / 2 + 2)
  ctx.textBaseline = 'alphabetic'

  // Sparkline
  const chartX = 70
  const chartY = 610
  const chartW = SIZE - 140
  const chartH = 190
  if (closes && closes.length > 1) {
    const points = scalePoints(closes, chartW, chartH).map(([x, y]) => [chartX + x, chartY + y])

    ctx.beginPath()
    ctx.moveTo(points[0][0], chartY + chartH)
    for (const [x, y] of points) ctx.lineTo(x, y)
    ctx.lineTo(points[points.length - 1][0], chartY + chartH)
    ctx.closePath()
    const fade = ctx.createLinearGradient(0, chartY, 0, chartY + chartH)
    fade.addColorStop(0, 'rgba(13,148,136,0.25)')
    fade.addColorStop(1, 'rgba(13,148,136,0)')
    ctx.fillStyle = fade
    ctx.fill()

    ctx.beginPath()
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.strokeStyle = COLORS.accent
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // Stat highlight box
  const boxY = 860
  const boxH = 122
  roundRect(ctx, 70, boxY, SIZE - 140, boxH, 16)
  ctx.fillStyle = COLORS.panel
  ctx.fill()
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = COLORS.muted
  ctx.font = FONT(700, 22)
  ctx.fillText(statLabel.toUpperCase(), 100, boxY + 42)

  ctx.fillStyle = COLORS.text
  ctx.font = FONT(700, 34)
  ctx.fillText(truncateToWidth(ctx, statLine, SIZE - 200), 100, boxY + 90)

  // Footer
  ctx.fillStyle = COLORS.muted
  ctx.font = FONT(500, 24)
  ctx.fillText('Not financial advice — educational screening tool', 70, 1030)
  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.accent
  ctx.fillText('confluence-self.vercel.app', SIZE - 70, 1030)
}

export function buildCaption({ symbol, verdict, statLine, hasStat }) {
  const lede = hasStat
    ? statLine
    : "Not enough tracked history yet to back-test this exact setup — check back as more data accumulates."
  // The closing line used to claim "backtested against real history"
  // unconditionally, directly contradicting the line above it whenever this
  // setup had no usable sample — in a caption built for public posting.
  const closer = hasStat
    ? 'RSI, MACD, trend, and volatility — backtested against real history, not vibes. Link in bio.'
    : 'RSI, MACD, trend, and volatility, with the historical base rate shown whenever there is enough of one. Link in bio.'
  return [
    `$${symbol} is showing a ${verdict} confluence signal on Confluence right now.`,
    '',
    lede,
    '',
    closer,
    '',
    'Not financial advice — educational screening tool only.',
  ].join('\n')
}

export function createShareCardBlob(data) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  drawShareCard(ctx, data)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export { SIZE as SHARE_CARD_SIZE }
