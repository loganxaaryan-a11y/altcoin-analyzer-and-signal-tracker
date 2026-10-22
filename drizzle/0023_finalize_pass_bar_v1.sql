ALTER TABLE `pass_bar_settings` ADD COLUMN `signed_off_date` text;
--> statement-breakpoint
ALTER TABLE `pass_bar_settings` ADD COLUMN `definition_json` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `pass_bar_settings`
SET `version` = 'v1-final',
    `average_net_r_min` = 0,
    `wilson_above_baseline` = 1,
    `min_closed_calls` = 30,
    `factor_active_n` = 0,
    `factor_inactive_n` = 0,
    `signed_off` = 1,
    `signed_off_at` = 1791158400000,
    `signed_off_date` = '2026-10-05',
    `definition_json` = '{"effectiveCloses":{"required":30,"rule":"Same-coin signals must be at least one full 30-day outcome horizon apart; cross-coin dependence is disclosed, not removed. Raw rows never count."},"expectancy":{"costBps":18,"bar":"The paired-bootstrap 95% lower bound of issued average net R minus the dumb-screen buy-and-hold baseline must be above zero. Hit rate is reported only."},"baselines":["Always-long asset buy-and-hold on the same dates and resolved horizons","Seeded random long-or-short entry on the same dates with the identical initial-risk stop and 1.5R target","Ex-ante beta times always-long BTC return on the same dates and resolved horizons"],"silence":"Independence-adjusted suppressed candidates, graded with the same 30-day first-touch rule and 18 bps costs, must not have higher average net R than issued calls.","directionSplit":true,"regime":"Each 30-effective-close certification window must contain a completed UTC BTC-up week and a BTC-down-or-flat week.","funding":{"state":"UNVERIFIED until recorded","minimumRecordedDays":30,"rule":"At 30 distinct realized-payment days, automatically include recorded payment R and re-run; pre-funding results never authorize sizing."},"firstTouch":"Within 30 daily OHLC bars, first target or invalidation touch closes the call; if both touch in one candle, invalidation wins. If neither touches, the 30-day close settles it.","weeksAndFutility":{"futilityAt":15,"rule":"If the paired-bootstrap 95% upper bound of average net R is below zero, status is futility — reassess."},"recertification":{"everyNewEffectiveCloses":30,"rule":"Evaluate the latest completed 30-effective-close block; passes are not permanent."},"sizing":"No sizing changes until a funding-included pass. Mixed, futility, bull-regime only, and pre-funding pass keep sizing flat."}'
WHERE `version` = 'proposed-v1';
--> statement-breakpoint
CREATE TABLE `realized_funding_payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signal_id` integer NOT NULL,
  `coin_id` text NOT NULL,
  `payment_day` text NOT NULL,
  `payment_r` real NOT NULL,
  `source` text NOT NULL,
  `recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `realized_funding_payments_signal_day_source_unique` ON `realized_funding_payments` (`signal_id`,`payment_day`,`source`);
--> statement-breakpoint
CREATE INDEX `realized_funding_payments_day_idx` ON `realized_funding_payments` (`payment_day`);
