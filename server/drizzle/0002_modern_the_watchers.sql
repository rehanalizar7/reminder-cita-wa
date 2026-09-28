CREATE TABLE `tsub` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`outlet_count` integer DEFAULT 0 NOT NULL,
	`assigned_ree_id` text,
	`assigned_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assigned_ree_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tsub_code_unique` ON `tsub` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `tsub_assigned_ree_unique` ON `tsub` (`assigned_ree_id`);--> statement-breakpoint
CREATE TABLE `cita_retailer` (
	`id` text PRIMARY KEY NOT NULL,
	`retailer_code` text NOT NULL,
	`retailer_name` text NOT NULL,
	`phone` text,
	`cita_login_phone` text NOT NULL,
	`tsub_id` text,
	`ws_code` text,
	`ws_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tsub_id`) REFERENCES `tsub`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cita_retailer_code_unique` ON `cita_retailer` (`retailer_code`);--> statement-breakpoint
CREATE INDEX `cita_retailer_tsub_idx` ON `cita_retailer` (`tsub_id`);--> statement-breakpoint
ALTER TABLE `ree` ADD `tsub_id` text;--> statement-breakpoint
ALTER TABLE `outlet` ADD `cita_login_phone` text;--> statement-breakpoint
ALTER TABLE `outlet` ADD `cita_retailer_id` text;