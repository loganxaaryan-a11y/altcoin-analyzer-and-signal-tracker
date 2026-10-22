CREATE TABLE `paper_candidate_intake` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `handoff_candidate_id` integer NOT NULL,
  `handoff_run_id` integer NOT NULL,
  `discovery_run_id` integer NOT NULL,
  `candidate_key` text NOT NULL,
  `batch_ordinal` integer NOT NULL,
  `status` text NOT NULL,
  `outcome` text,
  `reason_code` text,
  `reason` text,
  `decision_at` integer NOT NULL,
  `entry_expires_at` integer NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `claimed_by` text,
  `lease_expires_at` integer,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_candidate_intake_handoff_candidate_uidx` ON `paper_candidate_intake` (`handoff_candidate_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_candidate_intake_candidate_key_uidx` ON `paper_candidate_intake` (`candidate_key`);
--> statement-breakpoint
CREATE INDEX `paper_candidate_intake_status_expiry_idx` ON `paper_candidate_intake` (`status`, `entry_expires_at`);
--> statement-breakpoint
CREATE INDEX `paper_candidate_intake_handoff_status_idx` ON `paper_candidate_intake` (`handoff_run_id`, `status`);
--> statement-breakpoint
INSERT OR IGNORE INTO `paper_candidate_intake` (
  `handoff_candidate_id`, `handoff_run_id`, `discovery_run_id`, `candidate_key`, `batch_ordinal`,
  `status`, `outcome`, `reason_code`, `reason`, `decision_at`, `entry_expires_at`,
  `attempt_count`, `claimed_by`, `lease_expires_at`, `completed_at`, `created_at`, `updated_at`
)
SELECT
  h.`id`, h.`handoff_run_id`, h.`discovery_run_id`,
  COALESCE(p.`candidate_key`, 'paper-pilot-v2.1.0:' || h.`candidate_key`),
  ROW_NUMBER() OVER (PARTITION BY h.`handoff_run_id` ORDER BY h.`id`) - 1,
  CASE WHEN p.`id` IS NOT NULL THEN 'processed' ELSE 'missed_processing' END,
  COALESCE(p.`state`, 'missed-processing'),
  COALESCE(p.`reason_code`, 'missed-processing'),
  COALESCE(p.`reason`, 'The candidate was eligible before the durable intake repair but received no paper-processing row. It remains missed-processing; its expired historical opportunity is not reopened and its hypothetical outcome is unknown.'),
  COALESCE(
    CAST((julianday(json_extract(h.`decision_evidence_json`, '$.capturedAt')) - 2440587.5) * 86400000 AS INTEGER),
    r.`completed_at`,
    r.`created_at`
  ),
  COALESCE(
    CAST((julianday(json_extract(h.`decision_evidence_json`, '$.capturedAt')) - 2440587.5) * 86400000 AS INTEGER),
    r.`completed_at`,
    r.`created_at`
  ) + 900000,
  0, NULL, NULL, 1792163580000, 1792163580000, 1792163580000
FROM `paper_handoff_candidates` h
JOIN `paper_handoff_runs` r ON r.`id` = h.`handoff_run_id`
LEFT JOIN `paper_signal_candidates` p
  ON p.`discovery_run_id` = h.`discovery_run_id`
 AND p.`discovery_signal_id` = COALESCE(h.`discovery_signal_id`, -h.`id`)
WHERE h.`outcome` = 'eligible'
  AND r.`status` = 'complete'
  AND COALESCE(r.`completed_at`, r.`created_at`) < 1792163580000;
