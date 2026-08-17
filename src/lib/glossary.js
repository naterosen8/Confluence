// One definition per concept, used by both the inline "?" explainers and the
// methodology page. Kept in a single file on purpose: two copies of a
// definition drift, and a caveat that appears on the methodology page but not
// next to the number it applies to is a caveat nobody reads.
//
// Every entry carries `isNot`. That field is the point of this file. Most
// misreadings here are not people failing to learn a definition, they are
// people applying a reasonable but wrong default meaning — "score" reads as
// confidence, "win rate" reads as profitability, "N" reads as independent
// trials. Stating the wrong meaning explicitly is the only thing that
// displaces it.

// What kind of claim a number makes. The app shows all four, and they were
// previously indistinguishable from one another in the UI.
export const BASIS = {
  current: {
    label: 'Live reading',
    blurb: 'What the indicators say as of the last daily sync. A description of now, not a forecast.',
  },
  measured: {
    label: 'Already happened',
    blurb: 'Computed from real past prices. These outcomes are settled — they are history, not prediction.',
  },
  hypothetical: {
    label: 'What-if',
    blurb: 'A position nobody actually took, replayed against real past prices to show what it would have done.',
  },
  accounting: {
    label: 'From filings',
    blurb: "Taken from the company's own reported financial statements, which can be up to a quarter stale.",
  },
}

export const GLOSSARY = {
  confluence: {
    term: 'Confluence (the name)',
    basis: 'current',
    what: 'The point where separate streams meet. Here: technical, fundamental and macro evidence read side by side rather than blended.',
    how: 'Each of the three layers is scored on its own inputs and reported separately. They are never summed into one number, because they measure different things in different units.',
    isNot:
      'Not a claim that agreement is proof. Independent streams can be wrong together, and three layers pointing the same way is a common feature of the top of a cycle. It also does not describe the five technical checks in the score — those overlap heavily and are not a confluence of anything.',
  },
  technicalLayer: {
    term: 'Technical layer',
    basis: 'current',
    what: 'What price and volume are doing right now: whether a defended level has been cleared, whether participation backed it, and where price sits against structure.',
    how: 'Breakout past a prior swing high (worth more when volume confirms), proximity to a swing low, price against its 50-day average, and unconfirmed highs or lows.',
    isNot:
      'Not independent evidence from the other technical numbers on this page — it reads the same price series. Its value in the confluence view is that it can disagree with the other two layers, which read different data entirely.',
  },
  fundamentalLayer: {
    term: 'Fundamental layer',
    basis: 'accounting',
    what: 'Whether the business underneath is improving: revenue and net income direction year over year, and what the balance sheet can absorb.',
    how: 'Year-over-year change in the latest reported quarter versus the quarter closest to a year earlier, plus net cash as a share of market cap.',
    isNot:
      'Not current. Filings are up to a quarter stale and describe a period that has already ended, so this layer moves four times a year while price moves every day. Absent when a filer does not tag usable quarterly figures — absent is reported as absent, never as neutral.',
  },
  macroLayer: {
    term: 'Macro layer',
    basis: 'current',
    what: 'Whether the tide is coming in or going out — the price of money and the appetite for risk, read from what bond and credit markets are currently paying.',
    how: 'TLT over 60 sessions as a proxy for long rates (rising TLT = falling rates = easing), and HYG over the same window as a proxy for credit spreads and risk appetite.',
    isNot:
      'Not an economic measurement or a policy forecast. It is two ETF prices standing in for conditions they are correlated with, and that correlation can break exactly when it matters most.',
  },
  layerAlignment: {
    term: 'Layer alignment',
    basis: 'current',
    what: 'Whether the available layers point the same way, disagree with each other, or fail to lean at all.',
    how: 'Each available layer is reduced to up, down or flat; all-up or all-down is aligned, any up-and-down mix is conflicting.',
    isNot:
      'Not a score, and not a count out of three. Alignment across two available layers is a two-layer reading — a missing layer is excluded, never counted as agreement or as neutral.',
  },
  marketRead: {
    term: 'Market read',
    basis: 'current',
    what: 'What kind of tape this is right now: where the index sits against its own trend, how many individual names are participating, and what bond and credit markets are pricing.',
    how: "The index against its 50- and 200-day averages, breadth as the share of tracked non-macro names holding above their own 50-day, index volatility as a percentile of its own recent range, and 60-session direction in TLT and HYG.",
    isNot:
      'Not a forecast, and not the whole market — breadth here is measured across the couple of dozen names this site tracks, which is a sample and a skewed one. Its value is that breadth cannot be seen from any single ticker page: an index holding up while most names are not is a fact about now that no individual chart shows.',
  },
  fundamentalRead: {
    term: 'Balance sheet read',
    basis: 'accounting',
    what: 'What kind of business the filings describe, and where the risk in the equity sits — put together as a sentence rather than left as a row of separate figures.',
    how: 'Capital structure first (net cash or net debt against market cap), then the direction of revenue and net income year over year, then what the price-to-book multiple implies. The first structure that fits is reported.',
    isNot:
      'Not current and not a forecast. These are filed figures, up to a quarter behind the price they are compared against, and the read says which filing date it came from. It also cannot tell a one-off charge from a durable margin problem — the filing does not distinguish them either.',
  },
  positionRead: {
    term: 'Position read',
    basis: 'hypothetical',
    what: 'How close an open position is to the level that ends it, measured in the instrument\u2019s own daily range rather than in percent.',
    how: "Distance from the current price to the liquidation level, divided by the 14-day average true range, alongside a count of how many of the last 250 sessions moved at least that far against the position in a single day.",
    isNot:
      'Not a probability. The session count is what already happened, not the chance the next one does. And it is optimistic: real venues close a position before equity reaches zero, and charge funding and spread on the way.',
  },
  feedbackContext: {
    term: 'What gets sent with your feedback',
    basis: 'accounting',
    what: 'The page you came from and the timestamp of the data snapshot that page was showing, attached to your message automatically.',
    how: 'The route is taken from the link you followed here (or the previous page on this site), and the snapshot time is the one already displayed in the header. Both are shown on the form before you send, and neither is required — a report with them missing still arrives.',
    isNot:
      'Not identifying, and not tracking. No email, no name, no IP logging, and no record of anything you looked at beyond the one page named on the form. It exists because a report that a figure is wrong cannot be checked once the daily sync has replaced the figure — without the date, the most useful kind of feedback is also the least actionable.',
  },
  gapInterval: {
    term: 'Gap and its range',
    basis: 'measured',
    what: 'The difference between a directional hit rate and the drift over the same windows, with a 95% range on the difference itself.',
    how: "Newcombe's hybrid-score method: a Wilson interval is built for each rate and the bounds are combined. The interval on a difference is wider than the interval on either rate it is built from, which is why two rates that look far apart are often not distinguishable at all.",
    isNot:
      'Not a test against 50%. A coin flip is the wrong alternative to skill — over a rising market an upward-leaning call is right most of the time with no skill involved, so the thing to beat is the drift. If the range spans zero, no difference has been shown, however far apart the two rates look. The samples are also not fully independent: the drift windows include the called ones and overlapping forward windows are correlated, both of which make the true range wider than the one shown.',
  },
  voidedCall: {
    term: 'Retracted call',
    basis: 'accounting',
    what: 'A logged call the record has withdrawn, kept visible and excluded from every statistic.',
    how: 'When a provider settles a bar the entry was stamped against, the verdict is recomputed from history truncated to that bar. If it becomes a split, the call would never have been logged, so it is marked void in place with the reason and the date rather than deleted.',
    isNot:
      'Not a deletion, and not a correction of a result. Settled outcomes are never touched. Earlier versions removed these rows outright, which meant the log could shrink with nothing recording that it had — the two calls dated 2026-08-09 were lost that way and have been restored as retracted.',
  },
  macroRead: {
    term: 'Macro read',
    basis: 'current',
    what: 'Long rates and corporate credit read as a pair rather than as two separate scores — the four combinations of the two mean four different things, and one of them is invisible if you add them up.',
    how: 'Sixty-session change in TLT (long Treasuries; up means long yields falling) against the same change in HYG (high-yield credit; up means spreads tightening). Both up is easing, both down is tightening, and the two mixed cases are a flight to quality and a reflation respectively. Moves under 1.5% in either are treated as drift rather than direction.',
    isNot:
      'Not a measurement of rates or credit — two ETFs standing in for them, each with its own duration, supply and fund-flow behaviour. Not specific to any ticker either: it is the weather every position is held in, not a statement about one of them. And it describes sixty sessions that already happened.',
  },
  setupRead: {
    term: 'Setup read',
    basis: 'current',
    what: 'A plain-language description of what this chart is currently doing, named the way a technician would name it, with the price that would prove the description wrong.',
    how: 'Structural tests in priority order — position against the 50- and 200-day averages, whether a cleared level was given back, how stretched price is from trend in units of its own daily range, whether volatility is compressed. The first structure that fits is the one reported.',
    isNot:
      'Not a forecast and not a recommendation. It says what the chart IS, not what it will do — this site\u2019s own measurements find no relationship between these structures and what follows. Its value is that it is falsifiable: every read names the level that breaks it, so it can be checked rather than believed.',
  },
  breakout: {
    term: 'Breakout',
    basis: 'current',
    what: 'Price clearing a swing high the market had previously turned at, with the crossing itself having happened recently.',
    how: 'The nearest prior swing high below today\'s price, from the last 150 sessions, where price was still below that level at some point in the last 20 sessions.',
    isNot:
      'Not a signal that the move continues. Breakouts fail routinely, and the level being old is not itself evidence — what is checked is that the crossing is recent, not that the level is.',
  },
  volumeConfirmation: {
    term: 'Volume confirmation',
    basis: 'current',
    what: 'Whether the breakout happened on more participation than usual, at 1.3× the 20-session average or better.',
    how: 'Latest volume against the 20-session mean. A confirmed breakout scores double an unconfirmed one.',
    isNot:
      'Not the same as "no volume data". Some instruments here — spot crypto pairs on this feed — report no volume at all, and that case is labelled unavailable rather than unconfirmed, because "we looked and it was thin" and "we could not look" are different findings.',
  },
  earningsYoY: {
    term: 'Year-over-year earnings trend',
    basis: 'accounting',
    what: 'Whether revenue and net income are higher than the same quarter a year ago — a direction, not a level.',
    how: 'The latest reported quarter matched against the filed quarter closest to 365 days earlier, accepted only within a 45-day tolerance.',
    isNot:
      'Not sequential growth, which would mostly measure the calendar in a seasonal business. Not available for every filer either: several report a fiscal-year quarter only inside the annual total, so a genuine year-ago comparison sometimes does not exist and is reported as unavailable rather than estimated.',
  },
  livePrice: {
    term: 'Live price',
    basis: 'current',
    what: 'A quote polled from Finnhub during market hours, shown with a dot beside it, overlaid on the daily snapshot price.',
    how: 'Polled every few seconds per symbol. Cosmetic only — no indicator, score, base rate or backtest on the site uses it.',
    isNot:
      'Not what the analysis is computed from. Everything else on the page is as of the last daily sync, so a live price moving does not move the score, and the two can visibly disagree.',
  },
  dailySnapshot: {
    term: 'Daily snapshot',
    basis: 'current',
    what: 'The committed file of daily bars that every indicator, score and base rate on this site is computed from.',
    how: 'Written by a scheduled job after the US close each weekday, roughly 1000 daily bars per symbol.',
    isNot:
      'Not real time, and not guaranteed fresh. If the job fails the site keeps serving the last good file — which is why its age is stated rather than hidden, and why a stale snapshot describes that date rather than today.',
  },
  demoData: {
    term: 'Demo data',
    basis: 'current',
    what: 'A generated random walk used only when a symbol has no synced history at all.',
    how: 'Deterministic pseudo-random bars, so the page renders and the mechanics can be inspected.',
    isNot:
      'Not real prices, and never presented as though it were. Pages running on it say so; the base rates, verdicts and simulator refuse to mark anything to it.',
  },
  flags: {
    term: 'Flags',
    basis: 'current',
    what: 'Notable conditions detected on the latest bar: an unconfirmed high or low, a volatility squeeze, or unusually heavy volume.',
    how: 'Each flag is an independent check on the same latest bar; a row shows every one that currently applies, or a dash for none.',
    isNot:
      'Not a ranking, and not additive. Three flags is not a stronger case than one — several of them can fire off the same underlying move, and none of them carries a direction on its own.',
  },
  sparkline: {
    term: 'Sparkline',
    basis: 'current',
    what: 'The recent closing prices drawn to scale, most recent at the right.',
    how: 'Closes only, scaled to their own minimum and maximum over the window shown — no volume, no intraday range.',
    isNot:
      'Not comparable between tickers. Each one fills its own vertical space, so a dramatic-looking line may be a 2% range and a flat one a 40% range.',
  },
  forwardWindow: {
    term: 'Forward window (5 sessions)',
    basis: 'measured',
    what: 'The fixed holding period every outcome on this site is measured over: the close 5 trading sessions after the signal.',
    how: 'Close-to-close. Days without a full 5-session window ahead of them are excluded rather than half-counted.',
    isNot:
      'Not a chosen or optimal horizon, and not one the numbers were tuned to. It is also why occurrences on consecutive days are not independent — their windows overlap by four sessions out of five.',
  },
  medianReturn: {
    term: 'Median return',
    basis: 'measured',
    what: 'The middle outcome once every replayed occurrence is sorted — half did better, half worse.',
    how: 'The 50th percentile of the same set of outcomes the average is computed from.',
    isNot:
      'Not interchangeable with the average. When the two diverge sharply the distribution is lopsided — typically a few large moves carrying the mean — and the median is the better description of a typical occurrence, while the mean is what a mechanical taker of every signal would have compounded.',
  },
  bestWorst: {
    term: 'Best / worst',
    basis: 'measured',
    what: 'The single most and least favourable occurrence in the sample.',
    how: 'The extremes of the same outcomes summarized by the average and median.',
    isNot:
      'Not a range of what to expect, and not a bound. They are two individual observations out of a small sample, and the true worst case is simply one that has not happened yet in this history.',
  },
  signalEvent: {
    term: 'Individual signal base rate',
    basis: 'measured',
    what: 'What happened over the next 5 sessions on every prior day this one specific event fired, in this one ticker.',
    how: 'Each event is detected independently across the tracked history and its forward outcomes are summarized.',
    isNot:
      'Not evidence about the setup as a whole — these are single mechanisms in isolation, tested one ticker at a time, usually on very few occurrences. Several are also correlated with each other, so agreement between two cards is not two findings.',
  },
  simulatedTrade: {
    term: 'Simulated trade',
    basis: 'hypothetical',
    what: 'A position you chose — direction, stake and leverage — recorded and marked against real prices so the outcome is visible.',
    how: 'Stored against this browser, marked to the daily snapshot, and settled automatically as liquidated if the real price path since entry ever hit the wipeout level.',
    isNot:
      'Not a recommendation, and not the app taking a view. Nothing here suggests a direction or a size; it records the one you picked. No real money, no order, no venue — and no fees, funding, spread or slippage either, so a real version of the same position would have done worse.',
  },
  openPnl: {
    term: 'Open P&L',
    basis: 'hypothetical',
    what: 'What the position would be worth if it were closed at the last synced price.',
    how: 'Price change from entry, multiplied by leverage, applied to the stake — floored at losing the whole stake.',
    isNot:
      'Not settled, and not a price you could have transacted at. It moves with every sync, and it excludes every cost a real position would have paid.',
  },
  longShort: {
    term: 'Long / short',
    basis: 'hypothetical',
    what: 'Which way the position is pointed: long gains when price rises, short gains when it falls.',
    how: 'Direction is your input. The app records it and computes the outcome from it.',
    isNot:
      'Not symmetric in risk. A long can lose at most the stake; an unleveraged short has no upper bound on the loss, and a leveraged one reaches total loss on a smaller move than the equivalent long.',
  },
  breakEvenMove: {
    term: 'Move that wipes out the stake',
    basis: 'hypothetical',
    what: 'How far price has to go the wrong way, in percent, before a leveraged position is worth nothing.',
    how: '100 divided by the leverage. At 10× that is 10%; at 25× it is 4%.',
    isNot:
      'Not the margin call level. Real venues liquidate before equity reaches zero, at a maintenance margin, and charge funding and spread — so the real threshold is nearer than this number.',
  },
  marketImpact: {
    term: 'Market impact',
    basis: 'hypothetical',
    what: 'How much the act of putting this size into the market would move the price against itself while filling.',
    how: 'A square-root model: roughly the daily volatility multiplied by the square root of the order as a share of median daily dollar volume. Checked against notional, not stake, because leverage is what actually reaches the market.',
    isNot:
      'Not a precise cost estimate. It is an order-of-magnitude sanity check on whether the printed price is a price you could transact at — and none of the figures above it are adjusted for it.',
  },
  participation: {
    term: 'Share of daily volume',
    basis: 'hypothetical',
    what: 'The position\'s notional size as a percentage of what this ticker typically trades in a day.',
    how: 'Notional divided by the median daily dollar volume over the recent history.',
    isNot:
      'Not a limit anyone enforces. It is the input to the impact estimate: a fraction of a percent is negligible, a few percent is not, and a double-digit share means the price on the screen is fiction for an order that size.',
  },
  avgOutcome: {
    term: 'Average outcome in dollars',
    basis: 'hypothetical',
    what: 'The mean result across every replayed occurrence, expressed on the stake entered above.',
    how: 'The average percentage outcome applied to the stake, with wipeouts counted as losing the whole thing.',
    isNot:
      'Not what anyone earned, and not compoundable. These windows overlap in time, so stringing them together describes a strategy nobody could have run — which is why no equity curve is drawn.',
  },
  hitRate: {
    term: 'Hit rate',
    basis: 'measured',
    what: 'The share of logged calls where price moved the way the readings leaned, 5 sessions later.',
    how: 'Each call was written down the day it fired and scored later against the actual close. Misses included; nothing is removed.',
    isNot:
      'Not a grade, and meaningless read against 50%. In a rising market an upward-leaning call is right most of the time with no skill involved — the only informative number is the gap between this and the drift baseline beside it.',
  },
  driftBaseline: {
    term: 'Drift baseline',
    basis: 'measured',
    what: 'How often price moved that direction anyway, across exactly the same resolved windows.',
    how: 'The share of the same windows where price simply rose (for upward-leaning calls) or fell (for downward-leaning ones), ignoring what the call said.',
    isNot:
      'Not a benchmark that has to be beaten by much to be luck. On a sample this size the gap has to be large before it is distinguishable from chance at all — a few points either way is noise.',
  },
  scoreCorrelation: {
    term: 'Score-to-return correlation',
    basis: 'measured',
    what: 'Whether a higher confluence score has actually been followed by a better return, measured across every tracked ticker.',
    how: 'Correlation between the score on a day and the return over the following 5 sessions, computed per ticker and averaged with a 95% interval.',
    isNot:
      'Not a reason to invert the signal — that would be the same overfitting error in reverse, and costs would consume a gap this size. The measured value is close enough to zero to be useless either way, and it is published here rather than left in a private notebook.',
  },
  premiumToBook: {
    term: 'Gap vs book',
    basis: 'accounting',
    what: 'The dollar difference between what the market is paying for the company and what its balance sheet carries.',
    how: 'Market cap minus book equity.',
    isNot:
      'Not an overpayment. For most businesses the gap is the value of things accounting does not capitalize — brands, software built in-house, research, customer relationships — so a large positive gap is the normal case, not evidence of a bubble.',
  },
  pbPercentile: {
    term: 'P/B against its own history',
    basis: 'accounting',
    what: 'Where today\'s price-to-book sits within this company\'s own reported range, rather than against other companies.',
    how: 'Today\'s ratio ranked against the ratio at each past reported quarter, using the price at the time.',
    isNot:
      'Not a valuation signal. The sample is a handful of quarters over a couple of years, a company\'s asset mix and business change over that window, and being at the low end of a short history is not the same as being cheap.',
  },
  confluenceScore: {
    term: 'Confluence score',
    basis: 'current',
    what: 'How many of the tracked indicators are currently reading up, minus how many are reading down.',
    how: 'Each of five checks contributes ±1 (RSI at an extreme, MACD vs its signal line, 50-day vs 200-day average, price vs its 50-day average, weekly trend). An RSI divergence adds ±2. The result usually lands between −6 and +6.',
    isNot:
      'Not a probability, a confidence level, or a price target. +4 does not mean "80% likely" or "4 out of 5" — the scale is arbitrary and the indicators overlap heavily, so four agreeing signals are not four independent opinions.',
  },
  verdict: {
    term: 'Agreement badge',
    basis: 'current',
    what: 'How much the tracked indicators currently agree with each other, and which way they point: aligned at ±3 or beyond, leaning at ±1 to ±2, split at 0. The numbers beside it are the raw tally of positive and negative readings.',
    how: 'A band over the confluence score, shown with the underlying vote count so the difference between 5-0 and 4-1 stays visible.',
    isNot:
      'Not a forecast, and no longer worded as one. It used to read "Strong Bullish" and similar, which asserted a direction the site\'s own measurement does not support — the relationship between this score and what follows is close enough to zero to be useless. "Split" also does not mean quiet: it means the indicators are actively disagreeing.',
  },
  winRate: {
    term: 'Win rate',
    basis: 'measured',
    what: 'The share of past occurrences where price moved the way the readings leaned — higher 5 sessions later when they leaned up, lower when they leaned down.',
    how: 'Every qualifying past day is found in the tracked history, and the close 5 sessions later is compared to the close on the day itself.',
    isNot:
      'Not a measure of profitability. A 55% win rate paired with a negative average return is a losing proposition — many small gains and a few large losses. Always read it next to the average return, never alone.',
  },
  avgReturn: {
    term: 'Average return',
    basis: 'measured',
    what: 'The mean price change over the 5 sessions following each past occurrence of a setup.',
    how: 'Close-to-close, unweighted, across every occurrence found in the tracked history.',
    isNot:
      'Not what you would have earned. It ignores fees, spread, slippage and taxes, assumes every signal was taken mechanically, and a mean is easily dragged by one outlier — which is why best and worst are shown alongside it.',
  },
  sampleSize: {
    term: 'Sample size (N)',
    basis: 'measured',
    what: 'How many past occurrences of this setup were found in the roughly one year of price history the app keeps.',
    how: 'A count of qualifying days. Any day without a full 5-session forward window is excluded rather than half-measured.',
    isNot:
      'Not N independent trials. Occurrences close together in time share overlapping forward windows — a signal yesterday and one today cover almost the same five days — so the true number of independent episodes is far smaller than the count suggests. Treat anything under about 15 as a hint, not a statistic.',
  },
  confidenceInterval: {
    term: '95% range (confidence interval)',
    basis: 'measured',
    what: 'The band of true win rates consistent with the handful of occurrences observed.',
    how: 'Wilson score interval at 95%, chosen over the textbook formula because that one misbehaves badly at small samples and rates near 0 or 100%.',
    isNot:
      'Not a range of expected outcomes for the next trade. It describes uncertainty about the historical rate itself. If the band spans 50%, the sample cannot distinguish this setup from a coin flip — however far the headline percentage sits from 50.',
  },
  independentSample: {
    term: 'Independent occurrences',
    basis: 'measured',
    what: 'How many of the counted occurrences are genuinely separate episodes rather than overlapping ones.',
    how: 'Walks the occurrences in order and counts only those beginning after the previous one\'s forward window has closed.',
    isNot:
      'Not a correction that makes the statistics valid. It is a floor on how much independent evidence exists, and it is usually far below the raw N.',
  },
  regime: {
    term: 'Market regime',
    basis: 'measured',
    what: "Whether the broad market was trending up, trending down, or chopping sideways, judged from SPY's own 50-day and 200-day averages.",
    how: 'Up when SPY is above its 50-day and the 50-day is above the 200-day; down for the mirror case; choppy otherwise. Crypto bars, which trade on weekends, are matched to the most recent prior SPY trading day.',
    isNot:
      'Not a market forecast, and a crude three-way split rather than a full description of market conditions.',
  },
  regimeMatched: {
    term: 'Regime-matched sample',
    basis: 'measured',
    what: "The same base rate, but restricted to past days when the broad market was in the same regime as today's.",
    how: 'Filters the occurrences by regime before summarizing them.',
    isNot:
      'Not automatically the better number. It is more relevant but much smaller, and a small relevant sample can mislead more than a large loose one. The app prefers it only when it has at least 8 occurrences.',
  },
  selectionCorrection: {
    term: 'Corrected for how many were looked at',
    basis: 'measured',
    what: 'Whether any ticker\u2019s record survives the fact that it was picked as the best of many.',
    how: "Each ticker's win rate is tested against its own drift rate — how often price rose over the same windows regardless of any signal — with an exact binomial test. The resulting p-values then go through a Benjamini-Hochberg correction across every ticker ranked, controlling the false discovery rate at 5%.",
    isNot:
      'Not a filter that leaves the good ones behind. Surviving means a record is unlikely to be pure selection; it is still not a forecast, and it says nothing about what happens next. The correction gets stricter as more tickers are tracked, which is correct — more places to look means more chances to be fooled.',
  },
  edge: {
    term: 'Edge (leaderboard ranking)',
    basis: 'measured',
    what: 'How far a setup\'s historical win rate sits from a coin flip, scaled by how much evidence supports it.',
    how: 'Win rate minus 50, multiplied by the square root of the sample size. Used only to order the dashboard cards.',
    isNot:
      'Not an expected return, and not a ranking of which ticker to buy. It measures strength of historical evidence, in either direction — a strong downward record ranks just as highly as a strong upward one.',
  },
  rsi: {
    term: 'RSI (14)',
    basis: 'current',
    what: 'A 0–100 gauge of how one-sided recent price changes have been, over 14 sessions.',
    how: "Wilder's formula: average gain divided by average loss, smoothed. Below 30 is conventionally called oversold, above 70 overbought.",
    isNot:
      'Not a reversal signal. In a strong trend RSI can sit above 70 or below 30 for weeks while price keeps going, and "oversold" does not mean "cheap".',
  },
  macd: {
    term: 'MACD',
    basis: 'current',
    what: 'Whether short-term momentum is accelerating relative to medium-term momentum.',
    how: 'The 12-day exponential average minus the 26-day, compared against a 9-day average of itself. Above that signal line counts as reading up, below as reading down.',
    isNot:
      'Not a leading indicator. It is built entirely from past averages and turns after price does, so a crossover confirms a move that has already begun.',
  },
  trend: {
    term: '50-day / 200-day trend',
    basis: 'current',
    what: 'Whether the intermediate trend is up, judged by the 50-day average against the 200-day, and by price against the 50-day.',
    how: 'Two separate ±1 checks in the score: the averages against each other, and price against the 50-day.',
    isNot:
      'Not independent of the other checks. Trend, MACD and price-vs-average all measure closely related things, so they tend to agree with each other and inflate the score together.',
  },
  weeklyTrend: {
    term: 'Weekly trend',
    basis: 'current',
    what: 'Whether price sits above its 10-week average, resampled from the same daily bars.',
    how: 'Daily bars are grouped into Monday-to-Friday weeks and the last 10 weekly closes are averaged.',
    isNot:
      'Not a second opinion from a different data source. It is the same price series viewed at a coarser interval.',
  },
  divergence: {
    term: 'RSI divergence',
    basis: 'current',
    what: 'Price making a new high or low that RSI does not confirm — often read as momentum fading beneath the surface.',
    how: 'Compares the two most recent swing highs (or lows) within the last 60 sessions against RSI at those points. Worth ±2 in the score, the largest single contribution.',
    isNot:
      'Not present in the backtest tables. Recomputing swing structure for every historical day is expensive, so the score used in those tables excludes divergence — which is why the badge and the table can disagree by a tier.',
  },
  atrPercentile: {
    term: 'Volatility percentile (ATR)',
    basis: 'current',
    what: "Where today's average daily range sits within this ticker's own recent range history, from 0 to 100.",
    how: '14-day average true range, ranked against its last 100 readings.',
    isNot:
      'Not a direction signal. A low reading says moves have been small lately, which often precedes a larger one — it says nothing about which way.',
  },
  bollingerSqueeze: {
    term: 'Bollinger squeeze',
    basis: 'current',
    what: 'Whether the Bollinger bands have narrowed unusually far, meaning price has been unusually calm.',
    how: 'Band width ranked against its last 100 readings; below the 20th percentile counts as a squeeze.',
    isNot: 'Not a prediction that a breakout is coming, and no indication of which direction one would take.',
  },
  relativeVolume: {
    term: 'Relative volume',
    basis: 'current',
    what: "Today's volume against the average of the previous 20 sessions.",
    how: 'Latest volume divided by that 20-session mean.',
    isNot:
      'Not a measure of buying pressure. Every share bought was also sold; high volume means conviction on both sides, not one.',
  },
  supportResistance: {
    term: 'Support and resistance',
    basis: 'current',
    what: 'Recent price levels the market has already reacted to — a swing low below the current price, a swing high above it.',
    how: 'Local extremes: a bar whose high or low is the most extreme within three bars either side, taken from the last 150 sessions.',
    isNot:
      'Not a floor or a ceiling. These are levels price has turned at before, which is a reason to watch them, not a reason to expect them to hold.',
  },
  trackRecord: {
    term: 'Track record',
    basis: 'measured',
    what: 'Every day the app showed a ticker’s readings leaning one way rather than splitting, logged as it happened and scored 5 sessions later.',
    how: 'Written automatically by the daily job to a committed file. Nothing is removed after the fact, and misses are included.',
    isNot:
      'Not a performance record of a strategy. Calls overlap, are unweighted and unsized, and a "hit" only means price moved the way the verdict leaned — by any amount, however small.',
  },
  leverage: {
    term: 'Leverage',
    basis: 'hypothetical',
    what: 'Borrowing to hold a position larger than the stake, multiplying both the gain and the loss.',
    how: 'A position at Nx moves N times as much as the underlying. At Nx, a move of 1/N against it destroys the entire stake.',
    isNot:
      'Not a way to increase expected return. It scales the outcome in both directions while adding a floor at total loss, which is why higher leverage lowers the average outcome even when the direction is unchanged.',
  },
  wipedOut: {
    term: 'Wiped out (liquidation)',
    basis: 'hypothetical',
    what: 'The share of replayed positions where price moved far enough against the position to destroy the whole stake before the window closed.',
    how: "Checked against each session's intraday low for a long, or high for a short — a leveraged position dies the moment price touches the level, not at the close.",
    isNot:
      'Not a worst case. Real venues liquidate earlier, at a maintenance margin above zero equity, and charge funding and spread on top, so the real rate would be at least this high.',
  },
  marketCap: {
    term: 'Market cap',
    basis: 'accounting',
    what: 'What the market is currently paying for the whole company.',
    how: "Current share price multiplied by shares outstanding from the latest SEC filing. A company with multiple share classes reports that count per class, which the filings API leaves out, so for those the weighted-average share count off the income statement is used instead and the row says so.",
    isNot:
      'Not the cost to buy the company. It ignores debt, and buying every share would move the price well above the last trade. Where the weighted average stands in, it is also not exact — that is an average across the quarter rather than a count on its last day.',
  },
  bookEquity: {
    term: 'Book equity',
    basis: 'accounting',
    what: "What the company's own balance sheet says the shareholders' stake is worth.",
    how: "Shareholders' equity exactly as reported in the most recent 10-Q or 10-K, which is the parent's stake and excludes minority interests in subsidiaries. Only where a filer does not report that figure is it computed as assets minus liabilities, which does include those minority interests — the row says which one you are looking at.",
    isNot:
      'Not an appraisal or a liquidation value. Assets are carried at historical cost less depreciation, and internally-developed software, brands, patents and research are largely absent. The two bases above are also not interchangeable: the gap between them runs to billions at companies with large consolidated subsidiaries.',
  },
  priceToBook: {
    term: 'Price / book',
    basis: 'accounting',
    what: 'How many times the accounting equity the market is paying.',
    how: 'Market cap divided by book equity.',
    isNot:
      'Not a measure of how overpriced something is. For asset-light businesses most of the value is legitimately off the balance sheet, so a high multiple is normal; and a low one is as often the market correctly anticipating write-downs as it is a bargain. The ratio is far more informative for banks, insurers and holding companies.',
  },
  netCash: {
    term: 'Net cash',
    basis: 'accounting',
    what: 'Cash and short-term investments minus all debt.',
    how: 'Summed from the relevant line items in the latest filing.',
    isNot:
      'Not money available to shareholders. It may be committed to operations, held overseas, or needed as a regulatory buffer.',
  },
  enterpriseValue: {
    term: 'Enterprise value',
    basis: 'accounting',
    what: 'What the operating business alone is being priced at, setting the cash pile aside.',
    how: 'Market cap minus net cash.',
    isNot: 'Not a price anyone would pay in practice; it is a comparison device for businesses with different cash and debt loads.',
  },
  ncav: {
    term: 'Net current asset value',
    basis: 'accounting',
    what: "Graham's deep-value yardstick: current assets minus every liability, valuing all long-term assets at zero.",
    how: 'Current assets less total liabilities, from the latest filing.',
    isNot:
      'Not a floor on the share price. Companies trading below it usually are so because the market expects those assets to be consumed by losses.',
  },
}

export function glossaryByBasis() {
  const groups = {}
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    ;(groups[entry.basis] ||= []).push({ key, ...entry })
  }
  return groups
}
