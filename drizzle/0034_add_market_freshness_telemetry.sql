CREATE TABLE `market_data_observations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `observation_key` text NOT NULL,
  `instrument` text NOT NULL,
  `symbol` text NOT NULL,
  `market` text NOT NULL,
  `source` text NOT NULL,
  `venue` text NOT NULL,
  `pair` text NOT NULL,
  `quote_currency` text NOT NULL,
  `kind` text NOT NULL,
  `interval` text NOT NULL,
  `candle_state` text NOT NULL,
  `event_at` integer NOT NULL,
  `received_at` integer NOT NULL,
  `last_successful_refresh_at` integer NOT NULL,
  `value` real,
  `open` real,
  `high` real,
  `low` real,
  `close` real,
  `volume` real,
  `provider_version` integer NOT NULL DEFAULT 1,
  `correction_of_id` integer,
  `raw_trace_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_data_observations_key_uidx` ON `market_data_observations` (`observation_key`);
--> statement-breakpoint
CREATE INDEX `market_data_observations_instrument_kind_time_idx` ON `market_data_observations` (`instrument`,`kind`,`event_at`);
--> statement-breakpoint
CREATE TABLE `market_refresh_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `refresh_key` text NOT NULL,
  `path` text NOT NULL,
  `status` text NOT NULL,
  `requested_count` integer NOT NULL,
  `fetched_count` integer NOT NULL,
  `saved_count` integer NOT NULL,
  `deduped_count` integer NOT NULL,
  `request_weight` integer NOT NULL,
  `source` text NOT NULL,
  `error` text,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_refresh_runs_key_uidx` ON `market_refresh_runs` (`refresh_key`);
--> statement-breakpoint
CREATE INDEX `market_refresh_runs_path_time_idx` ON `market_refresh_runs` (`path`,`started_at`);
--> statement-breakpoint
CREATE TABLE `signal_status_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `event_key` text NOT NULL,
  `signal_id` text NOT NULL,
  `status` text NOT NULL,
  `observation_key` text NOT NULL,
  `observed_price` real,
  `observed_at` integer NOT NULL,
  `authoritative_settlement` integer NOT NULL DEFAULT 0,
  `detail` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_status_events_key_uidx` ON `signal_status_events` (`event_key`);
--> statement-breakpoint
CREATE INDEX `signal_status_events_signal_time_idx` ON `signal_status_events` (`signal_id`,`observed_at`);
