CREATE TABLE `market_discovery_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `status` text NOT NULL,
  `universe_size` integer DEFAULT 0 NOT NULL,
  `shortlisted` integer DEFAULT 0 NOT NULL,
  `signal_count` integer DEFAULT 0 NOT NULL,
  `news_count` integer DEFAULT 0 NOT NULL,
  `theory_count` integer DEFAULT 0 NOT NULL,
  `summary` text NOT NULL,
  `source_status_json` text NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discovery_signals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `name` text NOT NULL,
  `symbol` text NOT NULL,
  `rank` integer,
  `sector` text NOT NULL,
  `direction` text NOT NULL,
  `alignment` integer NOT NULL,
  `setup_type` text NOT NULL,
  `price` real,
  `change_1h` real,
  `change_24h` real,
  `change_7d` real,
  `change_30d` real,
  `turnover` real,
  `volume_24h` real,
  `market_cap` real,
  `funding` real,
  `open_interest_usd` real,
  `reasons_json` text NOT NULL,
  `captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discovery_news` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `title` text NOT NULL,
  `url` text NOT NULL,
  `source` text NOT NULL,
  `published_at` text,
  `why_it_matters` text NOT NULL,
  `impacts_json` text NOT NULL,
  `asset_tags_json` text NOT NULL,
  `verification` text NOT NULL,
  `retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discovery_signals_run_id_idx` ON `discovery_signals` (`run_id`);
--> statement-breakpoint
CREATE INDEX `discovery_news_run_id_idx` ON `discovery_news` (`run_id`);
