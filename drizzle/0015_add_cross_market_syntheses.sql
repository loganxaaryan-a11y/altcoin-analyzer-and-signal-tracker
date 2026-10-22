CREATE TABLE `market_syntheses` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `status` text NOT NULL,
  `direction` text NOT NULL,
  `headline` text NOT NULL,
  `summary` text NOT NULL,
  `claims_json` text NOT NULL,
  `evidence_json` text NOT NULL,
  `category_marks_json` text NOT NULL,
  `source_status_json` text NOT NULL,
  `candidate_count` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `market_syntheses_created_at_idx` ON `market_syntheses` (`created_at`);