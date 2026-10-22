ALTER TABLE `discovery_signals` ADD `confidence_tier` text NOT NULL DEFAULT 'low';
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `passed_dimensions` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `research_state` text NOT NULL DEFAULT 'research_required';
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `dimensions_json` text NOT NULL DEFAULT '[]';
