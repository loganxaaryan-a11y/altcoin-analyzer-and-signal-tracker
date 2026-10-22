CREATE TABLE `theory_discovery_candidate_batches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `evidence_json` text NOT NULL,
  `source_status_json` text NOT NULL,
  `invalidated` integer DEFAULT 0 NOT NULL,
  `collection_summary` text NOT NULL,
  `synthesis_summary` text,
  `collected_at` integer NOT NULL,
  `processing_at` integer,
  `completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `theory_candidate_batches_status_id_idx` ON `theory_discovery_candidate_batches` (`status`,`id`);
