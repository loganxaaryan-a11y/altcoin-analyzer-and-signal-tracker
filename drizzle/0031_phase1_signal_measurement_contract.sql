CREATE TABLE `signal_input_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `snapshot_hash` text NOT NULL,
  `snapshot_version` text NOT NULL,
  `asset_id` text NOT NULL,
  `provider_metadata_json` text NOT NULL,
  `payload_json` text NOT NULL,
  `captured_at` integer NOT NULL,
  `available_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_input_snapshots_hash_uidx` ON `signal_input_snapshots` (`snapshot_hash`);
--> statement-breakpoint
CREATE INDEX `signal_input_snapshots_asset_time_idx` ON `signal_input_snapshots` (`asset_id`,`captured_at`);
--> statement-breakpoint
CREATE TABLE `signal_contracts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signal_id` text NOT NULL,
  `legacy_signal_id` integer,
  `amends_signal_id` text,
  `idempotency_key` text NOT NULL,
  `asset_id` text NOT NULL,
  `symbol` text NOT NULL,
  `venue` text NOT NULL,
  `instrument_type` text NOT NULL,
  `exchange_calendar` text NOT NULL,
  `direction` text NOT NULL,
  `strategy_id` text NOT NULL,
  `strategy_version` text NOT NULL,
  `parameter_hash` text NOT NULL,
  `build_id` text NOT NULL,
  `decision_at` integer NOT NULL,
  `available_at` integer NOT NULL,
  `issued_at` integer NOT NULL,
  `entry_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `input_snapshot_id` integer NOT NULL,
  `bar_start` integer NOT NULL,
  `bar_end` integer NOT NULL,
  `bar_is_closed` integer NOT NULL,
  `price_basis` text NOT NULL,
  `entry_rule` text NOT NULL,
  `entry_price` real NOT NULL,
  `stop_price` real NOT NULL,
  `target_price` real NOT NULL,
  `risk_per_unit` real NOT NULL,
  `primary_horizon` integer NOT NULL,
  `horizon_unit` text NOT NULL,
  `feature_values_json` text NOT NULL,
  `gate_results_json` text NOT NULL,
  `setup_score` real NOT NULL,
  `score_definition` text NOT NULL,
  `data_coverage_json` text NOT NULL,
  `validation_status` text NOT NULL,
  `levels_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_contracts_signal_id_uidx` ON `signal_contracts` (`signal_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_contracts_idempotency_uidx` ON `signal_contracts` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_contracts_legacy_signal_uidx` ON `signal_contracts` (`legacy_signal_id`);
--> statement-breakpoint
CREATE INDEX `signal_contracts_asset_issued_idx` ON `signal_contracts` (`asset_id`,`issued_at`);
--> statement-breakpoint
CREATE TABLE `signal_outcome_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signal_id` text NOT NULL,
  `event_type` text NOT NULL,
  `method_version` text NOT NULL,
  `outcome` text NOT NULL,
  `observed_at` integer NOT NULL,
  `exit_at` integer,
  `exit_price` real,
  `gross_return_pct` real,
  `net_return_pct` real,
  `gross_r` real,
  `net_r` real,
  `evidence_snapshot_id` integer,
  `reason` text NOT NULL,
  `uncertainty_json` text NOT NULL,
  `previous_event_id` integer,
  `event_hash` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_outcome_events_hash_uidx` ON `signal_outcome_events` (`event_hash`);
--> statement-breakpoint
CREATE INDEX `signal_outcome_events_signal_time_idx` ON `signal_outcome_events` (`signal_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `signal_evaluations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signal_id` text NOT NULL,
  `legacy_signal_id` integer,
  `method_version` text NOT NULL,
  `product` text NOT NULL,
  `horizon` integer NOT NULL,
  `horizon_unit` text NOT NULL,
  `old_verdict` text,
  `new_verdict` text NOT NULL,
  `status` text NOT NULL,
  `reason` text NOT NULL,
  `evidence_json` text NOT NULL,
  `gross_return_pct` real,
  `net_return_pct` real,
  `gross_r` real,
  `net_r` real,
  `evaluated_at` integer NOT NULL,
  `matures_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_evaluations_signal_method_product_horizon_uidx` ON `signal_evaluations` (`signal_id`,`method_version`,`product`,`horizon`);
--> statement-breakpoint
CREATE INDEX `signal_evaluations_method_status_idx` ON `signal_evaluations` (`method_version`,`status`);
--> statement-breakpoint
CREATE TABLE `strategy_trials` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `trial_id` text NOT NULL,
  `strategy_id` text NOT NULL,
  `strategy_version` text NOT NULL,
  `parameter_hash` text NOT NULL,
  `build_id` text NOT NULL,
  `status` text NOT NULL,
  `hypothesis` text NOT NULL,
  `spec_json` text NOT NULL,
  `result_json` text,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strategy_trials_trial_id_uidx` ON `strategy_trials` (`trial_id`);
--> statement-breakpoint
CREATE TABLE `scan_operations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `scan_key` text NOT NULL,
  `strategy_id` text NOT NULL,
  `strategy_version` text NOT NULL,
  `status` text NOT NULL,
  `requested_count` integer NOT NULL,
  `fetched_count` integer NOT NULL,
  `eligible_count` integer NOT NULL,
  `scored_count` integer NOT NULL,
  `watched_count` integer NOT NULL,
  `issued_count` integer NOT NULL,
  `suppressed_count` integer NOT NULL,
  `reason_counts_json` text NOT NULL,
  `last_attempt_at` integer NOT NULL,
  `last_success_at` integer,
  `checkpoint_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_operations_scan_key_uidx` ON `scan_operations` (`scan_key`);
--> statement-breakpoint
CREATE INDEX `scan_operations_strategy_time_idx` ON `scan_operations` (`strategy_id`,`last_attempt_at`);