CREATE TABLE `historical_daily_bars` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `day` text NOT NULL,
  `ts` integer NOT NULL,
  `open` real,
  `high` real,
  `low` real,
  `close` real NOT NULL,
  `volume` real,
  `source` text NOT NULL,
  `fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_daily_bars_coin_day_unique` ON `historical_daily_bars` (`coin_id`,`day`);
--> statement-breakpoint
CREATE INDEX `historical_daily_bars_coin_ts_idx` ON `historical_daily_bars` (`coin_id`,`ts`);
--> statement-breakpoint
CREATE TABLE `historical_metrics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `metric` text NOT NULL,
  `ts` integer NOT NULL,
  `value` real NOT NULL,
  `source` text NOT NULL,
  `fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_metrics_coin_metric_ts_unique` ON `historical_metrics` (`coin_id`,`metric`,`ts`);
--> statement-breakpoint
CREATE TABLE `history_cache_state` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `source` text NOT NULL,
  `first_bar_ts` integer,
  `last_bar_ts` integer,
  `bar_count` integer DEFAULT 0 NOT NULL,
  `funding_count` integer DEFAULT 0 NOT NULL,
  `last_refresh_at` integer,
  `last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `history_cache_state_coin_unique` ON `history_cache_state` (`coin_id`);