CREATE TABLE `engine_hits` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `engine_key` text NOT NULL,
  `theory_watch_id` integer NOT NULL,
  `thesis` text NOT NULL,
  `triggering_event` text NOT NULL,
  `evidence_json` text NOT NULL,
  `engine_score` integer NOT NULL,
  `score_basis` text NOT NULL,
  `tape_state` text NOT NULL,
  `ripple_chain_json` text NOT NULL,
  `event_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engine_hits_engine_key_unique` ON `engine_hits` (`engine_key`);
--> statement-breakpoint
CREATE INDEX `engine_hits_event_at_idx` ON `engine_hits` (`event_at` DESC);
