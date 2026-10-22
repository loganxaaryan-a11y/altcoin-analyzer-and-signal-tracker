CREATE TABLE `theory_watch` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `machine_key` text NOT NULL UNIQUE,
  `sector` text NOT NULL,
  `mode` text NOT NULL,
  `direction` text NOT NULL,
  `status` text NOT NULL,
  `confidence` text NOT NULL,
  `headline` text NOT NULL,
  `thesis` text NOT NULL,
  `forward_look` text NOT NULL,
  `countercase` text NOT NULL,
  `invalidation` text NOT NULL,
  `linked_symbol` text NOT NULL,
  `layers_json` text NOT NULL,
  `sources_json` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `invalidation_reason` text,
  `created_at` integer NOT NULL,
  `last_checked_at` integer NOT NULL,
  `invalidated_at` integer
);
--> statement-breakpoint
CREATE TABLE `theory_discovery_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `status` text NOT NULL,
  `summary` text NOT NULL,
  `source_status_json` text NOT NULL,
  `discovered` integer NOT NULL DEFAULT 0,
  `contested` integer NOT NULL DEFAULT 0,
  `invalidated` integer NOT NULL DEFAULT 0,
  `started_at` integer NOT NULL,
  `completed_at` integer NOT NULL
);
