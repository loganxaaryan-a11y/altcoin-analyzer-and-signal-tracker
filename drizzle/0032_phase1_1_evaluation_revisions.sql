ALTER TABLE `signal_contracts` ADD `issuance_claim` text;
--> statement-breakpoint
ALTER TABLE `signal_contracts` ADD `evaluator_version` text;
--> statement-breakpoint
CREATE TABLE `signal_evaluation_revisions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signal_id` text NOT NULL,
  `legacy_signal_id` integer,
  `method_version` text NOT NULL,
  `product` text NOT NULL,
  `horizon` integer NOT NULL,
  `horizon_unit` text NOT NULL,
  `revision` integer NOT NULL,
  `predecessor_revision_id` integer,
  `evidence_hash` text NOT NULL,
  `verdict` text NOT NULL,
  `status` text NOT NULL,
  `reason` text NOT NULL,
  `evidence_json` text NOT NULL,
  `cost_model_json` text NOT NULL,
  `gross_return_pct` real,
  `net_return_pct` real,
  `gross_r` real,
  `net_r` real,
  `evaluated_at` integer NOT NULL,
  `matures_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`predecessor_revision_id`) REFERENCES `signal_evaluation_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_evaluation_revisions_evidence_uidx` ON `signal_evaluation_revisions` (`signal_id`,`method_version`,`product`,`horizon`,`evidence_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_evaluation_revisions_sequence_uidx` ON `signal_evaluation_revisions` (`signal_id`,`method_version`,`product`,`horizon`,`revision`);
--> statement-breakpoint
CREATE INDEX `signal_evaluation_revisions_current_idx` ON `signal_evaluation_revisions` (`method_version`,`product`,`horizon`,`signal_id`,`revision`);
