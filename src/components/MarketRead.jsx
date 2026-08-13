import Explain from './Explain'

// One read of the whole tape, above the rows it frames. It goes first because
// it changes how everything under it should be taken: in a narrow tape, most
// of those "trend intact" labels are the same trade wearing different tickers.
export default function MarketRead({ market }) {
  if (!market) return null
  return (
    <div className="market-read">
      <div className="market-read-head">
        <Explain term="marketRead">
          <strong>{market.headline}</strong>
        </Explain>
        {market.breadth && (
          <span className="market-read-breadth muted small">
            {market.breadth.above}/{market.breadth.counted} above their 50-day
          </span>
        )}
      </div>
      <p className="market-read-body">{market.read}</p>
      <p className="muted small">{market.caveat}</p>
    </div>
  )
}
