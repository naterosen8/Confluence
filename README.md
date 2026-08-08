# Confluence

A live technical-analysis **screener** across a curated list of tickers — RSI, MACD, and moving-average trend, combined into a single "confluence" verdict per symbol.

This is deliberately **not** a signal service or a "time the market" tool. Indicators are lagging by construction and every other trader sees the same numbers — TA doesn't fail because people lack access to it. What it's good for is scanning many tickers at once to see where indicators currently agree or disagree, faster than checking each one by hand.

## Stack

- React + Vite (matches the setup, no extra tooling)
- [Twelve Data](https://twelvedata.com) for daily bars — fetched **once a day, server-side**, not from the browser (see "Data model" below)
- [Finnhub](https://finnhub.io) for an optional live price overlay (client-side, cosmetic only)
- No backend server: a scheduled GitHub Action does the daily fetch and commits the result as static JSON

## Data model

Every indicator here — RSI, MACD, backtests, everything — is computed from **daily** closes, so there's nothing to gain from polling continuously. `.github/workflows/sync-market-data.yml` runs `scripts/sync-market-data.mjs` once a day after market close: it fetches fresh bars for every ticker from Twelve Data and commits the result to `data/market-data.json`. The app just reads that committed file (a static import) — no API key ever ships to the browser, and it costs the same ~22 API requests/day regardless of how many people have the site open, because everyone reads the same snapshot instead of each visitor's browser calling Twelve Data independently.

The same job also updates `data/track-record.json` (see below) from the same fetch, so there's no duplicate API usage between the two features.

Without a synced snapshot yet (fresh clone, or before the first workflow run), the app falls back to deterministic demo data (a seeded random walk per symbol) so it's fully explorable out of the box. The mechanics — divergence detection, base rates, volatility context — are real; the numbers they're computed from aren't, until real data is behind them. The app flags this per-ticker whenever that symbol is running on demo data.

## Running locally

```bash
npm install
npm run dev
```

To sync real data locally: `TWELVE_DATA_KEY=your_key node scripts/sync-market-data.mjs` (takes ~3 minutes, throttled to stay under Twelve Data's free-tier rate limit). Commit the resulting `data/market-data.json` or just leave it uncommitted for local testing.

## Scope

~20 tickers (major indices, mega-cap tech, a couple of crypto pairs) rather than "every stock" — keeps the free data tier viable and the UI scannable. See `src/lib/tickers.js` to adjust the list.

## Indicators

- RSI(14), MACD(12,26,9), 50-day / 200-day SMA trend — the screener-level signals, shown as a "Confluence" badge on the dashboard.
- ATR-based volatility percentile, Bollinger Band squeeze detection, relative volume, RSI divergence, and swing-derived support/resistance — the ticker detail page's depth layer (`src/lib/indicators.js`).
- **Historical base rates** (`src/lib/backtest.js`): for each ticker, every past occurrence of a given event (e.g. "MACD crosses above signal") is found in its tracked history, and the forward return over the next N sessions is summarized — sample size, win rate, average/best/worst return. This is the answer to "does this indicator actually mean anything for this ticker," not just "what is the indicator's current value."

Detail pages lead with whichever event most recently triggered and surface its base rate first.

## Track record

`data/track-record.json` is a public, append-only log of every non-neutral verdict the app has ever shown, resolved 5 trading sessions later against the actual close — hits and misses both, nothing curated out. Written by the same daily sync job. See it at `/track-record`.

## Live price overlay (optional)

`VITE_FINNHUB_KEY` (browser-side, Vercel env var) enables a ~30s-refresh price overlay from Finnhub's free tier, shown as a pulsing "live" dot next to the price wherever it appears. Purely cosmetic — it never feeds the indicator or backtest engine, which stay on the daily-synced Twelve Data snapshot regardless. Stock/ETF symbols only; crypto pairs fall back to the snapshot price silently. Chosen over a WebSocket feed because Finnhub's free tier caps one API key at a single concurrent connection, which rules out every visitor's browser connecting directly — a shared relay would be real new infrastructure this app doesn't need yet for a value-add that's purely visual.

## Simulated trades (optional)

`/my-trades` and the "Simulate a trade" section on each ticker page (right under the price, not buried) let a user record a hypothetical position — their own choice of direction, capital, and leverage — and track its P&L against real synced prices over time. The app never picks a direction or leverage; it only does the bookkeeping. This is the load-bearing distinction versus investment advice: the recommendation always comes from the user, never from the app. A leveraged loss is clamped at -100% and flagged "liquidated" rather than shown going further negative, which is both accurate to how real leveraged positions work and the actual lesson a simulator should teach.

Backed by [Supabase](https://supabase.com) (free tier) — Postgres for storage, anonymous auth (a real account created silently, no email/password/click required — see `AuthContext.ensureSession`). No custom backend: the browser talks to Supabase directly, and row-level security (`supabase/schema.sql`) enforces that a user can only ever read or write their own trades — that's a database-level guarantee, not application code. The tradeoff of skipping email: an anonymous identity lives in the browser that created it, so trades don't follow you to a different device. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (browser-side, safe to expose — see `.env.example`) to enable; without them both features show a "not set up yet" message instead of breaking. Requires **Authentication → Sign In / Providers → Anonymous Sign-Ins** enabled in the Supabase dashboard (off by default).

## Deploying

Configured for Vercel (`vercel.json` has the SPA rewrite). Push to a repo, import into Vercel. Set `VITE_FINNHUB_KEY` there if using the live price overlay — no Twelve Data key needed in Vercel at all, since the browser never calls Twelve Data.

For the daily sync to actually run, add `TWELVE_DATA_KEY` as a **GitHub Actions repository secret** (Settings > Secrets and variables > Actions) — separate from any Vercel env var, since Actions and Vercel don't share secrets.
