CREATE TABLE `paper_handoff_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `handoff_key` text NOT NULL,
  `discovery_run_id` integer NOT NULL,
  `status` text NOT NULL,
  `discovered_count` integer NOT NULL DEFAULT 0,
  `scored_count` integer NOT NULL DEFAULT 0,
  `directional_count` integer NOT NULL DEFAULT 0,
  `eligible_count` integer NOT NULL DEFAULT 0,
  `rejected_count` integer NOT NULL DEFAULT 0,
  `reason_counts_json` text NOT NULL,
  `source_accounting_json` text NOT NULL,
  `handler_version` text NOT NULL,
  `source_hashes_json` text NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_handoff_runs_handoff_key_uidx` ON `paper_handoff_runs` (`handoff_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_handoff_runs_discovery_run_uidx` ON `paper_handoff_runs` (`discovery_run_id`);
--> statement-breakpoint
CREATE INDEX `paper_handoff_runs_status_completed_idx` ON `paper_handoff_runs` (`status`, `completed_at`);
--> statement-breakpoint
CREATE TABLE `paper_handoff_candidates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `handoff_run_id` integer NOT NULL,
  `discovery_run_id` integer NOT NULL,
  `discovery_signal_id` integer,
  `candidate_key` text NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `direction` text NOT NULL,
  `stage` text NOT NULL,
  `outcome` text NOT NULL,
  `reason_code` text NOT NULL,
  `reason` text NOT NULL,
  `pre_legacy_filter` integer NOT NULL DEFAULT 1,
  `factor_ledger_json` text NOT NULL,
  `decision_evidence_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_handoff_candidates_candidate_key_uidx` ON `paper_handoff_candidates` (`candidate_key`);
--> statement-breakpoint
CREATE INDEX `paper_handoff_candidates_run_outcome_idx` ON `paper_handoff_candidates` (`handoff_run_id`, `outcome`);
--> statement-breakpoint
CREATE TABLE `paper_entry_checkpoints` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `candidate_id` integer NOT NULL,
  `contract_state` text NOT NULL,
  `first_venue_trade_id` text,
  `first_venue_seq` integer,
  `first_print_observed_at` integer,
  `first_print_price` real,
  `request_since_at` integer NOT NULL,
  `request_until_at` integer NOT NULL,
  `receipt_at` integer,
  `raw_response_hash` text,
  `coverage_json` text NOT NULL,
  `checkpoint_json` text NOT NULL,
  `updated_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_entry_checkpoints_candidate_uidx` ON `paper_entry_checkpoints` (`candidate_id`);
--> statement-breakpoint
CREATE INDEX `paper_entry_checkpoints_state_updated_idx` ON `paper_entry_checkpoints` (`contract_state`, `updated_at`);