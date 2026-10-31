CREATE TABLE `write_failure_captures` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `occurred_at` integer NOT NULL,
  `lane` text NOT NULL,
  `table_name` text NOT NULL,
  `statement_kind` text NOT NULL,
  `run_id` text,
  `attempted_key` text,
  `error_text` text NOT NULL,
  `error_kind` text NOT NULL,
  `context_json` text
);
--> statement-breakpoint
CREATE INDEX `write_failure_captures_lane_occurred_idx` ON `write_failure_captures` (`lane`, `occurred_at`);
