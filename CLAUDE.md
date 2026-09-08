# Confluence

A technical-analysis screener that measured its own predictive power, did not
find any, and turned that into the product. Everything below is a fact about
this project that is expensive to rediscover — not general advice.

## The shape

`/` asks what someone is about to buy and two things about how (borrowing?
holding how long?), then leads with the one measurement those answers make
relevant. `/why` is the evidence that nothing here predicts direction. `/check`
turns the measurements into a share count. Everything else is depth.

Three rules follow from that shape and are easy to break while trying to be
helpful:

- **Plainer wording, identical claim.** `lib/plainRisk.js` writes the front page
  in words with no vocabulary in them. "Don't go above 3x" reads beautifully and
  is a recommendation about size; "At 3x, this has already wiped out a position"
  is the same length and is a fact. The first draft got this wrong.
- **Demote, never hide.** `lib/guided.js` reorders by relevance. Anything not
  promoted stays behind a control that is always visible, and the page says what
  the ordering was based on.
- **Nothing on the front pages is written down.** Every figure is read from the
  published files at render time — see `lib/verdict.js`. A hardcoded number is
  an opinion that was true once. This has been broken once, by hardcoding a hit
  rate into the refusal copy.

## The liquidation arithmetic

The one number here someone could lose money by trusting. Derived, not asserted:
a long's equity is N·E·p/p0 − E(N−1), zero at **p/p0 = 1 − 1/N**; a short's is
E(N+1) − N·E·p/p0, zero at **1 + 1/N**. The adverse move that wipes a position
out is exactly **1/N**.

Test it against that derivation, never against the implementation. A special
case here returned `Infinity` for a 1x short — "an unborrowed short can never be
wiped out", which is false, it dies when price doubles — and **the existing test
asserted `Infinity` was correct**, which is why it survived.

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
