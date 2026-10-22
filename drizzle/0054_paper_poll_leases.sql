CREATE TABLE `paper_poll_leases` (
  `lane` text PRIMARY KEY NOT NULL,
  `owner_token` text,
  `generation` integer DEFAULT 0 NOT NULL,
  `lease_expires_at` integer,
  `rerun_requested` integer DEFAULT 0 NOT NULL,
  `coalesced_count` integer DEFAULT 0 NOT NULL,
  `last_started_at` integer,
  `last_completed_at` integer,
  `last_result_json` text,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `paper_poll_leases_expiry_idx` ON `paper_poll_leases` (`lease_expires_at`);
