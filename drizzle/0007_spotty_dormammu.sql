CREATE TABLE `wishes` (
	`id` integer PRIMARY KEY NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`min_res` text DEFAULT '1080p' NOT NULL,
	`hdr` text DEFAULT 'any' NOT NULL,
	`audio` text DEFAULT 'any' NOT NULL,
	`note` text,
	`created_at` real NOT NULL
);
