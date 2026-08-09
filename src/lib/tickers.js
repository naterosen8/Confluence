// `kind` gates analysis that only makes sense for operating companies:
// balance-sheet valuation is meaningless for an ETF (its NAV is definitionally
// its holdings) and undefined for a raw crypto pair (no issuer, no filings).
export const TICKERS = [
  { symbol: 'SPY', name: 'S&P 500 ETF', group: 'Index', kind: 'etf' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', group: 'Index', kind: 'etf' },
  { symbol: 'DIA', name: 'Dow Jones ETF', group: 'Index', kind: 'etf' },
  { symbol: 'IWM', name: 'Russell 2000 ETF', group: 'Index', kind: 'etf' },
  { symbol: 'AAPL', name: 'Apple', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'META', name: 'Meta Platforms', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', group: 'Mega Cap', kind: 'stock' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', group: 'Tech', kind: 'stock' },
  { symbol: 'NFLX', name: 'Netflix', group: 'Tech', kind: 'stock' },
  { symbol: 'CRM', name: 'Salesforce', group: 'Tech', kind: 'stock' },
  { symbol: 'JPM', name: 'JPMorgan Chase', group: 'Financials', kind: 'stock' },
  { symbol: 'BAC', name: 'Bank of America', group: 'Financials', kind: 'stock' },
  { symbol: 'XOM', name: 'Exxon Mobil', group: 'Energy', kind: 'stock' },
  { symbol: 'CVX', name: 'Chevron', group: 'Energy', kind: 'stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', group: 'Healthcare', kind: 'stock' },
  { symbol: 'UNH', name: 'UnitedHealth', group: 'Healthcare', kind: 'stock' },
  { symbol: 'BTC/USD', name: 'Bitcoin', group: 'Crypto', kind: 'crypto' },
  { symbol: 'ETH/USD', name: 'Ethereum', group: 'Crypto', kind: 'crypto' },
]
