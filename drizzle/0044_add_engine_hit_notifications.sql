CREATE TABLE `engine_hit_notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `engine_hit_id` integer NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `engine_hit_notifications_status_created_idx` ON `engine_hit_notifications` (`status`, `created_at`);
