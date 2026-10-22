CREATE TABLE `paper_issuance_work_checks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `handoff_run_id` integer,
  `discovery_run_id` integer,
  `trigger` text NOT NULL,
  `decision` text NOT NULL,
  `result_status` text NOT NULL,
  `prior_run_id` integer,
  `prior_run_status` text,
  `intake_total` integer DEFAULT 0 NOT NULL,
  `intake_terminal` integer DEFAULT 0 NOT NULL,
  `intake_pending` integer DEFAULT 0 NOT NULL,
  `resulting_run_id` integer,
  `reason` text NOT NULL,
  `checked_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `paper_issuance_work_checks_checked_idx` ON `paper_issuance_work_checks` (`checked_at`);
--> statement-breakpoint
CREATE INDEX `paper_issuance_work_checks_handoff_idx` ON `paper_issuance_work_checks` (`handoff_run_id`, `checked_at`);
