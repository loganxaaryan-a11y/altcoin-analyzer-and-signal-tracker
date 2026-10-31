CREATE TABLE `discovery_notification_dispositions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notification_id` integer NOT NULL,
	`discovery_run_id` integer,
	`disposition` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_notification_dispositions_notification_uidx` ON `discovery_notification_dispositions` (`notification_id`);
--> statement-breakpoint
CREATE INDEX `discovery_notification_dispositions_run_idx` ON `discovery_notification_dispositions` (`discovery_run_id`);
