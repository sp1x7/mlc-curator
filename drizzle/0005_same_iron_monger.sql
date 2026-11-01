CREATE TABLE `downloads` (
	`id` integer PRIMARY KEY NOT NULL,
	`thread_id` integer NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`folder` text DEFAULT '' NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`note` text,
	`organized_at` real,
	`created_at` real NOT NULL,
	`started_at` real,
	`finished_at` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `downloads_thread_id_unique` ON `downloads` (`thread_id`);--> statement-breakpoint
CREATE INDEX `downloads_state_idx` ON `downloads` (`state`);