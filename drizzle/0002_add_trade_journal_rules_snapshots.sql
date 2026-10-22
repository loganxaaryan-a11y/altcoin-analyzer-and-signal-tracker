DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE journal_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long','short')),
  entry REAL NOT NULL,
  stop REAL NOT NULL,
  target REAL,
  size REAL,
  status TEXT NOT NULL CHECK (status IN ('planned','open','closed')),
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE trading_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coin_id TEXT NOT NULL,
  price REAL,
  dex_liquidity REAL,
  dex_volume_24h REAL,
  dex_buys_24h INTEGER,
  dex_sells_24h INTEGER,
  captured_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX market_snapshots_coin_time_idx ON market_snapshots (coin_id, captured_at DESC);
