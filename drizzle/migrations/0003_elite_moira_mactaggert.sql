ALTER TABLE `batch_sessions` ADD `mode` text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE `batch_sessions` ADD `locked_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `batch_sessions` ADD `locked_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `must_reset_password` integer DEFAULT false NOT NULL;