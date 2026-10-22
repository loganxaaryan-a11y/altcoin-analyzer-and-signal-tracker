CREATE TABLE `universe_tier_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `status` text NOT NULL,
  `universe_count` integer DEFAULT 0 NOT NULL,
  `volume_pass_count` integer DEFAULT 0 NOT NULL,
  `t3_count` integer DEFAULT 0 NOT NULL,
  `t2_count` integer DEFAULT 0 NOT NULL,
  `t1_count` integer DEFAULT 0 NOT NULL,
  `summary` text NOT NULL,
  `source_status_json` text NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `universe_tiers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `name` text NOT NULL,
  `symbol` text NOT NULL,
  `tier` text NOT NULL,
  `reason` text NOT NULL,
  `assigned_at` integer NOT NULL,
  `graduation_score` integer,
  `volume_score` integer DEFAULT 0 NOT NULL,
  `holders_score` integer DEFAULT 0 NOT NULL,
  `whales_score` integer DEFAULT 0 NOT NULL,
  `catalyst_score` integer DEFAULT 0 NOT NULL,
  `structure_score` integer DEFAULT 0 NOT NULL,
  `volume_rank` integer,
  `market_cap_rank` integer,
  `price` real,
  `volume_24h` real,
  `volume_multiple_30d` real,
  `change_48h` real,
  `ath_change_pct` real,
  `sma_50` real,
  `rsi_14` real,
  `history_days` integer DEFAULT 0 NOT NULL,
  `chart_pass` integer DEFAULT 0 NOT NULL,
  `thin_data` integer DEFAULT 0 NOT NULL,
  `rsi_flag` integer DEFAULT 0 NOT NULL,
  `stablecoin` integer DEFAULT 0 NOT NULL,
  `mover` integer DEFAULT 0 NOT NULL,
  `mover_reason` text,
  `catalyst_line` text,
  `new_listing` integer DEFAULT 0 NOT NULL,
  `outside_t2_weeks` integer DEFAULT 0 NOT NULL,
  `last_activity_at` integer,
  `source_as_of` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `universe_tiers_coin_id_uidx` ON `universe_tiers` (`coin_id`);
--> statement-breakpoint
CREATE INDEX `universe_tiers_tier_volume_idx` ON `universe_tiers` (`tier`,`volume_rank`);
--> statement-breakpoint
CREATE TABLE `universe_tier_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `tier` text NOT NULL,
  `reason` text NOT NULL,
  `graduation_score` integer,
  `assigned_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `universe_tier_logs_coin_time_idx` ON `universe_tier_logs` (`coin_id`,`assigned_at`);