# Confluence

A live technical-analysis **screener** across a curated list of tickers — RSI, MACD, and moving-average trend, combined into a single "confluence" verdict per symbol.

This is deliberately **not** a signal service or a "time the market" tool. Indicators are lagging by construction and every other trader sees the same numbers — TA doesn't fail because people lack access to it. What it's good for is scanning many tickers at once to see where indicators currently agree or disagree, faster than checking each one by hand.

## Stack

- React + Vite (matches the setup, no extra tooling)
- [Twelve Data](https://twelvedata.com) for daily bars — fetched **once a day, server-side**, not from the browser (see "Data model" below)
- [Finnhub](https://finnhub.io) for an optional live price overlay (client-side, cosmetic only)
- No backend server: a scheduled GitHub Action does the daily fetch and commits the result as static JSON

## Data model

Every indicator here — RSI, MACD, backtests, everything — is computed from **daily** closes, so there's nothing to gain from polling continuously. `.github/workflows/sync-market-data.yml` runs `scripts/sync-market-data.mjs` once a day after market close: it fetches fresh bars for every ticker from Twelve Data and writes them as one file per symbol under `public/bars/`, plus a precomputed `public/screener.json`.

The split matters for growth. A combined file is ~92KB of raw bars per symbol, so it reaches GitHub's 100MB per-file limit at roughly a thousand tickers, and it forces a ticker page to download every symbol to show one. Per-symbol files stay a fixed size however many exist, and a page fetches only what it displays (`dataProvider.loadBars`).

`screener.json` is the dashboard, computed once by the job rather than in every visitor's browser: ~228 bytes per row against ~20KB gzipped of bars, so the dashboard paints from a few KB and never downloads bar history at all. No API key ever ships to the browser, and it costs the same ~22 API requests/day regardless of how many people have the site open, because everyone reads the same snapshot instead of each visitor's browser calling Twelve Data independently.

The same job also updates `public/track-record.json` (see below) from the same fetch, so there's no duplicate API usage between the two features.

Without a synced snapshot yet (fresh clone, or before the first workflow run), the app falls back to deterministic demo data (a seeded random walk per symbol) so it's fully explorable out of the box. The mechanics — divergence detection, base rates, volatility context — are real; the numbers they're computed from aren't, until real data is behind them. The app flags this per-ticker whenever that symbol is running on demo data.

## Running locally

```bash
npm install
npm run dev
npm test    # vitest — covers the leverage/liquidation math
```

To sync real data locally: `TWELVE_DATA_KEY=your_key node scripts/sync-market-data.mjs` (takes ~3 minutes, throttled to stay under Twelve Data's free-tier rate limit). Commit the resulting `public/bars/` and `public/screener.json`, or leave them uncommitted for local testing.

## Scope

~20 tickers (major indices, mega-cap tech, a couple of crypto pairs) rather than "every stock" — keeps the free data tier viable and the UI scannable. See `src/lib/tickers.js` to adjust the list.

## Indicators

- RSI(14), MACD(12,26,9), 50-day / 200-day SMA trend — the screener-level signals, shown as a "Confluence" badge on the dashboard.
- ATR-based volatility percentile, Bollinger Band squeeze detection, relative volume, RSI divergence, and swing-derived support/resistance — the ticker detail page's depth layer (`src/lib/indicators.js`).
- **Historical base rates** (`src/lib/backtest.js`): for each ticker, every past occurrence of a given event (e.g. "MACD crosses above signal") is found in its tracked history, and the forward return over the next N sessions is summarized — sample size, win rate, average/best/worst return. This is the answer to "does this indicator actually mean anything for this ticker," not just "what is the indicator's current value."

Detail pages lead with whichever event most recently triggered and surface its base rate first.

## The name

**Confluence** — the point where separate streams meet.

One indicator is mostly noise; agreement between *independent* kinds of evidence carries more weight. The trap the name invites, and which this app previously fell into, is that stacking several indicators reading the same price series is not confluence at all — trend, MACD and price-versus-average agree almost by construction, so combining them yields a bigger number rather than more evidence.

`src/lib/confluence.js` therefore scores three streams that can genuinely disagree:

- **Technical** — breakout (price clearing a defended level, with volume confirming), participation, position against structural support.
- **Fundamental** — is the business improving? Year-over-year revenue and net income from SEC filings, plus what the balance sheet supports.
- **Macro** — the price of money and the appetite for risk, read from TLT (long rates) and HYG (credit spreads), two instruments the app already syncs.

Each layer is scored separately and never blended into one number. **A layer with no data is reported as missing, never as neutral** — two layers agreeing while the third is absent is not a three-layer confluence, and the UI says so explicitly.

## Confidence, and its limits

There is no model here that knows where a price is going, and there could not be one. What the data supports is a description of what happened before under similar conditions, *with the uncertainty attached*:

- Every win rate carries a **95% Wilson confidence interval**, and the site says plainly when that interval spans 50% — a sample that cannot be distinguished from a coin flip is not presented as an edge, however far its headline percentage sits from 50. A "60% win rate" over 10 occurrences ranges roughly 31–83%; it means nothing on its own.
- **Overlapping forward windows** are counted: occurrences close together in time are not independent observations, and the independent count is usually far below the raw N.
- **Market impact** is estimated. Every backtest assumes you transact at the printed price, which fails as size grows — a large order moves the market against itself while it fills, so the entry, the exit and the equity marked against them are all worse than modelled. The leverage study flags the position sizes where that stops being a rounding error, using a square-root impact model against median daily dollar volume.

None of this makes the app a financial model, and nothing in it is advice. It is an educational simulator using fake money.

## Leverage study

`src/lib/leverageStudy.js` replays every past non-neutral confluence signal on a ticker as a hypothetical leveraged position, so the effect of position sizing on the same signals is visible rather than imagined. You set a stake and a leverage; it reports N, wipeout rate, win rate, average/median return, best/worst, and average dollar outcome — for both "setups like today" and every signal in the tracked history.

Design constraints, because this is the easiest part of the app to make dishonest:

- **Direction is never chosen with hindsight.** Each position's direction comes from what the confluence score said on that historical day — bullish score → long, bearish → short. This measures the app's own published stance.
- **Every occurrence is included.** No filtering to the ones that worked.
- **Liquidation is checked intraday**, against each session's low (long) or high (short), not its close. A leveraged position dies when price *touches* the level; scoring on closes alone would silently count wipeouts as flat survivors. This is the single detail that separates an honest study from a flattering one.
- **The model stays optimistic about the downside** and says so: real venues liquidate earlier (maintenance margin above zero equity) and charge funding and spread.
- **No compounded equity curve.** Chaining overlapping windows implies a mechanical strategy nobody ran and turns a modest edge into an exponential-looking chart.

The math is unit-tested (`src/lib/leverageStudy.test.js`) — liquidation thresholds, intraday-wick detection on both sides, leverage multiplication, the -100% floor, and exclusion of entries without a full forward window.

## Balance sheet vs market cap (mNAV)

`src/lib/mnav.js` compares what the market is paying for a company against what its balance sheet says the equity is worth: market cap, book equity, price/book and the dollar gap, net cash, enterprise value, and Graham's net current asset value — plus where the current P/B sits within its own reported history.

Data comes from **SEC EDGAR's XBRL `companyfacts` API** (`scripts/sync-fundamentals.mjs`), which is the primary source, free, and needs no API key — keeping the app on the same "no paid tier, no client-side secrets" footing as the price sync. CIKs are resolved from SEC's own ticker map rather than hardcoded, because a transposed digit would silently return a different company's balance sheet. Written to `public/fundamentals.json` and fetched at runtime, so it never enters the JS bundle.

What it will not do:

- **It never rates the security.** Every classification ships with the counter-argument attached: a low price-to-book is at least as often the market correctly marking down assets it expects to be impaired as it is a mispricing.
- **It states where the ratio is meaningless.** Book value omits internally-developed software, brands, patents and research, so asset-light businesses routinely trade at many times book without that being evidence of overpricing. The measure is far more informative for banks, insurers and holding companies.
- **It is gated by instrument type.** ETFs (NAV is definitionally the holdings) and spot crypto pairs (no issuer, no filings) show an explanation instead of a number. See `kind` in `src/lib/tickers.js`.
- **It shows nothing rather than an estimate** when a company has not been synced yet.
- **Negative book equity is reported as such**, not as a nonsense ratio — sustained buybacks push book equity below zero at plenty of profitable companies.

Historical P/B uses the book value actually reported for each quarter against the price on that date; using today's book value with past prices would just replot the price chart. Both modules are unit tested (`mnav.test.js`, `edgarFacts.test.js`), including XBRL restatement handling and the accounting-identity fallback when a filer does not tag `Liabilities`.

## Track record

`public/track-record.json` is a public, append-only log of every non-neutral verdict the app has ever shown, resolved 5 trading sessions later against the actual close — hits and misses both, nothing curated out. Written by the same daily sync job. See it at `/track-record`.

## Live price overlay (optional)

`VITE_FINNHUB_KEY` (browser-side, Vercel env var) enables a ~50s-refresh price overlay from Finnhub's free tier, shown as a pulsing "live" dot next to the price wherever it appears. Purely cosmetic — it never feeds the indicator or backtest engine, which stay on the daily-synced Twelve Data snapshot regardless. Stock/ETF symbols only; crypto pairs fall back to the snapshot price silently. Chosen over a WebSocket feed because Finnhub's free tier caps one API key at a single concurrent connection, which rules out every visitor's browser connecting directly — a shared relay would be real new infrastructure this app doesn't need yet for a value-add that's purely visual. The key is unavoidably shared client-side (unlike the Twelve Data key, which never leaves the sync job), so every open tab draws from the same 60 req/min account cap — the poll interval is tuned to leave headroom for a few concurrent visitors, not just one.

## Simulated trades (optional)

`/my-trades` and the "Simulate a trade" section on each ticker page (right under the price, not buried) let a user record a hypothetical position — their own choice of direction, capital, and leverage — and track its P&L against real synced prices over time. The app never picks a direction or leverage; it only does the bookkeeping. This is the load-bearing distinction versus investment advice: the recommendation always comes from the user, never from the app. A leveraged loss is clamped at -100% and flagged "liquidated" rather than shown going further negative, which is both accurate to how real leveraged positions work and the actual lesson a simulator should teach.

Backed by [Supabase](https://supabase.com) (free tier) — Postgres for storage, anonymous auth (a real account created silently, no email/password/click required — see `AuthContext.ensureSession`). No custom backend: the browser talks to Supabase directly, and row-level security (`supabase/schema.sql`) enforces that a user can only ever read or write their own trades — that's a database-level guarantee, not application code. The tradeoff of skipping email: an anonymous identity lives in the browser that created it, so trades don't follow you to a different device. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (browser-side, safe to expose — see `.env.example`) to enable; without them the simulator and the feedback form each show a "not set up yet" message instead of breaking. Requires **Authentication → Sign In / Providers → Anonymous Sign-Ins** enabled in the Supabase dashboard (off by default).

## Feedback (optional)

`/feedback`, linked from the header and from the footer of every page ("Spotted a number that looks wrong?"). The report it is built for is *this figure is wrong*: a site whose only real claim is that its numbers are measured rather than asserted is worth exactly what its willingness to be corrected is worth.

That report is also the one most likely to be unanswerable by the time it is read, because the snapshot rolls every weekday — "the price-to-book on this page looks off" cannot be checked a week later against data that has since changed. So a submission carries the route it was sent from and the snapshot timestamp that page was showing, captured automatically and displayed on the form before sending rather than attached invisibly. Client-side navigation never sets `document.referrer`, so in-app links pass the origin page through router state (`components/FeedbackLink.jsx`); the referrer is only a fallback for someone arriving from outside.

Same Supabase project and same anonymous identity as the simulator, its own table. Insert and select-own only — no update or delete policy, deliberately: a report is a record of what a page said at a moment, and one that can be rewritten afterwards is not one. Rate limited to 10 per hour per identity through a `security definer` function, because a policy that selects from the table it guards recurses through its own RLS. Validation bounds live in `lib/feedback.js` and are asserted against the SQL constraints in `feedback.test.js`, so the form and the database cannot drift into disagreeing about what is acceptable.

## Deploying

Configured for Vercel (`vercel.json` has the SPA rewrite). Push to a repo, import into Vercel. Set `VITE_FINNHUB_KEY` there if using the live price overlay — no Twelve Data key needed in Vercel at all, since the browser never calls Twelve Data.

For the daily sync to actually run, add `TWELVE_DATA_KEY` as a **GitHub Actions repository secret** (Settings > Secrets and variables > Actions) — separate from any Vercel env var, since Actions and Vercel don't share secrets.
