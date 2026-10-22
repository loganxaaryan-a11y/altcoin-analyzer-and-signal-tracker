ALTER TABLE `measurement_run_items` ADD `trade_state` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE `measurement_run_items` ADD `trade_state_reason` text DEFAULT 'Trade state has not been evaluated.' NOT NULL;
