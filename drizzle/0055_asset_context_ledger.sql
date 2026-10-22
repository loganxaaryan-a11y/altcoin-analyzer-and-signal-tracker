CREATE TABLE `asset_profiles` (
  `asset_id` text PRIMARY KEY NOT NULL,
  `symbol` text NOT NULL,
  `name` text NOT NULL,
  `asset_kind` text NOT NULL,
  `description` text NOT NULL,
  `economic_model` text NOT NULL,
  `instrument` text NOT NULL,
  `source_url` text NOT NULL,
  `verified_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_profiles_symbol_uidx` ON `asset_profiles` (`symbol`);
--> statement-breakpoint
CREATE TABLE `asset_context_links` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `asset_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_id` text NOT NULL,
  `stance` text NOT NULL,
  `event_at` integer NOT NULL,
  `linked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_context_links_source_uidx` ON `asset_context_links` (`asset_id`,`source_type`,`source_id`);
--> statement-breakpoint
CREATE INDEX `asset_context_links_asset_event_idx` ON `asset_context_links` (`asset_id`,`event_at`);
--> statement-breakpoint
CREATE TABLE `asset_assessments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `assessment_key` text NOT NULL UNIQUE,
  `asset_id` text NOT NULL,
  `symbol` text NOT NULL,
  `flow` text NOT NULL,
  `explanation_json` text NOT NULL,
  `evidence_json` text NOT NULL,
  `context_snapshot_json` text NOT NULL,
  `research_version` text NOT NULL,
  `decision_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asset_assessments_asset_decision_idx` ON `asset_assessments` (`asset_id`,`decision_at`);
--> statement-breakpoint
CREATE TABLE `asset_assessment_outcomes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `assessment_id` integer NOT NULL,
  `outcome_type` text NOT NULL,
  `outcome_json` text NOT NULL,
  `evidence_json` text NOT NULL,
  `observed_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asset_assessment_outcomes_assessment_time_idx` ON `asset_assessment_outcomes` (`assessment_id`,`observed_at`);
--> statement-breakpoint
CREATE TABLE `asset_research_context_reads` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `asset_id` text NOT NULL,
  `flow` text NOT NULL,
  `context_hash` text NOT NULL,
  `theory_count` integer NOT NULL,
  `news_count` integer NOT NULL,
  `retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asset_research_context_reads_asset_time_idx` ON `asset_research_context_reads` (`asset_id`,`retrieved_at`);
--> statement-breakpoint
CREATE TABLE `asset_learning_proposals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `asset_id` text,
  `question` text NOT NULL,
  `finding` text NOT NULL,
  `proposed_test` text NOT NULL,
  `status` text DEFAULT 'proposed' NOT NULL,
  `model_change_applied` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);