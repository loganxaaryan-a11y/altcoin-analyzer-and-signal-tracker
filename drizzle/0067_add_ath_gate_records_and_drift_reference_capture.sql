CREATE TABLE `discovery_ath_gate_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `discovery_run_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `evaluated_at` integer NOT NULL,
  `ath_distance_pct` real,
  `ath_value` real,
  `ath_date` text,
  `ath_rule_fired` integer NOT NULL,
  `velocity_bypass_applied` integer NOT NULL,
  `disposition` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discovery_ath_gate_records_run_idx` ON `discovery_ath_gate_records` (`discovery_run_id`);
--> statement-breakpoint
CREATE INDEX `discovery_ath_gate_records_coin_idx` ON `discovery_ath_gate_records` (`coin_id`, `evaluated_at`);
--> statement-breakpoint
ALTER TABLE `paper_handoff_candidates` ADD COLUMN `drift_reference_capture_json` text;
--> statement-breakpoint
ALTER TABLE `paper_signal_candidates` ADD COLUMN `drift_reference_capture_json` text;
