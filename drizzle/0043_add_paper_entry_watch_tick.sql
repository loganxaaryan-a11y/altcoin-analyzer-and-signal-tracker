ALTER TABLE `paper_signal_candidates` ADD COLUMN `decision_reference_price` real;
--> statement-breakpoint
ALTER TABLE `paper_alert_events` ADD COLUMN `contract_id` text;
--> statement-breakpoint
ALTER TABLE `paper_alert_events` ADD COLUMN `event_type` text;
--> statement-breakpoint
ALTER TABLE `paper_alert_events` ADD COLUMN `event_version` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_alert_events_contract_type_version_uidx` ON `paper_alert_events` (`contract_id`, `event_type`, `event_version`);
--> statement-breakpoint
CREATE TABLE `paper_entry_watch_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_key` text NOT NULL,
  `status` text NOT NULL,
  `examined_count` integer NOT NULL DEFAULT 0,
  `issued_count` integer NOT NULL DEFAULT 0,
  `pending_count` integer NOT NULL DEFAULT 0,
  `terminal_count` integer NOT NULL DEFAULT 0,
  `error_count` integer NOT NULL DEFAULT 0,
  `summary` text NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_entry_watch_runs_run_key_uidx` ON `paper_entry_watch_runs` (`run_key`);
--> statement-breakpoint
CREATE INDEX `paper_entry_watch_runs_started_at_idx` ON `paper_entry_watch_runs` (`started_at`);