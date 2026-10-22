CREATE TABLE `discovery_funnel_counts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `run_kind` text NOT NULL,
  `stage` text NOT NULL,
  `gate` text,
  `reason_code` text NOT NULL,
  `count` integer NOT NULL,
  `computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discovery_funnel_counts_run_idx` ON `discovery_funnel_counts` (`run_kind`, `run_id`);
--> statement-breakpoint
CREATE INDEX `discovery_funnel_counts_computed_idx` ON `discovery_funnel_counts` (`computed_at`);
