CREATE TABLE `catalog_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `fetched_at` integer NOT NULL,
  `row_count` integer NOT NULL,
  `catalog_version` text NOT NULL,
  `rows_json` text NOT NULL,
  `source_status` text
);
--> statement-breakpoint
CREATE INDEX `catalog_snapshots_fetched_idx` ON `catalog_snapshots` (`fetched_at`);
--> statement-breakpoint
ALTER TABLE `universe_tiers` ADD `chart_source` text;
--> statement-breakpoint
ALTER TABLE `universe_tiers` ADD `chart_age_h` real;
