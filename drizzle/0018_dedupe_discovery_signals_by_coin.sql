ALTER TABLE `discovery_signals` ADD `first_seen_run_id` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `latest_run_id` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `first_seen_price` real;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `first_seen_direction` text;
--> statement-breakpoint
ALTER TABLE `discovery_signals` ADD `first_seen_source_as_of` integer;
--> statement-breakpoint
UPDATE `discovery_signals` AS `current`
SET
  `first_seen_run_id` = COALESCE((SELECT `earliest`.`run_id` FROM `discovery_signals` AS `earliest` WHERE `earliest`.`coin_id` = `current`.`coin_id` ORDER BY `earliest`.`id` ASC LIMIT 1), `current`.`run_id`),
  `latest_run_id` = COALESCE((SELECT `latest`.`run_id` FROM `discovery_signals` AS `latest` WHERE `latest`.`coin_id` = `current`.`coin_id` ORDER BY `latest`.`id` DESC LIMIT 1), `current`.`run_id`),
  `first_seen_price` = (SELECT `earliest_price`.`price` FROM `discovery_signals` AS `earliest_price` WHERE `earliest_price`.`coin_id` = `current`.`coin_id` AND `earliest_price`.`price` IS NOT NULL ORDER BY `earliest_price`.`id` ASC LIMIT 1),
  `first_seen_direction` = (SELECT `earliest_direction`.`direction` FROM `discovery_signals` AS `earliest_direction` WHERE `earliest_direction`.`coin_id` = `current`.`coin_id` ORDER BY `earliest_direction`.`id` ASC LIMIT 1),
  `first_seen_source_as_of` = (SELECT `earliest_source`.`source_as_of` FROM `discovery_signals` AS `earliest_source` WHERE `earliest_source`.`coin_id` = `current`.`coin_id` AND `earliest_source`.`source_as_of` IS NOT NULL ORDER BY `earliest_source`.`id` ASC LIMIT 1);
--> statement-breakpoint
UPDATE `discovery_signals` AS `current`
SET
  `run_id` = `latest_run_id`,
  `outcome_5` = COALESCE(`current`.`outcome_5`, (SELECT `prior`.`outcome_5` FROM `discovery_signals` AS `prior` WHERE `prior`.`coin_id` = `current`.`coin_id` AND `prior`.`outcome_5` IS NOT NULL ORDER BY `prior`.`id` ASC LIMIT 1)),
  `return_5` = COALESCE(`current`.`return_5`, (SELECT `prior`.`return_5` FROM `discovery_signals` AS `prior` WHERE `prior`.`coin_id` = `current`.`coin_id` AND `prior`.`return_5` IS NOT NULL ORDER BY `prior`.`id` ASC LIMIT 1)),
  `outcome_14` = COALESCE(`current`.`outcome_14`, (SELECT `prior`.`outcome_14` FROM `discovery_signals` AS `prior` WHERE `prior`.`coin_id` = `current`.`coin_id` AND `prior`.`outcome_14` IS NOT NULL ORDER BY `prior`.`id` ASC LIMIT 1)),
  `return_14` = COALESCE(`current`.`return_14`, (SELECT `prior`.`return_14` FROM `discovery_signals` AS `prior` WHERE `prior`.`coin_id` = `current`.`coin_id` AND `prior`.`return_14` IS NOT NULL ORDER BY `prior`.`id` ASC LIMIT 1)),
  `outcome_30` = COALESCE(`current`.`outcome_30`, (SELECT `prior`.`outcome_30` FROM `discovery_signals` AS `prior` WHERE `prior`.`coin_id` = `current`.`coin_id` AND `prior`.`outcome_30` IS NOT NULL ORDER BY `prior`.`id` ASC LIMIT 1)),
  `return_30` = COALESCE(`current`.`return_30`, (SELECT `prior`.`return_30` FROM `discovery_signals` AS `prior` WHERE `prior`.`coin_id` = `current`.`coin_id` AND `prior`.`return_30` IS NOT NULL ORDER BY `prior`.`id` ASC LIMIT 1));
--> statement-breakpoint
DELETE FROM `discovery_signals`
WHERE `id` NOT IN (SELECT MAX(`id`) FROM `discovery_signals` GROUP BY `coin_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_signals_coin_id_unique` ON `discovery_signals` (`coin_id`);
--> statement-breakpoint
CREATE INDEX `discovery_signals_first_seen_run_id_idx` ON `discovery_signals` (`first_seen_run_id`);
--> statement-breakpoint
CREATE INDEX `discovery_signals_latest_run_id_idx` ON `discovery_signals` (`latest_run_id`);
