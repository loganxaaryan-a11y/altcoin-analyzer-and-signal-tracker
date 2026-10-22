CREATE TABLE `asset_research_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `canonical_key` text NOT NULL,
  `origin_kind` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `source_url` text,
  `source_publisher` text NOT NULL,
  `evidence_class` text NOT NULL,
  `observed_at` integer NOT NULL,
  `captured_at` integer NOT NULL,
  `source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_research_records_canonical_uidx` ON `asset_research_records` (`canonical_key`);
--> statement-breakpoint
CREATE INDEX `asset_research_records_observed_idx` ON `asset_research_records` (`observed_at`);