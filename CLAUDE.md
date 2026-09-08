# Confluence

A technical-analysis screener that measures its own predictive power and does not
find any. Everything below is a fact about this project that is expensive to
rediscover — not general advice.

## The line the site does not cross

**Never state a direction, a size, or an instrument to take.** The site's own
record says the readings carry no information, so a page that says "buy this" is
contradicting the page next to it. The risk chapter *is* allowed to be
instructional — survivable size, stop distance, drawdown, recovery, liquidity —
because those describe a distribution that already happened rather than guessing
the next draw. Position sizing is arithmetic on numbers the reader types in; it
never proposes an account size or a risk budget.

Tests assert this and should keep doing so. `brief.test.js` and
`validation.test.js` both check that no assembled text can acquire directional
language, across every ticker.

## Check the N. It is usually not the N.

Six errors of one kind have been found here. Every one made the site look better
than it was; none went the other way. In order:

1. Base rates tested against 50% instead of the instrument's own drift — 8 of 96
   "distinguishable" results survived as 1.
2. The same wrong null in three more places.
3. 260 resolved calls treated as 260 observations. They were made on 10 days,
   about 2 non-overlapping windows. The published interval was 2.3x too narrow.
4. `summarize()` computed `independentSample` and then built the interval on the
   raw count anyway, eight lines apart — 22 of 88 tickers claimed a
   distinguishable gap, 1 survived.
5. `safeLeverage` measured over 250 entries. It is a minimum over the window, so
   it can only fall as the window grows: 39 of 89 tickers were overstating, HYG
   by 50x to 10x.
6. The limits page claimed to *avoid* survivorship bias. The list was picked
   today, from names that survived to be picked.

So, two working rules:

- **Before publishing any interval, say out loud what N it rests on and whether
  that N counts independent observations.** The three shapes this takes here are
  overlapping forward windows, many calls made on the same session, and
  extreme-value statistics that only move one direction.
- **When you find an error, check which way it leans.** If everything found so
  far leans one way, the search is not finished. Rule 4 was shipped two days
  after rule 3 was fixed, by someone who had just written a paragraph about this.

The null is always the instrument's own drift, never a coin flip. A conditional
rate (regime-matched, say) needs a conditional baseline.

## Derived files

`public/` carries four files computed from the bars and the log. Adding a fifth
means touching **all** of:

1. `scripts/sync-market-data.mjs` — the daily job
2. `scripts/rebuild-derived.mjs` — regenerates offline, no API key; this one was
   missed once and the summary silently went stale
3. `.github/workflows/sync-market-data.yml` — the `git add` line
4. `validation.test.js` — a guard that recomputes it from source and compares

Never restamp `generatedAt` on a rebuild; it describes the data, not the run.
Watch for negative zero — `Math.round` produces it, JSON writes it as `0`, and a
file then stops equalling the value it was built from.

## Verifying

`npm test` is unit plus validation against the committed snapshot. `npm run
smoke` needs a preview server and Playwright, and it is the only thing that
clicks anything — it caught a runtime error that the build and 543 unit tests
missed. Run both before pushing.
