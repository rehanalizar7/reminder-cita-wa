CREATE TABLE `wa_messages` (
	`wa_id` text NOT NULL,
	`ree_id` text NOT NULL,
	`jid` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`wa_id`, `ree_id`),
	FOREIGN KEY (`ree_id`) REFERENCES `ree`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wa_messages_ree_created_idx` ON `wa_messages` (`ree_id`,`created_at`);