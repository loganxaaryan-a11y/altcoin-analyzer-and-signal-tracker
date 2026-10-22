ALTER TABLE `market_data_observations` ADD `interval_start_at` integer;
--> statement-breakpoint
ALTER TABLE `market_data_observations` ADD `interval_end_at` integer;
--> statement-breakpoint
ALTER TABLE `market_data_observations` ADD `provider_updated_at` integer;
--> statement-breakpoint
ALTER TABLE `market_refresh_runs` ADD `attempt_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `market_refresh_runs` ADD `rate_limit_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `market_refresh_runs` ADD `retry_after_ms` integer;
--> statement-breakpoint
CREATE TABLE `market_stream_health` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stream_key` text NOT NULL,
  `instrument` text NOT NULL,
  `source` text NOT NULL,
  `quote_currency` text NOT NULL,
  `kind` text NOT NULL,
  `interval` text NOT NULL,
  `candle_state` text NOT NULL,
  `last_attempt_at` integer NOT NULL,
  `last_success_at` integer,
  `last_observation_key` text,
  `consecutive_failures` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_stream_health_stream_key_unique` ON `market_stream_health` (`stream_key`);
--> statement-breakpoint
CREATE INDEX `market_stream_health_instrument_kind_idx` ON `market_stream_health` (`instrument`,`kind`);