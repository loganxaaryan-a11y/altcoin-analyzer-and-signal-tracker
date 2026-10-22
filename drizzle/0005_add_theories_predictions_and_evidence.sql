CREATE TABLE `theories` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `statement` text NOT NULL,
  `horizon` text NOT NULL,
  `linked_coins_json` text NOT NULL,
  `ripple_map` text NOT NULL,
  `price_snapshots_json` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `theory_predictions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `theory_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `direction` text NOT NULL,
  `target_price` real,
  `due_date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `theory_evidence` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `theory_id` integer NOT NULL,
  `title` text NOT NULL,
  `url` text NOT NULL,
  `source` text NOT NULL,
  `stance` text NOT NULL,
  `published_at` text,
  `created_at` integer NOT NULL
);