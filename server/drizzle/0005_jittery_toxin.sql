ALTER TABLE `ree` ADD `role` text DEFAULT 'ree' NOT NULL;--> statement-breakpoint
ALTER TABLE `ree` ADD `username` text;--> statement-breakpoint
ALTER TABLE `ree` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `ree` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ree` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ree_username_unique` ON `ree` (`username`);