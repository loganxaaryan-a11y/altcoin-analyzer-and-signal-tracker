CREATE TABLE `measurement_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` text NOT NULL,
  `terminal` text NOT NULL,
  `cohort` text NOT NULL,
  `evaluator_version` text NOT NULL,
  `source_commit` text NOT NULL,
  `status` text NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `last_successful_complete_at` integer,
  `cursor` integer NOT NULL DEFAULT 0,
  `batch_size` integer NOT NULL,
  `signals_in_scope` integer NOT NULL,
  `retrieved` integer NOT NULL DEFAULT 0,
  `eligible_due` integer NOT NULL DEFAULT 0,
  `evaluated` integer NOT NULL DEFAULT 0,
  `pending` integer NOT NULL DEFAULT 0,
  `ambiguous` integer NOT NULL DEFAULT 0,
  `unverified` integer NOT NULL DEFAULT 0,
  `excluded` integer NOT NULL DEFAULT 0,
  `failed` integer NOT NULL DEFAULT 0,
  `snapshot_json` text NOT NULL,
  `definitions_json` text NOT NULL,
  `failed_ids_json` text NOT NULL DEFAULT '[]',
  `retry_pending` integer NOT NULL DEFAULT 0,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_runs_run_id_unique` ON `measurement_runs` (`run_id`);
--> statement-breakpoint
CREATE INDEX `measurement_runs_status_started_idx` ON `measurement_runs` (`status`,`started_at`);
--> statement-breakpoint
CREATE TABLE `measurement_run_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` text NOT NULL,
  `signal_id` text NOT NULL,
  `legacy_signal_id` integer,
  `status` text NOT NULL,
  `reason` text NOT NULL,
  `sources_json` text NOT NULL,
  `attempt_count` integer NOT NULL DEFAULT 1,
  `evaluated_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_run_items_run_signal_unique` ON `measurement_run_items` (`run_id`,`signal_id`);
--> statement-breakpoint
CREATE INDEX `measurement_run_items_run_status_idx` ON `measurement_run_items` (`run_id`,`status`);