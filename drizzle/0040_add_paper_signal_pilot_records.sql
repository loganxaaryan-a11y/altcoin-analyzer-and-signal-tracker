CREATE TABLE `paper_signal_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_key` text NOT NULL,
  `trigger` text NOT NULL,
  `status` text NOT NULL,
  `freeze_version` text NOT NULL,
  `freeze_hash` text NOT NULL,
  `discovery_run_id` integer,
  `candidate_count` integer NOT NULL DEFAULT 0,
  `issued_count` integer NOT NULL DEFAULT 0,
  `abstained_count` integer NOT NULL DEFAULT 0,
  `deferred_count` integer NOT NULL DEFAULT 0,
  `summary` text NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_signal_runs_run_key_uidx` ON `paper_signal_runs` (`run_key`);
--> statement-breakpoint
CREATE TABLE `paper_signal_candidates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `candidate_key` text NOT NULL,
  `run_id` integer NOT NULL,
  `discovery_signal_id` integer NOT NULL,
  `discovery_run_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `name` text NOT NULL,
  `symbol` text NOT NULL,
  `venue` text NOT NULL,
  `instrument` text NOT NULL,
  `direction` text NOT NULL,
  `state` text NOT NULL,
  `reason_code` text,
  `reason` text,
  `decision_at` integer NOT NULL,
  `source_observed_at` integer,
  `entry_observed_at` integer,
  `entry_received_at` integer,
  `entry_expires_at` integer NOT NULL,
  `entry_price` real,
  `stop_price` real NOT NULL,
  `target_price` real,
  `permitted_drift_bps` real NOT NULL,
  `production_score` real,
  `challenger_score` real,
  `factor_ledger_json` text NOT NULL,
  `operational_evidence_json` text NOT NULL,
  `freeze_version` text NOT NULL,
  `production_hash` text NOT NULL,
  `challenger_hash` text NOT NULL,
  `invocation_claim` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_signal_candidates_candidate_key_uidx` ON `paper_signal_candidates` (`candidate_key`);
--> statement-breakpoint
CREATE INDEX `paper_signal_candidates_state_updated_idx` ON `paper_signal_candidates` (`state`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `paper_signals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `paper_signal_id` text NOT NULL,
  `candidate_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `venue` text NOT NULL,
  `instrument` text NOT NULL,
  `direction` text NOT NULL,
  `entry_price` real NOT NULL,
  `stop_price` real NOT NULL,
  `target_price` real NOT NULL,
  `decision_at` integer NOT NULL,
  `entry_at` integer NOT NULL,
  `issued_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `contract_version` text NOT NULL,
  `evaluator_version` text NOT NULL,
  `evidence_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_signals_signal_id_uidx` ON `paper_signals` (`paper_signal_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_signals_candidate_id_uidx` ON `paper_signals` (`candidate_id`);
--> statement-breakpoint
CREATE TABLE `paper_alert_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `event_key` text NOT NULL,
  `paper_signal_id` text NOT NULL,
  `status` text NOT NULL,
  `transport` text NOT NULL,
  `destination_label` text,
  `payload_json` text NOT NULL,
  `enqueued_at` integer NOT NULL,
  `acknowledged_at` integer,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_alert_events_event_key_uidx` ON `paper_alert_events` (`event_key`);
--> statement-breakpoint
CREATE INDEX `paper_alert_events_status_updated_idx` ON `paper_alert_events` (`status`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `paper_model_comparisons` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `row_key` text NOT NULL,
  `candidate_id` integer NOT NULL,
  `cohort` text NOT NULL,
  `eligibility` text NOT NULL,
  `production_decision` text NOT NULL,
  `challenger_decision` text NOT NULL,
  `production_score` real,
  `challenger_score` real,
  `decision_at` integer NOT NULL,
  `input_verified` integer NOT NULL DEFAULT 0,
  `unknown_reason` text,
  `outcome_status` text NOT NULL DEFAULT 'pending',
  `outcome_json` text,
  `freeze_version` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_model_comparisons_row_key_uidx` ON `paper_model_comparisons` (`row_key`);
--> statement-breakpoint
CREATE INDEX `paper_model_comparisons_cohort_created_idx` ON `paper_model_comparisons` (`cohort`, `created_at`);