CREATE TABLE `methodology_freezes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `version` text NOT NULL,
  `version_hash` text NOT NULL,
  `frozen_at` integer NOT NULL,
  `status` text NOT NULL,
  `spec_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `methodology_freezes_version_unique` ON `methodology_freezes` (`version`);
--> statement-breakpoint
CREATE TABLE `universe_daily_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `captured_day` text NOT NULL,
  `captured_at` integer NOT NULL,
  `methodology_version` text NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `candidate_state` text NOT NULL,
  `direction` text NOT NULL,
  `ohlc_json` text NOT NULL,
  `factors_json` text NOT NULL,
  `venues_json` text NOT NULL,
  `realized_funding_json` text NOT NULL,
  `source_as_of` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `universe_daily_snapshots_day_coin_unique` ON `universe_daily_snapshots` (`captured_day`,`coin_id`);
--> statement-breakpoint
CREATE INDEX `universe_daily_snapshots_day_idx` ON `universe_daily_snapshots` (`captured_day`);
--> statement-breakpoint
CREATE TABLE `dossier_verdict_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `captured_day` text NOT NULL,
  `captured_at` integer NOT NULL,
  `methodology_version` text NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `direction` text NOT NULL,
  `conviction_mode` text NOT NULL,
  `score` real NOT NULL,
  `invalidation` real,
  `source_as_of` integer,
  `payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dossier_verdict_day_coin_unique` ON `dossier_verdict_snapshots` (`captured_day`,`coin_id`);
--> statement-breakpoint
CREATE TABLE `pass_bar_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `version` text NOT NULL,
  `average_net_r_min` real NOT NULL,
  `wilson_above_baseline` integer NOT NULL,
  `min_closed_calls` integer NOT NULL,
  `factor_active_n` integer NOT NULL,
  `factor_inactive_n` integer NOT NULL,
  `signed_off` integer NOT NULL,
  `signed_off_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_bar_settings_version_unique` ON `pass_bar_settings` (`version`);
--> statement-breakpoint
CREATE TABLE `timing_integrity_audits` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `symbol` text NOT NULL,
  `signal_id` integer,
  `signal_at` integer,
  `timestamp_state` text NOT NULL,
  `candle_state` text NOT NULL,
  `candle_source` text,
  `pre_signal_bars` integer NOT NULL,
  `factor_ledger_state` text NOT NULL,
  `note` text NOT NULL,
  `checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `timing_integrity_audits_symbol_idx` ON `timing_integrity_audits` (`symbol`);
--> statement-breakpoint
CREATE TABLE `reverse_pattern_definitions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `version` text NOT NULL,
  `name` text NOT NULL,
  `criteria_json` text NOT NULL,
  `outcome_rule` text NOT NULL,
  `holdout_rule` text NOT NULL,
  `frozen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reverse_pattern_definitions_version_unique` ON `reverse_pattern_definitions` (`version`);
