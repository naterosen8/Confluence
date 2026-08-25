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

The same job also updates `public/track-record.json` (see below) and `public/correlations.json` from the same fetch, so there's no duplicate API usage between the features.

Everything except the bars is *derived*, which means a change to how a number is computed does not reach the site until the next scheduled run — a commit that adds a column would ship a site whose rows do not have it. `npm run rebuild` recomputes `screener.json` and `correlations.json` from the committed bars with no network access, no API key and no rate limit, and never writes a bar file, so it cannot invent or alter a single price. It carries the existing `generatedAt` forward rather than restamping, so the staleness check keeps telling the truth.

Without a synced snapshot yet (fresh clone, or before the first workflow run), the app falls back to deterministic demo data (a seeded random walk per symbol) so it's fully explorable out of the box. The mechanics — divergence detection, base rates, volatility context — are real; the numbers they're computed from aren't, until real data is behind them. The app flags this per-ticker whenever that symbol is running on demo data.

## Running locally

```bash
npm install
npm run dev
npm test    # vitest — covers the leverage/liquidation math
```

To sync real data locally: `TWELVE_DATA_KEY=your_key node scripts/sync-market-data.mjs` (takes ~3 minutes, throttled to stay under Twelve Data's free-tier rate limit). Commit the resulting `public/bars/`, `public/screener.json` and `public/correlations.json`, or leave them uncommitted for local testing.

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

## The record, per ticker

The aggregate track record answers whether the site is worth anything. It is the wrong question for the person in front of one instrument, who is being shown a verdict badge on NVDA with no way to ask the obvious follow-up: what did this thing say about NVDA before, and was it right?

The Record chapter on every ticker page now answers that. Every call this site published on that symbol, dated, with entry and exit prices and how each resolved — and, beside it, how often price rose in those same windows regardless of what the call said. Everything else in that chapter is a reconstruction of what the score would have done; this is the only part that was written down before the outcome was known.

There will usually be about three of them, and the module refuses to turn three into a percentage. Below ten resolved calls no rate is quoted at all — not "quoted with a caveat", not quoted, because a percentage printed beside a sample of three is read as a percentage and the explanation underneath in smaller type is not a fair fight. The read says so plainly instead: *"100% of 3 and 0% of 3 are the same evidence about this ticker, which is none"*, with a figure for how many calls it would actually take. Above ten, the rate is always shown against that ticker's own drift with the interval on the difference, the same null everything else here tests against.

The published index (`public/ticker-record.json`, ~1.8 KB gzipped) keeps the most recent twelve calls per symbol so the file cannot grow with a log that gains twenty rows a session forever; the complete log stays committed at `track-record.json`, and the counts on the page describe everything including what it is not listing. Validation tests assert the index reproduces from the log, invents no call, leaks no retracted one, and counts every resolved call including the trimmed ones.

Fixing this surfaced a sharp edge in `sampleSizeToDistinguish`: at a rate of exactly 0 or 1 the formula's p(1−p) term vanishes and it returned **0**, which reads as "no more data needed" for the one case that needs the most. It returns null now.

## Live price overlay (optional)

`VITE_FINNHUB_KEY` (browser-side, Vercel env var) enables a ~50s-refresh price overlay from Finnhub's free tier, shown as a pulsing "live" dot next to the price wherever it appears. Purely cosmetic — it never feeds the indicator or backtest engine, which stay on the daily-synced Twelve Data snapshot regardless. Stock/ETF symbols only; crypto pairs fall back to the snapshot price silently. Chosen over a WebSocket feed because Finnhub's free tier caps one API key at a single concurrent connection, which rules out every visitor's browser connecting directly — a shared relay would be real new infrastructure this app doesn't need yet for a value-add that's purely visual. The key is unavoidably shared client-side (unlike the Twelve Data key, which never leaves the sync job), so every open tab draws from the same 60 req/min account cap — the poll interval is tuned to leave headroom for a few concurrent visitors, not just one.

## Simulated trades (optional)

`/my-trades` and the "Simulate a trade" section on each ticker page (right under the price, not buried) let a user record a hypothetical position — their own choice of direction, capital, and leverage — and track its P&L against real synced prices over time. The app never picks a direction or leverage; it only does the bookkeeping. This is the load-bearing distinction versus investment advice: the recommendation always comes from the user, never from the app. A leveraged loss is clamped at -100% and flagged "liquidated" rather than shown going further negative, which is both accurate to how real leveraged positions work and the actual lesson a simulator should teach.

Backed by [Supabase](https://supabase.com) (free tier) — Postgres for storage, anonymous auth (a real account created silently, no email/password/click required — see `AuthContext.ensureSession`). No custom backend: the browser talks to Supabase directly, and row-level security (`supabase/schema.sql`) enforces that a user can only ever read or write their own trades — that's a database-level guarantee, not application code. The tradeoff of skipping email: an anonymous identity lives in the browser that created it, so trades don't follow you to a different device. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (browser-side, safe to expose — see `.env.example`) to enable; without them the simulator and the feedback form each show a "not set up yet" message instead of breaking. Requires **Authentication → Sign In / Providers → Anonymous Sign-Ins** enabled in the Supabase dashboard (off by default).

## What every base rate tests against

Win rates on ticker pages are compared to **that instrument's own drift** over the same forward window, not to 50%. A coin flip is the wrong alternative to a signal: a stock that rose in 61% of all five-session windows makes a signal "winning" 65% of the time look like an edge when it is carrying no information about that stock at all.

The measurement when this replaced the coin-flip test: **8 of 96 published base rates claimed to be distinguishable from chance, and 1 of those 8 survived being compared to its own drift.** Seven published claims were artifacts of the null, not findings.

`distinguishable` now means distinguishable from drift, and the coin-flip verdict is kept under `distinguishableFromCoinFlip` so nothing can read one believing it is the other. Deviation counts in both directions — a setup that reliably lands *below* its drift is as much a measurement as one above it, and calling only the upside an edge would put a thumb on the scale.

## What the track record tests against

The hit rate is compared to the **drift over the same windows**, not to 50%. A coin flip is the wrong alternative to skill: over a period when prices rose in most five-session windows, an upward-leaning call is right most of the time with no skill involved, so a 54% hit rate against 54% drift is exactly zero edge while clearing a coin-flip test looks like a pass.

The figure that carries the information is therefore the **gap**, and the gap gets its own interval (Newcombe's hybrid-score method, `differenceInterval` in `lib/stats.js`). The interval on a difference is wider than the interval on either rate behind it, which is why two rates that look far apart routinely are not distinguishable — eyeballing whether two overlapping intervals "look different" gets this wrong in both directions. If the range spans zero, the page says no edge has been demonstrated, whatever the point estimates are.

The samples are not fully independent — the drift windows include the called ones, and overlapping forward windows are correlated. Both make the true interval wider than the one shown, so a gap that fails to clear this test would fail a stricter one too. Stated rather than corrected for, because the correction needs an assumption less defensible than the caveat.

**Calls are retracted, never deleted.** When a settled bar turns an entry's verdict into a split, it would never have been logged, so it is marked `voided` in place with the reason and date and excluded from every statistic. The earlier behaviour removed the row outright, and two published crypto calls dated 2026-08-09 were lost that way — discoverable only by diffing the file against its own git history. A public accuracy record that can quietly shrink is not one. Those two entries have been restored as retracted, and three guards in `validation.test.js` now hold the line: entries must be stamped against a real bar, every void must record its reason, and the log must never have fewer entries than the last committed version.

## Light and dark

The tokens made this a palette swap rather than a second stylesheet. `:root[data-theme='light']` redefines the same variables; every rule already reads from them.

Not an inversion. Dark surfaces get lighter as they come forward; light surfaces work the other way — page white, panels tinted — because a "raised" card brighter than white has nowhere to go, and borders do the separating that shadow does in the dark. The accent is darkened too: the teal that reads bright on near-black fails contrast against white.

Three states, because "I chose dark" and "my machine is dark" are different things. Choosing *system* clears storage rather than recording a third value that would then outrank the machine, and while following the system the page tracks it live — a laptop that flips at sunset takes the site with it, no reload. An inline blocking script in `index.html` sets the attribute before first paint so a light-theme visitor never sees a flash of dark.

Measured rather than eyeballed: 16.3:1 for headings and 5.3:1 for muted text against the page, both past WCAG AA.

## The gate

A real gate, not a dismissible banner. Nothing renders behind it, there is no close button, Escape does nothing, and a deep link to any ticker page is gated the same as the landing page. The button stays disabled until the checkbox is ticked, so entering takes one deliberate act rather than a reflexive click on the only pressable thing.

It exists because of what is on the other side: a screener that says "aligned up" next to a control that goes to 50×. Caveats that arrive after someone has formed a view are worth very little.

Eight points, deliberately concrete rather than legalese — a boilerplate wall gets scrolled past, and the only version that does anything is one people read. They include the three the site is most on the hook for: that its own measurements find no predictive edge, that the simulator flatters leveraged outcomes because it charges no funding, spread or slippage, and that the position-size panel is arithmetic on numbers you type in rather than a suggestion to take the position it returns.

Acceptance is stored in `localStorage` with a **version**. If the terms change materially the version goes up and everyone is asked again, because consent to one set of terms is not consent to a different set. It is on 2: adding a panel that turns measurements into a share count is a new kind of output, so everyone who accepted the earlier list is asked to read this one. Storage failures (Safari private mode throws rather than returning null) all resolve to "ask again", never to a crash or a silent pass. A footer button re-opens the terms and withdraws the acceptance.

## Where the site does give direct advice

Its own chapter — **Risk**, on every ticker page — plus optional `Max size`, `Stop`, `Typical drawdown`, `Recovery` and `Absorbs` columns on the screener, so 89 instruments can be scanned for the ones that have already gone through a position.

Direction is not on the list, and that is a measurement rather than squeamishness. Base rates that do not separate from their own drift, a confluence score correlating about −0.06 with what follows, and a leaderboard whose handful of survivors from eighty-seven are mostly *under*-performers — the four names it promoted on the day this was written were all below their own drift. A "buy this" derived from inputs measured to carry no information is a confident voice attached to a coin flip, and there is a 50× simulator on the next panel.

Risk is a different question with a real answer. Six reads, in the order the decisions get made.

**Survivable size.** A position opened at every one of the last 250 sessions, at each rung the simulator offers, walked forward. The largest rung that lost none of them. SOL/USD 2×, BTC/USD 3×, NVDA 5×, SPY 10×. Reported as an instruction because it is a fact about a distribution rather than a guess about the next draw — and stated plainly as *not* a recommendation to use that size, but the point past which the instrument has already gone through a position.

**Stop distance.** How often a stop at each ATR multiple would have fired — and, the number nobody computes, how often it would have closed a position that ended profitable anyway. On SPY a 0.5 ATR stop was hit on 69% of holds and took out **half the winners**; 2 ATR cuts that to 6%. Distances are in ATR rather than percent so they compare across instruments: 2% is a tight stop on an index fund and a rounding error on an altcoin.

**Drawdown while held.** What a win rate cannot say: the path. Median, worst decile, deepest — and separately for the entries that finished in profit, because a position sized so the median winner's drawdown is intolerable gets closed at the bottom of half its own winners.

**Time to recovery.** Once a position *closed* a full ATR under water, how many sessions until it touched entry again, and how often it never did. BTC/USD: 38% had not recovered 60 sessions later.

**Absorbable size.** The ceiling the four reads above quietly assume away — that a position of the size they describe can be got into and out of at the price on the screen. One percent of a typical session's traded value, with the tenth-percentile session shown alongside it, because the day a position has to come off is not usually chosen. Crypto pairs report *unknown* rather than zero: the feed quotes them as currency pairs and carries no volume at all, and reading that as zero would label the most liquid instruments on the board untradeable.

**Position size.** The step from measurement to a position, and the only thing here that needs numbers from the reader: how much money is at stake, and how much of it they are willing to lose being wrong once. Neither field arrives with a suggestion in it — a pre-filled "1%" would be this site proposing a risk budget, which is the half of the question it has no standing to answer. What comes back is the multiplication plus the three separately-measured ceilings it runs into (survivable size, quiet-session liquidity, the account itself), with the smallest reported as binding. Both inputs stay in `localStorage` and never leave the browser.

All the excursion-based reads measure intraday lows and highs, because that is when a stop fires and what a drawdown felt like; scoring on closes would flatter every figure. The recovery clock starts on a **close** under water, not an intraday dip — measuring the low made half of BTC/USD's drawdowns "recover in zero sessions", which is a wick inside a session, not something anyone holds through. Tests assert monotonicity (a wider stop can never be hit more often; survival can only fall as leverage rises) and that none of these reads can acquire directional language.

## Overlap

Every other page here reads one instrument. `/overlap` reads a basket, and answers the question a list of screener results cannot: how many separate positions it actually amounts to.

The gap was structural. Filter 89 names down to the six that read the same way and the natural conclusion is that six opportunities were found — usually one was, wearing six tickers. Nothing on the site said so, and the per-name risk figures are misleading the moment more than one is held, because six positions that fall together do not each get their own drawdown budget.

For N equal-risk positions with average pairwise correlation ρ, portfolio variance is (1/N)(1 + (N−1)ρ) times a single position's; setting that equal to 1/k gives **k = N / (1 + (N−1)ρ)** independent bets. The four index ETFs come to 1.2 bets at a mean correlation of 0.80. Three large crypto pairs come to 1.1.

Correlations are Pearson on daily close-to-close returns over 120 sessions, keyed **by date** rather than by array position — the universe mixes 7-day and 5-day calendars, and lining those up by index pairs a Saturday in BTC with a Thursday in SPY and drifts a little further out of register every weekend. Grouping into "same bet" blocks uses average linkage at 0.70, not single linkage, which would chain through individually weak links until one group swallowed the board.

The basket is the watchlist by default; `?symbols=A,B,C` overrides it so a specific basket can be linked and argued about without anyone reproducing a watchlist, and editing a linked basket changes the link rather than the reader's saved list. The matrix ships as `public/correlations.json` (~5.6 KB gzipped, 3,916 pairs) and is fetched only when the page is opened; a single `corrSpy` per row rides along in the index so the screener can sort by it.

## Getting the numbers out

The screener exports exactly what is on screen — same rows, same order, same columns — as CSV. An export that quietly includes rows a filter removed, or a column that was switched off, is a file that disagrees with the page it came from, and the disagreement gets discovered later inside someone else's model. Values are raw rather than formatted (a spreadsheet cannot add up "$220.3M"), units live in the header, and the win rate always travels with its sample size because a rate without its N will be averaged. Filtered exports are named `-filtered` so the file cannot be mistaken for the whole board.

## Screener columns, sorting, filtering and keys

Every column sorts, and the table filters by text (symbol or name), instrument type, chart setup, and confluence lean, plus a "has flags" toggle. Values within a facet are OR, separate facets are AND, and the facets only offer states something is actually in — a filter for a structure nothing is currently in produces an empty table that reads as a broken page.

The row carries more measurement than a fixed table can show, so the middle columns are **chosen**. The spine (star, symbol, price, trend, confluence) is fixed; everything between is toggleable, and the default set is exactly what the table showed before columns existed, so nobody's screener changes until they change it. Hiding the column a table is sorted by drops the sort rather than leaving the table ordered by a number nobody can see — and drops it from the URL too, so the address cannot claim an ordering the page is not using.

Two rules worth keeping if this is edited. Columns sort by **what the cell displays**: the Edge column shows a win rate, so it sorts by win rate rather than by the signed `edge` behind it. And rows with no value sort **last in both directions** — flipping a sort should reorder the rows that have data, not swap a block of dashes from one end to the other. `vs SPY` sorts by distance from zero, because a reliably inverse name is no more independent of the index than a reliably parallel one.

Keyboard: `/` focuses the filter, `j`/`k` (or the arrows) move a row cursor, `Enter` opens it, `s` stars it, `g`/`G` jump to either end, `Escape` drops the highlight, `?` lists them. Nothing fires while the cursor is in a text field — a screener whose filter box eats the "j" out of "JPM" and jumps the cursor instead is worse than one with no shortcuts at all.

The whole view lives in the URL (`?q=&kind=&setup=&verdict=&flagged=&watch=&cols=&sort=rsi:desc`), like every other view on the site, so a narrowed screener can be linked and reloaded. Only non-default state is written, so an untouched screener keeps a clean URL, and changes `replace` rather than `push` so dragging a filter around does not bury the page someone arrived from. Logic is pure functions in `lib/screenerView.js` with the table as a plain consumer. The filter input itself is *locally* controlled and writes to the URL a beat later: driving it straight from the query string meant every keystroke had to survive a router round trip before the next arrived, and typing "NVDA" at speed left "A" in the box.

## The tracked universe

89 symbols: 4 index ETFs, 75 stocks across nine sectors, 2 macro proxies, 8 crypto pairs. Chosen for liquidity and recognisability, explicitly **not** for expected performance — this site's own measurements find no edge, and picking names on a hunch about which will do well would contradict everything else it reports.

The binding constraint is wall-clock, not payload. Twelve Data's free tier allows 8 requests a minute, so the price fetch costs ~7.5s per symbol — about 11 minutes at 89. The daily cap of 800 requests is not close to binding at one request per symbol per run. Past roughly 120 symbols the schedule needs splitting across two runs rather than a longer timeout. The job timeout was raised from 20 to 40 minutes accordingly: a run killed mid-fetch commits nothing at all.

Adding a symbol creates a window where it is on the list but has no bars until the next weekday-evening run. Both ends handle it honestly: the screener paints from the index and so lists only what has real history (saying how many more are pending), and a ticker page for an unsynced symbol is a dead end rather than a page of indicators computed from `getSeries`'s placeholder random walk. Both sync scripts already degrade per-symbol — a bad ticker is skipped and counted, and fundamentals resolve CIKs from SEC's own mapping rather than a hardcoded table.

## Watchlist

Star any row on the screener, or the symbol on a ticker page, and it collects into a watchlist you can filter to. Composes with the other filters, so "my names, and of those the ones in a pullback" is one question rather than two.

Stored in `localStorage`, not the database, deliberately: a watchlist is a preference and not a record. It works on the first visit with no account, no anonymous identity minted, no network round trip before the star responds, and nothing about it is worth putting behind row-level security. The cost — it does not follow you to another device — is the same trade the simulator already makes, and the page says so rather than hiding it. Reads and writes are wrapped because storage *throws* in Safari private mode and when a browser blocks site data; a watchlist that fails to persist is a far smaller problem than a screener that fails to render. Cross-tab `storage` events keep two open tabs from disagreeing about what is starred.

`filterToWatchlist` is strict: an empty watchlist matches nothing. Treating it as "no filter" leaves the chip visibly active with all 24 tickers still listed, which reads as broken — that was a real bug, caught in a browser doing exactly that. The page distinguishes "nothing starred yet" from "starred names, none of which match the other filters" and says which.

## Feedback (optional)

`/feedback`, linked from the header and from the footer of every page ("Spotted a number that looks wrong?"). The report it is built for is *this figure is wrong*: a site whose only real claim is that its numbers are measured rather than asserted is worth exactly what its willingness to be corrected is worth.

That report is also the one most likely to be unanswerable by the time it is read, because the snapshot rolls every weekday — "the price-to-book on this page looks off" cannot be checked a week later against data that has since changed. So a submission carries the route it was sent from and the snapshot timestamp that page was showing, captured automatically and displayed on the form before sending rather than attached invisibly. Client-side navigation never sets `document.referrer`, so in-app links pass the origin page through router state (`components/FeedbackLink.jsx`); the referrer is only a fallback for someone arriving from outside.

Same Supabase project and same anonymous identity as the simulator, its own table. Insert and select-own only — no update or delete policy, deliberately: a report is a record of what a page said at a moment, and one that can be rewritten afterwards is not one. Rate limited to 10 per hour per identity through a `security definer` function, because a policy that selects from the table it guards recurses through its own RLS. Validation bounds live in `lib/feedback.js` and are asserted against the SQL constraints in `feedback.test.js`, so the form and the database cannot drift into disagreeing about what is acceptable.

### Reading what comes in

RLS scopes `select` to `auth.uid() = user_id`, so submissions are only readable through the app by whoever sent them — there is deliberately no in-app inbox, because building one would mean either a policy that lets some account read everyone's rows or an admin check enforced in client-side JavaScript, and neither belongs in a static site with no server.

Read them in the Supabase dashboard instead — **Table Editor → feedback**, or SQL Editor:

```sql
select created_at, kind, message, contact, page, snapshot_at
from feedback
order by created_at desc
limit 50;
```

`page` and `snapshot_at` are what make a "this number is wrong" report reproducible: check out the commit whose sync produced that snapshot and the figure being disputed is the one that was on screen. Without them the report is unfalsifiable a week later, which is why they are captured rather than requested.

## What loads when

The screener is the page every visit starts on, so it is what ships in the entry chunk; every other route is fetched when someone goes there. The Supabase client is loaded on demand rather than imported at boot — it is around 350 KB, larger than every page on this site combined, and it serves two optional features most visits never touch. `HAS_SUPABASE` stays a plain synchronous check of the environment, so the "not configured on this deployment" branches still resolve during render without waiting on anything.

The result, measured on the built output: the entry bundle went from 656 KB (196 KB gzipped) to 279 KB (93 KB), and the screener downloads no auth library at all. A chunk that fails to arrive throws inside `Suspense` and is caught by the same error boundary every other page-level failure hits.

## When the database has not been set up

Both optional features need a table that someone has to create by running `supabase/schema.sql` once. Until that happens the deployment sits in a state the app previously had no word for: credentials present, client connects, auth works, every query fails. What a visitor saw was the raw PostgREST string — and on the feedback form, they saw it *after* writing a paragraph, which is the worst possible moment to find out the message has nowhere to go.

So a missing table is treated as a configuration state rather than an error. `lib/supabaseHealth.js` tells an unknown relation (`42P01`, `PGRST205`) apart from a policy refusal (`42501`) apart from a dead connection, and the feedback page asks once, before offering the form, whether the table is actually there. If it is not, the form is switched off and the page says exactly which file has to be run and where. Verified against a stubbed project that answers 404 to every table.

## Tests

`npm test` runs everything: unit tests over the pure functions, validation tests that run against the committed snapshot rather than fixtures (OHLC invariants, look-ahead leaks, date-stamping in the track record, the correlation matrix reproducing from the bars in the repository), and static checks over the components.

Those static checks exist because of a specific escape. A `useState` setter was renamed, one call site inside a JSX handler was missed, the build resolved nothing, 543 unit tests passed, and the first sign of trouble was `setMultiple is not defined` thrown when someone changed a dropdown. `src/lib/components.test.js` now fails on a setter that is called but never declared, or declared and never called.

`npm run smoke` is the general version and needs a preview server and Playwright (not a dependency — it is a large install for something run by hand). It walks all 17 pages checking for uncaught exceptions, unrendered `NaN`/`undefined`, and horizontal overflow, then clicks the things unit tests cannot reach: the filter box at speed, the column picker, the sort headers, the keyboard shortcuts, the CSV download, the position sizer's dropdown and the overlap basket. Both guards were confirmed by reintroducing the original bug and watching them fail.

## Deploying

Configured for Vercel (`vercel.json` has the SPA rewrite). Push to a repo, import into Vercel. Set `VITE_FINNHUB_KEY` there if using the live price overlay — no Twelve Data key needed in Vercel at all, since the browser never calls Twelve Data.

For the daily sync to actually run, add `TWELVE_DATA_KEY` as a **GitHub Actions repository secret** (Settings > Secrets and variables > Actions) — separate from any Vercel env var, since Actions and Vercel don't share secrets.
