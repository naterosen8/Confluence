// `kind` gates analysis that only makes sense for operating companies:
// balance-sheet valuation is meaningless for an ETF (its NAV is definitionally
// its holdings) and undefined for a raw crypto pair (no issuer, no filings).
//
// The size of this list is bounded by the sync, not by the site. Twelve Data's
// free tier allows 8 requests a minute, so the job spends 7.5 seconds per
// symbol: 89 symbols is ~11 minutes of fetching. The daily cap is 800 requests
// and this uses one per symbol per run, so that is not the binding constraint
// — wall-clock against the workflow timeout is. Past roughly 120 symbols the
// schedule needs splitting across two runs rather than a longer timeout.
//
// Payload was the other old limit and is not one any more: the screener index
// is a few hundred bytes per row, and bar history is one file per symbol,
// fetched only when that ticker's page is opened.
//
// Chosen for liquidity and recognisability across sectors, not for any
// expected edge — this site's own measurements find none, and picking names on
// a hunch about which will do well would contradict everything it reports.
// Breadth matters for a different reason: the market read measures how many
// tracked names hold their trend, and two dozen mostly-technology names made
// that a statement about technology rather than about the market.
export const TICKERS = [
  // --- Index ETFs ---------------------------------------------------------
  { symbol: 'SPY', name: 'S&P 500 ETF', group: 'Index', kind: 'etf' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', group: 'Index', kind: 'etf' },
  { symbol: 'DIA', name: 'Dow Jones ETF', group: 'Index', kind: 'etf' },
  { symbol: 'IWM', name: 'Russell 2000 ETF', group: 'Index', kind: 'etf' },

  // --- Mega cap -----------------------------------------------------------
  { symbol: 'AAPL', name: 'Apple', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'META', name: 'Meta Platforms', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'AVGO', name: 'Broadcom', group: 'Mega Cap', kind: 'stock' },

  // --- Technology ---------------------------------------------------------
  { symbol: 'AMD', name: 'Advanced Micro Devices', group: 'Tech', kind: 'stock' },
  { symbol: 'NFLX', name: 'Netflix', group: 'Tech', kind: 'stock' },
  { symbol: 'CRM', name: 'Salesforce', group: 'Tech', kind: 'stock' },
  { symbol: 'ORCL', name: 'Oracle', group: 'Tech', kind: 'stock' },
  { symbol: 'ADBE', name: 'Adobe', group: 'Tech', kind: 'stock' },
  { symbol: 'INTC', name: 'Intel', group: 'Tech', kind: 'stock' },
  { symbol: 'QCOM', name: 'Qualcomm', group: 'Tech', kind: 'stock' },
  { symbol: 'TXN', name: 'Texas Instruments', group: 'Tech', kind: 'stock' },
  { symbol: 'MU', name: 'Micron Technology', group: 'Tech', kind: 'stock' },
  { symbol: 'CSCO', name: 'Cisco Systems', group: 'Tech', kind: 'stock' },
  { symbol: 'IBM', name: 'IBM', group: 'Tech', kind: 'stock' },
  { symbol: 'NOW', name: 'ServiceNow', group: 'Tech', kind: 'stock' },
  { symbol: 'PANW', name: 'Palo Alto Networks', group: 'Tech', kind: 'stock' },
  { symbol: 'ANET', name: 'Arista Networks', group: 'Tech', kind: 'stock' },
  { symbol: 'PLTR', name: 'Palantir', group: 'Tech', kind: 'stock' },
  { symbol: 'UBER', name: 'Uber', group: 'Tech', kind: 'stock' },

  // --- Financials ---------------------------------------------------------
  { symbol: 'JPM', name: 'JPMorgan Chase', group: 'Financials', kind: 'stock' },
  { symbol: 'BAC', name: 'Bank of America', group: 'Financials', kind: 'stock' },
  { symbol: 'GS', name: 'Goldman Sachs', group: 'Financials', kind: 'stock' },
  { symbol: 'MS', name: 'Morgan Stanley', group: 'Financials', kind: 'stock' },
  { symbol: 'WFC', name: 'Wells Fargo', group: 'Financials', kind: 'stock' },
  { symbol: 'C', name: 'Citigroup', group: 'Financials', kind: 'stock' },
  { symbol: 'SCHW', name: 'Charles Schwab', group: 'Financials', kind: 'stock' },
  { symbol: 'BLK', name: 'BlackRock', group: 'Financials', kind: 'stock' },
  { symbol: 'V', name: 'Visa', group: 'Financials', kind: 'stock' },
  { symbol: 'MA', name: 'Mastercard', group: 'Financials', kind: 'stock' },
  { symbol: 'AXP', name: 'American Express', group: 'Financials', kind: 'stock' },
  { symbol: 'PYPL', name: 'PayPal', group: 'Financials', kind: 'stock' },
  { symbol: 'COIN', name: 'Coinbase', group: 'Financials', kind: 'stock' },

  // --- Healthcare ---------------------------------------------------------
  { symbol: 'JNJ', name: 'Johnson & Johnson', group: 'Healthcare', kind: 'stock' },
  { symbol: 'UNH', name: 'UnitedHealth', group: 'Healthcare', kind: 'stock' },
  { symbol: 'LLY', name: 'Eli Lilly', group: 'Healthcare', kind: 'stock' },
  { symbol: 'PFE', name: 'Pfizer', group: 'Healthcare', kind: 'stock' },
  { symbol: 'MRK', name: 'Merck', group: 'Healthcare', kind: 'stock' },
  { symbol: 'ABBV', name: 'AbbVie', group: 'Healthcare', kind: 'stock' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific', group: 'Healthcare', kind: 'stock' },
  { symbol: 'ABT', name: 'Abbott Laboratories', group: 'Healthcare', kind: 'stock' },
  { symbol: 'AMGN', name: 'Amgen', group: 'Healthcare', kind: 'stock' },
  { symbol: 'GILD', name: 'Gilead Sciences', group: 'Healthcare', kind: 'stock' },

  // --- Consumer -----------------------------------------------------------
  { symbol: 'WMT', name: 'Walmart', group: 'Consumer', kind: 'stock' },
  { symbol: 'COST', name: 'Costco', group: 'Consumer', kind: 'stock' },
  { symbol: 'HD', name: 'Home Depot', group: 'Consumer', kind: 'stock' },
  { symbol: 'MCD', name: "McDonald's", group: 'Consumer', kind: 'stock' },
  { symbol: 'SBUX', name: 'Starbucks', group: 'Consumer', kind: 'stock' },
  { symbol: 'NKE', name: 'Nike', group: 'Consumer', kind: 'stock' },
  { symbol: 'TGT', name: 'Target', group: 'Consumer', kind: 'stock' },
  { symbol: 'PG', name: 'Procter & Gamble', group: 'Consumer', kind: 'stock' },
  { symbol: 'KO', name: 'Coca-Cola', group: 'Consumer', kind: 'stock' },
  { symbol: 'PEP', name: 'PepsiCo', group: 'Consumer', kind: 'stock' },
  { symbol: 'DIS', name: 'Walt Disney', group: 'Consumer', kind: 'stock' },

  // --- Industrials --------------------------------------------------------
  { symbol: 'BA', name: 'Boeing', group: 'Industrials', kind: 'stock' },
  { symbol: 'CAT', name: 'Caterpillar', group: 'Industrials', kind: 'stock' },
  { symbol: 'GE', name: 'GE Aerospace', group: 'Industrials', kind: 'stock' },
  { symbol: 'RTX', name: 'RTX Corporation', group: 'Industrials', kind: 'stock' },
  { symbol: 'LMT', name: 'Lockheed Martin', group: 'Industrials', kind: 'stock' },
  { symbol: 'UPS', name: 'United Parcel Service', group: 'Industrials', kind: 'stock' },
  { symbol: 'DE', name: 'Deere & Company', group: 'Industrials', kind: 'stock' },
  { symbol: 'F', name: 'Ford Motor', group: 'Industrials', kind: 'stock' },
  { symbol: 'GM', name: 'General Motors', group: 'Industrials', kind: 'stock' },

  // --- Energy -------------------------------------------------------------
  { symbol: 'XOM', name: 'Exxon Mobil', group: 'Energy', kind: 'stock' },
  { symbol: 'CVX', name: 'Chevron', group: 'Energy', kind: 'stock' },
  { symbol: 'COP', name: 'ConocoPhillips', group: 'Energy', kind: 'stock' },
  { symbol: 'SLB', name: 'SLB', group: 'Energy', kind: 'stock' },
  { symbol: 'OXY', name: 'Occidental Petroleum', group: 'Energy', kind: 'stock' },

  // --- Communications -----------------------------------------------------
  { symbol: 'T', name: 'AT&T', group: 'Communications', kind: 'stock' },
  { symbol: 'VZ', name: 'Verizon', group: 'Communications', kind: 'stock' },
  { symbol: 'CMCSA', name: 'Comcast', group: 'Communications', kind: 'stock' },

  // --- Macro proxies ------------------------------------------------------
  // Not screened as trade ideas — they are the inputs to the macro layer: TLT
  // prices long rates, HYG prices credit appetite. Marked `macro` so they stay
  // out of the leaderboard while still being synced.
  { symbol: 'TLT', name: '20+ Year Treasury Bond ETF', group: 'Macro', kind: 'macro' },
  { symbol: 'HYG', name: 'High Yield Corporate Bond ETF', group: 'Macro', kind: 'macro' },

  // --- Crypto -------------------------------------------------------------
  { symbol: 'BTC/USD', name: 'Bitcoin', group: 'Crypto', kind: 'crypto' },
  { symbol: 'ETH/USD', name: 'Ethereum', group: 'Crypto', kind: 'crypto' },
  { symbol: 'SOL/USD', name: 'Solana', group: 'Crypto', kind: 'crypto' },
  { symbol: 'XRP/USD', name: 'XRP', group: 'Crypto', kind: 'crypto' },
  { symbol: 'ADA/USD', name: 'Cardano', group: 'Crypto', kind: 'crypto' },
  { symbol: 'DOGE/USD', name: 'Dogecoin', group: 'Crypto', kind: 'crypto' },
  { symbol: 'AVAX/USD', name: 'Avalanche', group: 'Crypto', kind: 'crypto' },
  { symbol: 'LINK/USD', name: 'Chainlink', group: 'Crypto', kind: 'crypto' },
]
