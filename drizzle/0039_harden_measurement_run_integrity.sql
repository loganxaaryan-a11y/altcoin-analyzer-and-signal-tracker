ALTER TABLE `measurement_runs` ADD `evaluation_cutoff_at` integer;
--> statement-breakpoint
ALTER TABLE `measurement_runs` ADD `lease_token` text;
--> statement-breakpoint
ALTER TABLE `measurement_runs` ADD `lease_expires_at` integer;
--> statement-breakpoint
ALTER TABLE `measurement_runs` ADD `checkpoint_version` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `measurement_run_items` ADD `membership_ordinal` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_run_items_run_ordinal_unique` ON `measurement_run_items` (`run_id`,`membership_ordinal`);