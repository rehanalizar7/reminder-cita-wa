PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ree_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`template_id` text,
	`schedule_job_id` text,
	`phone` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`ree_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `message_template`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_job_id`) REFERENCES `schedule_job`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_message_log`("id", "ree_id", "outlet_id", "template_id", "schedule_job_id", "phone", "message", "status", "error", "created_at", "sent_at") SELECT "id", "ree_id", "outlet_id", "template_id", "schedule_job_id", "phone", "message", "status", "error", "created_at", "sent_at" FROM `message_log`;--> statement-breakpoint
DROP TABLE `message_log`;--> statement-breakpoint
ALTER TABLE `__new_message_log` RENAME TO `message_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `message_log_ree_created_idx` ON `message_log` (`ree_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_log_status_idx` ON `message_log` (`status`);