export default function LivePrice({ basePrice, liveQuote }) {
  const price = liveQuote?.price ?? basePrice
  return (
    <span className="live-price">
      ${price.toFixed(2)}
      {liveQuote && <span className="live-dot" title="Live price (Finnhub)" />}
    </span>
  )
}
