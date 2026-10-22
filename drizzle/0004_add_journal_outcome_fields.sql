ALTER TABLE journal_trades ADD COLUMN exit REAL;
--> statement-breakpoint
ALTER TABLE journal_trades ADD COLUMN leverage REAL;
--> statement-breakpoint
ALTER TABLE journal_trades ADD COLUMN setup_type TEXT NOT NULL DEFAULT 'manual';
