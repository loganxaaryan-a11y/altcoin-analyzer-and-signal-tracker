CREATE TABLE `signal_snapshot_corrections` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signal_id` integer NOT NULL,
  `snapshot_row_id` integer NOT NULL,
  `captured_day` text NOT NULL,
  `field_name` text NOT NULL,
  `old_value` real NOT NULL,
  `new_value` real NOT NULL,
  `actor` text NOT NULL,
  `reason` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signal_snapshot_corrections_snapshot_idx` ON `signal_snapshot_corrections` (`snapshot_row_id`);
--> statement-breakpoint
CREATE INDEX `signal_snapshot_corrections_signal_day_idx` ON `signal_snapshot_corrections` (`signal_id`, `captured_day`);
--> statement-breakpoint
INSERT INTO `signal_snapshot_corrections` (
  `signal_id`, `snapshot_row_id`, `captured_day`, `field_name`, `old_value`, `new_value`, `actor`, `reason`, `created_at`
)
SELECT
  24,
  66,
  '2026-10-07',
  'returnPct',
  0.9999494944886158,
  -3.7468982630272962,
  'unknown-pre-mechanism',
  'Fault 1 FAULT-REPORT-2026-10-15: return-field misassignment corrected in place before the audit mechanism existed; original value preserved from SOL.md export',
  1792121594000
WHERE NOT EXISTS (
  SELECT 1
  FROM `signal_snapshot_corrections`
  WHERE `signal_id` = 24
    AND `snapshot_row_id` = 66
    AND `captured_day` = '2026-10-07'
    AND `field_name` = 'returnPct'
    AND `old_value` = 0.9999494944886158
    AND `new_value` = -3.7468982630272962
    AND `actor` = 'unknown-pre-mechanism'
);