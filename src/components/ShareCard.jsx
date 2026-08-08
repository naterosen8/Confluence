import { useEffect, useRef, useState } from 'react'
import { drawShareCard, buildCaption, SHARE_CARD_SIZE } from '../lib/shareCard'

export default function ShareCard({ symbol, name, price, verdict, closes, stat, statSource }) {
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)

  const hasStat = Boolean(stat)
  const statLabel = 'Historical base rate'
  const statLine = hasStat
    ? `${stat.winRate.toFixed(0)}% win rate over ${stat.sampleSize} similar setups (${
        statSource === 'regime-matched' ? 'this regime' : 'all history'
      })`
    : 'Not enough tracked history yet for this setup'

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawShareCard(ctx, {
      symbol,
      name,
      price,
      verdict,
      closes,
      statLabel,
      statLine,
      dateLabel: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    })
  }, [symbol, name, price, verdict, closes, statLabel, statLine])

  const caption = buildCaption({ symbol, verdict, statLine, hasStat })

  function download() {
    const canvas = canvasRef.current
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `confluence-${symbol.replace('/', '-')}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can be denied by the browser — the textarea below is the fallback.
    }
  }

  return (
    <div className="share-card">
      <canvas
        ref={canvasRef}
        width={SHARE_CARD_SIZE}
        height={SHARE_CARD_SIZE}
        className="share-card-canvas"
        aria-label={`Shareable card for ${symbol}`}
      />
      <div className="share-card-actions">
        <button className="button-primary" onClick={download}>
          Download PNG
        </button>
        <button className="button-secondary" onClick={copyCaption}>
          {copied ? 'Copied!' : 'Copy caption'}
        </button>
      </div>
      <textarea className="share-card-caption" readOnly value={caption} rows={7} />
    </div>
  )
}
