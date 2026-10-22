ALTER TABLE `market_discovery_runs` ADD `lease_id` text;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD `deadline_at` integer;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD `last_checkpoint_stage` text;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD `last_heartbeat_at` integer;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD `tier_lane_status` text;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD `velocity_lane_status` text;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD `stage_durations_json` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD `dependency_validation_json` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `universe_tier_runs` ADD `superseded_by_run_id` integer;
--> statement-breakpoint
CREATE INDEX `market_discovery_runs_status_deadline_idx` ON `market_discovery_runs` (`status`, `deadline_at`);
--> statement-breakpoint
CREATE INDEX `universe_tier_runs_superseded_idx` ON `universe_tier_runs` (`superseded_by_run_id`);
--> statement-breakpoint
CREATE TABLE `market_discovery_checkpoints` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `lease_id` text NOT NULL,
  `stage` text NOT NULL,
  `completed_at` integer NOT NULL,
  `duration_ms` integer NOT NULL,
  `counts_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_discovery_checkpoints_run_stage_uidx` ON `market_discovery_checkpoints` (`run_id`, `stage`);
