CREATE TABLE `signal_interim_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signal_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `captured_day` text NOT NULL,
  `current_price` real NOT NULL,
  `return_pct` real NOT NULL,
  `distance_target1_pct` real NOT NULL,
  `distance_invalidation_pct` real NOT NULL,
  `days_since_entry` integer NOT NULL,
  `captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_interim_snapshots_signal_day_unique` ON `signal_interim_snapshots` (`signal_id`,`captured_day`);
--> statement-breakpoint
CREATE INDEX `signal_interim_snapshots_signal_idx` ON `signal_interim_snapshots` (`signal_id`);
--> statement-breakpoint
CREATE TABLE `signal_daily_briefs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `captured_day` text NOT NULL,
  `summary` text NOT NULL,
  `tracked_count` integer NOT NULL,
  `approaching_target_count` integer NOT NULL,
  `approaching_invalidation_count` integer NOT NULL,
  `source_as_of` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_daily_briefs_day_unique` ON `signal_daily_briefs` (`captured_day`);