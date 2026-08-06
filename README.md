# Confluence

A live technical-analysis **screener** across a curated list of tickers — RSI, MACD, and moving-average trend, combined into a single "confluence" verdict per symbol.

This is deliberately **not** a signal service or a "time the market" tool. Indicators are lagging by construction and every other trader sees the same numbers — TA doesn't fail because people lack access to it. What it's good for is scanning many tickers at once to see where indicators currently agree or disagree, faster than checking each one by hand.

## Stack

- React + Vite (matches the setup, no extra tooling)
- [Twelve Data](https://twelvedata.com) for live quotes (optional — free tier: 8 requests/min, 800/day)
- No backend: data is fetched client-side and polled on an interval

## Running locally

```bash
npm install
npm run dev
```

Without an API key, the dashboard runs on deterministic demo data (a seeded random walk per symbol) so it works out of the box. The mechanics — divergence detection, base rates, volatility context — are real; the numbers they're computed from aren't, until real historical data is behind them. The app flags this on every ticker page when running in demo mode.

To use real quotes, copy `.env.example` to `.env.local` and set `VITE_TWELVE_DATA_KEY` to a free Twelve Data API key. With a key set, tickers refresh on a ~3 minute cycle, throttled to stay under the free-tier rate limit.

## Scope

~20 tickers (major indices, mega-cap tech, a couple of crypto pairs) rather than "every stock" — keeps the free data tier viable and the UI scannable. See `src/lib/tickers.js` to adjust the list.

## Indicators

- RSI(14), MACD(12,26,9), 50-day / 200-day SMA trend — the screener-level signals, shown as a "Confluence" badge on the dashboard.
- ATR-based volatility percentile, Bollinger Band squeeze detection, relative volume, RSI divergence, and swing-derived support/resistance — the ticker detail page's depth layer (`src/lib/indicators.js`).
- **Historical base rates** (`src/lib/backtest.js`): for each ticker, every past occurrence of a given event (e.g. "MACD crosses above signal") is found in its tracked history, and the forward return over the next N sessions is summarized — sample size, win rate, average/best/worst return. This is the answer to "does this indicator actually mean anything for this ticker," not just "what is the indicator's current value."

Detail pages lead with whichever event most recently triggered and surface its base rate first.

## Deploying

Configured for Vercel (`vercel.json` has the SPA rewrite). Push to a repo, import into Vercel, set `VITE_TWELVE_DATA_KEY` as an env var if using live data.
