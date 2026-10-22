CREATE TABLE `api_credit_budgets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider` text NOT NULL,
  `scope` text NOT NULL,
  `budget_day` text NOT NULL,
  `credits_used` integer DEFAULT 0 NOT NULL,
  `last_reservation_id` text NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_credit_budgets_provider_scope_day_uidx` ON `api_credit_budgets` (`provider`,`scope`,`budget_day`);
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `discovery_lane` text DEFAULT 'main' NOT NULL;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `social_snapshot_json` text;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `meme_validation_json` text;