CREATE TABLE `defillama_crosswalk` (
  `coin_id` text PRIMARY KEY NOT NULL,
  `symbol` text,
  `slug` text,
  `source` text NOT NULL,
  `verified_at` integer,
  `notes` text
);
