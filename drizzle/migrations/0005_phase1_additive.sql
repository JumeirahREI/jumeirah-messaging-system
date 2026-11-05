ALTER TABLE `batch_sessions` ADD `unknown` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `batch_sessions` ADD `runner_id` text;--> statement-breakpoint
ALTER TABLE `batch_sessions` ADD `runner_lease_until` text;--> statement-breakpoint
CREATE INDEX `batch_sessions_created_at_idx` ON `batch_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `batch_sessions_project_status_idx` ON `batch_sessions` (`project_id`,`status`);--> statement-breakpoint
ALTER TABLE `messages` ADD `claimed_at` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `gateway_message_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `client_ref` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `parts_sent` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `messages` SET `deleted_at` = datetime('now') WHERE `deleted_at` IS NULL AND EXISTS (SELECT 1 FROM `messages` AS `o` WHERE `o`.`deleted_at` IS NULL AND `o`.`invoice_id` = `messages`.`invoice_id` AND `o`.`phone_number_id` = `messages`.`phone_number_id` AND `o`.`template_type` = `messages`.`template_type` AND `o`.`id` <> `messages`.`id` AND (CASE `o`.`status` WHEN 'sent' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END < CASE `messages`.`status` WHEN 'sent' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END OR (CASE `o`.`status` WHEN 'sent' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END = CASE `messages`.`status` WHEN 'sent' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END AND `o`.`id` < `messages`.`id`)));--> statement-breakpoint
CREATE UNIQUE INDEX `messages_live_unique_idx` ON `messages` (`invoice_id`,`phone_number_id`,`template_type`) WHERE "messages"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_client_ref_unique_idx` ON `messages` (`client_ref`) WHERE "messages"."client_ref" is not null;--> statement-breakpoint
ALTER TABLE `users` ADD `session_version` integer DEFAULT 0 NOT NULL;