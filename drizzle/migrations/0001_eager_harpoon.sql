ALTER TABLE `invoices` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `deleted_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `messages` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `deleted_by` integer REFERENCES users(id);