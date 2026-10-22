ALTER TABLE `generated_signals` ADD `issuance_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `generated_signals_issuance_key_unique` ON `generated_signals` (`issuance_key`);
--> statement-breakpoint
ALTER TABLE `signal_contracts` ADD `issuance_state` text NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `signal_contracts` ADD `entry_evidence_json` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `signal_contracts` SET `issuance_state` = CASE WHEN `legacy_signal_id` IS NULL THEN 'failed' ELSE 'complete' END;
