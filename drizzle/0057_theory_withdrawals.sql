CREATE TABLE `theory_withdrawals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `theory_id` integer NOT NULL,
  `reason` text NOT NULL,
  `evidence_json` text NOT NULL,
  `withdrawn_at` integer NOT NULL,
  `withdrawn_by` text NOT NULL,
  `idempotency_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `theory_withdrawals_idempotency_uidx` ON `theory_withdrawals` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `theory_withdrawals_theory_idx` ON `theory_withdrawals` (`theory_id`);