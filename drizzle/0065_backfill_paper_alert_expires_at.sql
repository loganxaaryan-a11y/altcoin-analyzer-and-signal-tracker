UPDATE `paper_alert_events`
SET `expires_at` = (
  SELECT `entry_expires_at` FROM `paper_signal_candidates`
  WHERE `paper_signal_candidates`.`candidate_key` = `paper_alert_events`.`contract_id`
)
WHERE `expires_at` IS NULL
  AND `contract_id` IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM `paper_signal_candidates`
    WHERE `paper_signal_candidates`.`candidate_key` = `paper_alert_events`.`contract_id`
  );
--> statement-breakpoint
UPDATE `paper_alert_events`
SET `expires_at` = (
  SELECT `entry_expires_at` FROM `paper_candidate_intake`
  WHERE `paper_candidate_intake`.`candidate_key` = `paper_alert_events`.`contract_id`
)
WHERE `expires_at` IS NULL
  AND `contract_id` IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM `paper_candidate_intake`
    WHERE `paper_candidate_intake`.`candidate_key` = `paper_alert_events`.`contract_id`
  );
--> statement-breakpoint
UPDATE `paper_alert_events`
SET `expires_at` = (
  SELECT `entry_expires_at` FROM `paper_signal_candidates`
  WHERE `paper_signal_candidates`.`id` = CAST(substr(`paper_alert_events`.`paper_signal_id`, 9) AS INTEGER)
)
WHERE `expires_at` IS NULL
  AND `paper_signal_id` LIKE 'pending_%'
  AND EXISTS (
    SELECT 1 FROM `paper_signal_candidates`
    WHERE `paper_signal_candidates`.`id` = CAST(substr(`paper_alert_events`.`paper_signal_id`, 9) AS INTEGER)
  );
