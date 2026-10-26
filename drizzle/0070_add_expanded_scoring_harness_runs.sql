CREATE TABLE `expanded_scoring_harness_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_key` text NOT NULL,
  `status` text NOT NULL,
  `requested_count` integer DEFAULT 0 NOT NULL,
  `present_count` integer DEFAULT 0 NOT NULL,
  `evaluated_count` integer DEFAULT 0 NOT NULL,
  `not_evaluated_count` integer DEFAULT 0 NOT NULL,
  `scoring_ms` integer DEFAULT 0 NOT NULL,
  `velocity_ms` integer DEFAULT 0 NOT NULL,
  `evidence_load_ms` integer DEFAULT 0 NOT NULL,
  `over_budget` integer DEFAULT 0 NOT NULL,
  `duplicate_scoring_detected` integer DEFAULT 0 NOT NULL,
  `guard_attempts` integer DEFAULT 0 NOT NULL,
  `writes_proof_json` text NOT NULL,
  `report_json` text NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expanded_scoring_harness_runs_run_key_uidx` ON `expanded_scoring_harness_runs` (`run_key`);
--> statement-breakpoint
CREATE INDEX `expanded_scoring_harness_runs_created_idx` ON `expanded_scoring_harness_runs` (`created_at`);
