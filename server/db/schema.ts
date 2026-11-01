// Drizzle table definitions of the curator database.

import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Key value rows: every tunable of the app is one row.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// One tmdb movie, keyed by its tmdb id; fetchedAt marks the last read.
export const tmdbMovies = sqliteTable("tmdb_movies", {
  tmdbId: integer("tmdb_id").primaryKey(),
  imdbId: text("imdb_id"),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  year: integer("year"),
  releaseDate: text("release_date"),
  overview: text("overview"),
  originalLanguage: text("original_language"),
  productionCountry: text("production_country"),
  genres: text("genres"),
  certification: text("certification"),
  voteAverage: real("vote_average"),
  voteCount: integer("vote_count"),
  posterPath: text("poster_path"),
  backdropPath: text("backdrop_path"),
  fetchedAt: real("fetched_at")
    .notNull()
    .$defaultFn(() => Date.now() / 1000),
});

// One tmdb show. The title covers every season, so it lives in this row.
export const tmdbSeries = sqliteTable("tmdb_series", {
  tmdbId: integer("tmdb_id").primaryKey(),
  imdbId: text("imdb_id"),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  firstAirYear: integer("first_air_year"),
  lastAirYear: integer("last_air_year"),
  status: text("status"),
  numberOfSeasons: integer("number_of_seasons"),
  numberOfEpisodes: integer("number_of_episodes"),
  overview: text("overview"),
  originalLanguage: text("original_language"),
  productionCountry: text("production_country"),
  genres: text("genres"),
  certification: text("certification"),
  voteAverage: real("vote_average"),
  voteCount: integer("vote_count"),
  posterPath: text("poster_path"),
  backdropPath: text("backdrop_path"),
  logoPath: text("logo_path"),
  fetchedAt: real("fetched_at")
    .notNull()
    .$defaultFn(() => Date.now() / 1000),
});

// episodeCount is what a library season folder is compared against.
export const tmdbSeasons = sqliteTable(
  "tmdb_seasons",
  {
    tmdbId: integer("tmdb_id")
      .notNull()
      .references(() => tmdbSeries.tmdbId, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    name: text("name"),
    overview: text("overview"),
    year: integer("year"),
    episodeCount: integer("episode_count").notNull().default(0),
    posterPath: text("poster_path"),
    fetchedAt: real("fetched_at")
      .notNull()
      .$defaultFn(() => Date.now() / 1000),
  },
  (table) => [primaryKey({ columns: [table.tmdbId, table.seasonNumber] })],
);

// One board thread. The snapshot writes the rows and deletes them once a thread
// is gone from every forum page.
export const releases = sqliteTable(
  "releases",
  {
    // Thread id from the board url: showthread.php?698638 -> 698638.
    threadId: integer("thread_id").primaryKey(),
    // Scene name exactly as the board writes it.
    title: text("title").notNull(),
    // The title stripped of its release tags.
    name: text("name").notNull(),
    // Normalised release tags as a JSON array.
    tags: text("tags").notNull().default("[]"),
    category: text("category"),
    subcategory: text("subcategory"),
    forumId: integer("forum_id"),
    publishedAt: real("published_at"),
    url: text("url").notNull(),
    // Set by the snapshot run that saw the thread last.
    lastSeenAt: real("last_seen_at").notNull(),

    // Ftp access from the decrypted info file; null until fetched.
    ftpHost: text("ftp_host"),
    ftpPort: integer("ftp_port"),
    ftpUser: text("ftp_user"),
    ftpPass: text("ftp_pass"),
    ftpPath: text("ftp_path"),
    ftpRaw: text("ftp_raw"),
    ftpFetchedAt: real("ftp_fetched_at"),
  },
  (table) => [index("releases_category_idx").on(table.category)],
);

export type ReleaseRow = typeof releases.$inferSelect;

// One thread onto one tmdb title. The thread is the key: a release has at most
// one title, and a snapshot that deletes the thread deletes this row too.
export const mappings = sqliteTable("mappings", {
  threadId: integer("thread_id")
    .primaryKey()
    .references(() => releases.threadId, { onDelete: "cascade" }),
  tmdbId: integer("tmdb_id").notNull(),
  kind: text("kind").$type<"movie" | "tv">().notNull(),
  origin: text("origin").$type<"auto" | "manual">().notNull().default("auto"),
  createdAt: real("created_at")
    .notNull()
    .$defaultFn(() => Date.now() / 1000),
});

// One wanted title with the target it has to reach; the title text lives in
// tmdb_movies and tmdb_series.
export const wishes = sqliteTable("wishes", {
  id: integer("id").primaryKey(),
  tmdbId: integer("tmdb_id").notNull(),
  kind: text("kind").$type<"movie" | "tv">().notNull(),
  minRes: text("min_res").$type<"720p" | "1080p" | "2160p" | "none">().notNull().default("1080p"),
  hdr: text("hdr").$type<"any" | "only" | "never">().notNull().default("any"),
  audio: text("audio").$type<"any" | "ger" | "orig">().notNull().default("any"),
  note: text("note"),
  createdAt: real("created_at")
    .notNull()
    .$defaultFn(() => Date.now() / 1000),
});

export type WishRow = typeof wishes.$inferSelect;

// The download of one release thread, one row per thread id.
export const downloads = sqliteTable(
  "downloads",
  {
    id: integer("id").primaryKey(),
    threadId: integer("thread_id").notNull().unique(),
    // queued, listing, downloading, extracting, measuring, planned, stopped, error
    state: text("state")
      .$type<
        | "queued"
        | "listing"
        | "downloading"
        | "extracting"
        | "measuring"
        | "planned"
        | "stopped"
        | "error"
      >()
      .notNull()
      .default("queued"),
    // Release folder inside the download folder.
    folder: text("folder").notNull().default(""),
    // Chosen paths below that folder, as JSON.
    files: text("files").notNull().default("[]"),
    note: text("note"),
    organizedAt: real("organized_at"),
    createdAt: real("created_at")
      .notNull()
      .$defaultFn(() => Date.now() / 1000),
    startedAt: real("started_at"),
    finishedAt: real("finished_at"),
  },
  (table) => [index("downloads_state_idx").on(table.state)],
);

// One episode of a season, keyed by show, season number and episode number.
export const tmdbEpisodes = sqliteTable(
  "tmdb_episodes",
  {
    tmdbId: integer("tmdb_id")
      .notNull()
      .references(() => tmdbSeries.tmdbId, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    name: text("name"),
    originalName: text("original_name"),
    airDate: text("air_date"),
    overview: text("overview"),
    runtimeMinutes: integer("runtime_minutes"),
    stillPath: text("still_path"),
    fetchedAt: real("fetched_at")
      .notNull()
      .$defaultFn(() => Date.now() / 1000),
  },
  (table) => [primaryKey({ columns: [table.tmdbId, table.seasonNumber, table.episodeNumber] })],
);
