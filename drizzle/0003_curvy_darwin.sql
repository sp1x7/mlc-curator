CREATE TABLE `mappings` (
	`thread_id` integer PRIMARY KEY NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`origin` text DEFAULT 'auto' NOT NULL,
	`created_at` real NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `releases`(`thread_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`thread_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`category` text,
	`subcategory` text,
	`forum_id` integer,
	`published_at` real,
	`url` text NOT NULL,
	`last_seen_at` real NOT NULL,
	`ftp_host` text,
	`ftp_port` integer,
	`ftp_user` text,
	`ftp_pass` text,
	`ftp_path` text,
	`ftp_raw` text,
	`ftp_fetched_at` real
);
--> statement-breakpoint
CREATE INDEX `releases_category_idx` ON `releases` (`category`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tmdb_episodes` (
	`tmdb_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`name` text,
	`original_name` text,
	`air_date` text,
	`overview` text,
	`runtime_minutes` integer,
	`still_path` text,
	`fetched_at` real NOT NULL,
	PRIMARY KEY(`tmdb_id`, `season_number`, `episode_number`),
	FOREIGN KEY (`tmdb_id`) REFERENCES `tmdb_series`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tmdb_episodes`("tmdb_id", "season_number", "episode_number", "name", "original_name", "air_date", "overview", "runtime_minutes", "still_path", "fetched_at") SELECT "tmdb_id", "season_number", "episode_number", "name", "original_name", "air_date", "overview", "runtime_minutes", "still_path", "fetched_at" FROM `tmdb_episodes`;--> statement-breakpoint
DROP TABLE `tmdb_episodes`;--> statement-breakpoint
ALTER TABLE `__new_tmdb_episodes` RENAME TO `tmdb_episodes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_tmdb_seasons` (
	`tmdb_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`name` text,
	`year` integer,
	`episode_count` integer DEFAULT 0 NOT NULL,
	`poster_path` text,
	`fetched_at` real NOT NULL,
	PRIMARY KEY(`tmdb_id`, `season_number`),
	FOREIGN KEY (`tmdb_id`) REFERENCES `tmdb_series`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tmdb_seasons`("tmdb_id", "season_number", "name", "year", "episode_count", "poster_path", "fetched_at") SELECT "tmdb_id", "season_number", "name", "year", "episode_count", "poster_path", "fetched_at" FROM `tmdb_seasons`;--> statement-breakpoint
DROP TABLE `tmdb_seasons`;--> statement-breakpoint
ALTER TABLE `__new_tmdb_seasons` RENAME TO `tmdb_seasons`;