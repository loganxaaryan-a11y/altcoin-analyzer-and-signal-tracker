ALTER TABLE `discovery_signals` ADD `invalidation_level` real;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `source_as_of` integer;
--> statement-breakpoint
ALTER TABLE `generated_signals` ADD `factors_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `generated_signals` ADD `source_as_of` integer;
