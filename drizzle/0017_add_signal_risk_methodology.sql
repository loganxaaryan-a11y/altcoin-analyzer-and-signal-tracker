ALTER TABLE `generated_signals` ADD `atr14` real;
--> statement-breakpoint
ALTER TABLE `generated_signals` ADD `risk_multiplier` real;
--> statement-breakpoint
ALTER TABLE `generated_signals` ADD `risk_method` text NOT NULL DEFAULT 'legacy_fixed';
