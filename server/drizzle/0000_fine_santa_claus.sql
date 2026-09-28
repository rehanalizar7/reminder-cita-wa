CREATE TABLE `ree` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`google_id` text,
	`name` text NOT NULL,
	`google_refresh_token` text,
	`contact_pattern` text,
	`pattern_is_regex` integer DEFAULT false NOT NULL,
	`wa_connected` integer DEFAULT false NOT NULL,
	`wa_last_connected_at` integer,
	`wa_phone_number` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ree_email_unique` ON `ree` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `ree_google_id_unique` ON `ree` (`google_id`);--> statement-breakpoint
CREATE TABLE `outlet_group` (
	`id` text PRIMARY KEY NOT NULL,
	`ree_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ree_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outlet_group_ree_name_unique` ON `outlet_group` (`ree_id`,`name`);--> statement-breakpoint
CREATE TABLE `outlet` (
	`id` text PRIMARY KEY NOT NULL,
	`ree_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`raw_contact_name` text,
	`google_contact_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ree_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outlet_ree_phone_unique` ON `outlet` (`ree_id`,`phone`);--> statement-breakpoint
CREATE INDEX `outlet_ree_active_idx` ON `outlet` (`ree_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `outlet_group_member` (
	`outlet_id` text NOT NULL,
	`group_id` text NOT NULL,
	PRIMARY KEY(`outlet_id`, `group_id`),
	FOREIGN KEY (`outlet_id`) REFERENCES `outlet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `outlet_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `message_template` (
	`id` text PRIMARY KEY NOT NULL,
	`ree_id` text,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ree_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schedule_job` (
	`id` text PRIMARY KEY NOT NULL,
	`ree_id` text NOT NULL,
	`template_id` text NOT NULL,
	`target_type` text NOT NULL,
	`group_id` text,
	`run_at` integer,
	`cron_expression` text,
	`is_recurring` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ree_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `message_template`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `outlet_group`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `schedule_job_active_runat_idx` ON `schedule_job` (`is_active`,`run_at`);--> statement-breakpoint
CREATE TABLE `schedule_job_outlet` (
	`schedule_job_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	PRIMARY KEY(`schedule_job_id`, `outlet_id`),
	FOREIGN KEY (`schedule_job_id`) REFERENCES `schedule_job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlet`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `message_log` (
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
	FOREIGN KEY (`schedule_job_id`) REFERENCES `schedule_job`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `message_log_ree_created_idx` ON `message_log` (`ree_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_log_status_idx` ON `message_log` (`status`);