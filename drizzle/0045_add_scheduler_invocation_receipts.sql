CREATE TABLE `scheduler_invocation_receipts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_key` text NOT NULL,
  `job_name` text NOT NULL,
  `run_id` text NOT NULL,
  `status` text NOT NULL,
  `invoked_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduler_invocation_receipts_run_id_unique` ON `scheduler_invocation_receipts` (`run_id`);
--> statement-breakpoint
CREATE INDEX `scheduler_invocation_receipts_job_invoked_idx` ON `scheduler_invocation_receipts` (`job_key`, `invoked_at`);
