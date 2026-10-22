UPDATE `paper_candidate_intake`
SET
  `outcome` = (
    SELECT p.`state`
    FROM `paper_signal_candidates` p
    WHERE p.`candidate_key` = `paper_candidate_intake`.`candidate_key`
    LIMIT 1
  ),
  `reason_code` = (
    SELECT p.`reason_code`
    FROM `paper_signal_candidates` p
    WHERE p.`candidate_key` = `paper_candidate_intake`.`candidate_key`
    LIMIT 1
  ),
  `reason` = (
    SELECT p.`reason`
    FROM `paper_signal_candidates` p
    WHERE p.`candidate_key` = `paper_candidate_intake`.`candidate_key`
    LIMIT 1
  ),
  `updated_at` = 1792164660000
WHERE `status` = 'processed'
  AND EXISTS (
    SELECT 1
    FROM `paper_signal_candidates` p
    WHERE p.`candidate_key` = `paper_candidate_intake`.`candidate_key`
  );
