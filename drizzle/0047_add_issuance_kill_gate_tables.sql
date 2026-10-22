CREATE TABLE IF NOT EXISTS issuance_band_states (
  band         TEXT PRIMARY KEY,
  state        TEXT NOT NULL CHECK (state IN ('WARNING','ISSUANCE_DISABLED')),
  reason       TEXT NOT NULL,
  expectancy_r REAL,
  sample_size  INTEGER,
  set_by       TEXT NOT NULL,
  set_at       TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS issuance_band_revisions (
  band     TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS issuance_band_state_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  band         TEXT NOT NULL,
  from_state   TEXT,
  to_state     TEXT NOT NULL CHECK (to_state IN ('NORMAL','WARNING','ISSUANCE_DISABLED')),
  reason       TEXT NOT NULL,
  expectancy_r REAL,
  sample_size  INTEGER,
  set_by       TEXT NOT NULL,
  set_at       TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_band_state_history_band ON issuance_band_state_history(band, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS issuance_gate_audits (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  path           TEXT NOT NULL CHECK (path IN ('manual','dossier','scheduled')),
  score          REAL NOT NULL,
  band           TEXT NOT NULL,
  band_state     TEXT NOT NULL CHECK (band_state IN ('NORMAL','WARNING','ISSUANCE_DISABLED')),
  decision       TEXT NOT NULL CHECK (decision IN ('allowed','blocked','warning_allowed')),
  reason         TEXT NOT NULL,
  is_test        INTEGER NOT NULL DEFAULT 0,
  signal_identity TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gate_audits_band ON issuance_gate_audits(band, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gate_audits_decision ON issuance_gate_audits(decision, created_at);