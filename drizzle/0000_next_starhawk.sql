CREATE TABLE `tmdb_episodes` (
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
	FOREIGN KEY (`tmdb_id`) REFERENCES `tmdb_series`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tmdb_movies` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`imdb_id` text,
	`title` text NOT NULL,
	`original_title` text,
	`year` integer,
	`release_date` text,
	`overview` text,
	`original_language` text,
	`production_country` text,
	`vote_average` real,
	`vote_count` integer,
	`poster_path` text,
	`backdrop_path` text,
	`fetched_at` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tmdb_seasons` (
	`tmdb_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`name` text,
	`year` integer,
	`episode_count` integer DEFAULT 0 NOT NULL,
	`poster_path` text,
	`fetched_at` real NOT NULL,
	FOREIGN KEY (`tmdb_id`) REFERENCES `tmdb_series`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tmdb_series` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`imdb_id` text,
	`title` text NOT NULL,
	`original_title` text,
	`first_air_year` integer,
	`last_air_year` integer,
	`status` text,
	`number_of_seasons` integer,
	`number_of_episodes` integer,
	`overview` text,
	`original_language` text,
	`production_country` text,
	`vote_average` real,
	`vote_count` integer,
	`poster_path` text,
	`backdrop_path` text,
	`logo_path` text,
	`fetched_at` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tmdb_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'de-DE' NOT NULL
);
