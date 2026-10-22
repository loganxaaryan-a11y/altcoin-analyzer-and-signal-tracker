-- Discovery informational notification lane (2026-10-16, Logan item 2):
-- discovery-qualified opportunities blocked from paper issuance become
-- eligible for INFORMATIONAL chat notifications. INFORMATIONAL ONLY: the
-- blocker disclosed here still blocks paper entry; this lane never issues,
-- grades, or revives a candidate. Consumed by the workspace delivery path via
-- getPendingDiscoveryNotifications / ackDiscoveryNotification.
CREATE TABLE IF NOT EXISTS `discovery_informational_notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `kind` text DEFAULT 'INFORMATIONAL' NOT NULL,
  `coin_id` text NOT NULL,
  `symbol` text NOT NULL,
  `name` text NOT NULL,
  `direction` text NOT NULL,
  `entry` real,
  `invalidation` real,
  `target1` real,
  `target2` real,
  `trigger_reasons_json` text NOT NULL,
  `blocker_reason` text NOT NULL,
  `disclosure` text NOT NULL,
  `discovery_run_id` integer,
  `signal_day` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `sent_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `discovery_informational_notifications_status_created_idx`
  ON `discovery_informational_notifications` (`status`, `created_at`);
