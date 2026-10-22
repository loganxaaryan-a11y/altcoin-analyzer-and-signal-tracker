ALTER TABLE theory_discovery_candidate_batches ADD COLUMN consumed_theory_id INTEGER;
--> statement-breakpoint
ALTER TABLE theory_discovery_candidate_batches ADD COLUMN consume_attempts INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE theory_discovery_candidate_batches ADD COLUMN last_consume_attempt_at INTEGER;
