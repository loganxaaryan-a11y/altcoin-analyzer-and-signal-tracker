ALTER TABLE `scheduler_invocation_receipts` ADD `deployed_version` text;
--> statement-breakpoint
ALTER TABLE `scheduler_invocation_receipts` ADD `trigger_provenance` text CHECK (`trigger_provenance` IN ('scheduler', 'manual'));
--> statement-breakpoint
ALTER TABLE `scheduler_invocation_receipts` ADD `progress_json` text;
--> statement-breakpoint
ALTER TABLE `scheduler_invocation_receipts` ADD `error` text;
