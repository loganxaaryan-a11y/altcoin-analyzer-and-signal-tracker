ALTER TABLE `discovery_signals` ADD `discovery_tier` text DEFAULT 'tier1' NOT NULL;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `trigger_reasons_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `discovery_state` (
  `key` text PRIMARY KEY NOT NULL,
  `value_json` text NOT NULL,
  `updated_at` integer NOT NULL
);
