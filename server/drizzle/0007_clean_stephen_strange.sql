CREATE TABLE `spv_tsub` (
	`spv_id` text NOT NULL,
	`tsub_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`spv_id`, `tsub_id`),
	FOREIGN KEY (`spv_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tsub_id`) REFERENCES `tsub`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spv_tsub_tsub_unique` ON `spv_tsub` (`tsub_id`);--> statement-breakpoint
ALTER TABLE `schedule_job` ADD `target_ree_id` text REFERENCES ree(id) ON DELETE SET NULL;