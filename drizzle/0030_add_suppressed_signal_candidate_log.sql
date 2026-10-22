CREATE TABLE `suppressed_signal_candidates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `coin_id` text NOT NULL,
  `name` text NOT NULL,
  `symbol` text NOT NULL,
  `direction` text NOT NULL,
  `source` text NOT NULL,
  `reason` text NOT NULL,
  `signal_day` text NOT NULL,
  `entry` real,
  `invalidation` real,
  `target_1` real,
  `target_2` real,
  `candle_open` real,
  `candle_high` real,
  `candle_low` real,
  `candle_close` real,
  `candle_source` text,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppressed_signal_candidates_day_coin_direction_reason_uidx` ON `suppressed_signal_candidates` (`signal_day`,`coin_id`,`direction`,`reason`);
--> statement-breakpoint
CREATE INDEX `suppressed_signal_candidates_created_at_idx` ON `suppressed_signal_candidates` (`created_at`);
