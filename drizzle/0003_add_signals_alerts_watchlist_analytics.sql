CREATE TABLE watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coin_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE generated_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coin_id TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  confidence REAL NOT NULL,
  setup_type TEXT NOT NULL,
  entry REAL NOT NULL,
  invalidation REAL NOT NULL,
  target1 REAL NOT NULL,
  target2 REAL NOT NULL,
  funding REAL,
  oi_usd REAL,
  oi_change REAL,
  outcome_5 TEXT,
  outcome_14 TEXT,
  outcome_30 TEXT,
  return_5 REAL,
  return_14 REAL,
  return_30 REAL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX signals_coin_time_idx ON generated_signals (coin_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coin_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('entry','funding','oi','whale','unlock')),
  threshold REAL,
  wallet TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE alert_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  coin_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
