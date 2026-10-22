CREATE TABLE `onchain_flow_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `coin` text NOT NULL,
  `as_of` integer NOT NULL,
  `flows_json` text NOT NULL,
  `source` text NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onchain_flow_snapshots_coin_unique` ON `onchain_flow_snapshots` (`coin`);
--> statement-breakpoint
CREATE INDEX `onchain_flow_snapshots_as_of_idx` ON `onchain_flow_snapshots` (`as_of`);