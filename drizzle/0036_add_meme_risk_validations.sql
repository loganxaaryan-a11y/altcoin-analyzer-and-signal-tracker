CREATE TABLE `meme_risk_validations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `mint` text NOT NULL,
  `symbol` text,
  `claims_renounced` integer NOT NULL DEFAULT 0,
  `verdict` text NOT NULL,
  `veto_reason` text,
  `rugcheck_status` text NOT NULL,
  `rugcheck_score` real,
  `bundle_status` text NOT NULL,
  `holder_status` text NOT NULL,
  `holder_count` integer,
  `top_holder_share_pct` real,
  `snapshot_json` text NOT NULL,
  `source_as_of` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meme_risk_validations_mint_time_idx` ON `meme_risk_validations` (`mint`,`created_at`);
