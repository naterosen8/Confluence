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

Without an API key, the dashboard runs on deterministic demo data (a seeded random walk per symbol) so it works out of the box.

To use real quotes, copy `.env.example` to `.env.local` and set `VITE_TWELVE_DATA_KEY` to a free Twelve Data API key. With a key set, tickers refresh on a ~3 minute cycle, throttled to stay under the free-tier rate limit.

## Scope

~20 tickers (major indices, mega-cap tech, a couple of crypto pairs) rather than "every stock" — keeps the free data tier viable and the UI scannable. See `src/lib/tickers.js` to adjust the list.

## Indicators (v1)

- RSI(14) — overbought/oversold
- MACD(12,26,9) — histogram sign
- 50-day / 200-day SMA — trend direction

Each contributes to a bullish/bearish tally per ticker (`src/lib/indicators.js`), shown as a "Confluence" badge: Strong Bullish → Strong Bearish.

## Deploying

Configured for Vercel (`vercel.json` has the SPA rewrite). Push to a repo, import into Vercel, set `VITE_TWELVE_DATA_KEY` as an env var if using live data.
