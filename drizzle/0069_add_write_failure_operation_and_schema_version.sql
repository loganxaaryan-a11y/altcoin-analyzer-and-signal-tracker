ALTER TABLE `write_failure_captures` ADD COLUMN `operation` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE `write_failure_captures` ADD COLUMN `schema_version` text DEFAULT '0068' NOT NULL;
