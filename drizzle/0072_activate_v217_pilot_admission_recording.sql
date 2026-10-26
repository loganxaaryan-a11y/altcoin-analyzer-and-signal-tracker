ALTER TABLE `market_discovery_runs` ADD COLUMN `admission_version` text;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD COLUMN `pilot_universe_json` text;
--> statement-breakpoint
ALTER TABLE `market_discovery_runs` ADD COLUMN `pilot_lane_status` text;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD COLUMN `admission_lane` text DEFAULT 'legacy';
