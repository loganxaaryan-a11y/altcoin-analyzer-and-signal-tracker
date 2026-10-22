ALTER TABLE `paper_alert_events` ADD COLUMN `read_at` integer;
--> statement-breakpoint
ALTER TABLE `paper_alert_events` ADD COLUMN `chat_sent_at` integer;
--> statement-breakpoint
ALTER TABLE `paper_alert_events` ADD COLUMN `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `discovery_informational_notifications` ADD COLUMN `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `discovery_informational_notifications` ADD COLUMN `chat_sent_at` integer;
--> statement-breakpoint
ALTER TABLE `engine_hit_notifications` ADD COLUMN `chat_sent_at` integer;
