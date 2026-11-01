import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { tmdbEpisodes, tmdbMovies, tmdbSeasons, tmdbSeries } from "../db/schema";
import { tmdbGet } from "./client";
import {
  type MovieAnswer,
  type SeasonAnswer,
  type SeriesAnswer,
  saveEpisodes,
  saveMovie,
  saveSeason,
  saveSeries,
} from "./store";

export type MovieRow = typeof tmdbMovies.$inferSelect;
export type SeriesRow = typeof tmdbSeries.$inferSelect;
export type SeasonRow = typeof tmdbSeasons.$inferSelect;
export type EpisodeRow = typeof tmdbEpisodes.$inferSelect;

/** One stored movie row by id. */
export function storedMovie(tmdbId: number): MovieRow | null {
  return db.select().from(tmdbMovies).where(eq(tmdbMovies.tmdbId, tmdbId)).get() ?? null;
}

/** One stored series row by id. */
export function storedSeries(tmdbId: number): SeriesRow | null {
  return db.select().from(tmdbSeries).where(eq(tmdbSeries.tmdbId, tmdbId)).get() ?? null;
}

/** The season rows of one series. */
export function storedSeasons(seriesTmdbId: number): SeasonRow[] {
  return db.select().from(tmdbSeasons).where(eq(tmdbSeasons.tmdbId, seriesTmdbId)).all();
}

/** One season row of one series. */
export function storedSeason(seriesTmdbId: number, seasonNumber: number): SeasonRow | null {
  return (
    db
      .select()
      .from(tmdbSeasons)
      .where(and(eq(tmdbSeasons.tmdbId, seriesTmdbId), eq(tmdbSeasons.seasonNumber, seasonNumber)))
      .get() ?? null
  );
}

/** The episode rows of one season. */
export function storedEpisodes(seriesTmdbId: number, seasonNumber: number): EpisodeRow[] {
  return db
    .select()
    .from(tmdbEpisodes)
    .where(and(eq(tmdbEpisodes.tmdbId, seriesTmdbId), eq(tmdbEpisodes.seasonNumber, seasonNumber)))
    .all();
}

/**
 * Stored rows of many titles at once. The catalog list shows a poster and a
 * year for every release on the page and asks once for all of them instead of
 * once per row.
 */
export function storedMoviesIn(ids: number[]): MovieRow[] {
  if (ids.length === 0) return [];
  return db.select().from(tmdbMovies).where(inArray(tmdbMovies.tmdbId, ids)).all();
}

/** The series answer of `storedMoviesIn`. */
export function storedSeriesIn(ids: number[]): SeriesRow[] {
  if (ids.length === 0) return [];
  return db.select().from(tmdbSeries).where(inArray(tmdbSeries.tmdbId, ids)).all();
}

/**
 * The IMDb id the packer wrote into an NFO, taken over into the title row. A row
 * that already carries an id keeps it: the id tmdb sent wins over a guess.
 */
export function setImdbId(tmdbId: number, imdbId: string): void {
  db.update(tmdbMovies)
    .set({ imdbId })
    .where(and(eq(tmdbMovies.tmdbId, tmdbId), sql`${tmdbMovies.imdbId} is null`))
    .run();
}

/** Every stored movie, the pool the resolver compares against. */
export function allMovies(): MovieRow[] {
  return db.select().from(tmdbMovies).all();
}

/** Every stored series, the pool the resolver compares against. */
export function allSeries(): SeriesRow[] {
  return db.select().from(tmdbSeries).all();
}

/** Stored movies whose title or original title contains the text, case aside. */
export function findStoredMovies(title: string): MovieRow[] {
  const wanted = `%${title.toLowerCase()}%`;
  return db
    .select()
    .from(tmdbMovies)
    .where(
      sql`lower(${tmdbMovies.title}) like ${wanted} or lower(${tmdbMovies.originalTitle}) like ${wanted}`,
    )
    .all();
}

/** Stored series whose title or original title contains the text, case aside. */
export function findStoredSeries(title: string): SeriesRow[] {
  const wanted = `%${title.toLowerCase()}%`;
  return db
    .select()
    .from(tmdbSeries)
    .where(
      sql`lower(${tmdbSeries.title}) like ${wanted} or lower(${tmdbSeries.originalTitle}) like ${wanted}`,
    )
    .all();
}

/** The stored movie that carries this imdb id. */
export function findStoredMovieByImdbId(imdbId: string): MovieRow | null {
  return db.select().from(tmdbMovies).where(eq(tmdbMovies.imdbId, imdbId)).get() ?? null;
}

/** The stored series that carries this imdb id. */
export function findStoredSeriesByImdbId(imdbId: string): SeriesRow | null {
  return db.select().from(tmdbSeries).where(eq(tmdbSeries.imdbId, imdbId)).get() ?? null;
}

/** Stored row first; a refresh or an absent row asks tmdb and stores the answer. */
export async function movie(tmdbId: number, refresh = false): Promise<MovieRow | null> {
  if (!refresh) {
    const stored = storedMovie(tmdbId);
    if (stored) return stored;
  }

  const answer = (await tmdbGet(`/movie/${tmdbId}`)) as MovieAnswer | null;
  if (!answer) return null;

  saveMovie(answer);
  return storedMovie(tmdbId);
}

/** Stored row first; a refresh or an absent row asks tmdb and stores the answer. */
export async function series(tmdbId: number, refresh = false): Promise<SeriesRow | null> {
  if (!refresh) {
    const stored = storedSeries(tmdbId);
    if (stored) return stored;
  }

  const answer = (await tmdbGet(`/tv/${tmdbId}`)) as SeriesAnswer | null;
  if (!answer) return null;

  saveSeries(answer);
  return storedSeries(tmdbId);
}

/** One row of the release-dates or content-ratings answer. */
type RateRow = { iso_3166_1: string; release_type?: number; certification?: string };

// The German rating. Movies keep theirs in the release dates, series in their
// content ratings; both are a separate answer and are stored once.
export async function certificationOf(
  kind: "movie" | "tv",
  tmdbId: number,
): Promise<string | null> {
  const storedValue =
    kind === "movie" ? storedMovie(tmdbId)?.certification : storedSeries(tmdbId)?.certification;
  if (storedValue) return storedValue;

  const answer =
    kind === "movie"
      ? ((await tmdbGet(`/movie/${tmdbId}/release_dates`)) as { results?: RateRow[] } | null)
      : ((await tmdbGet(`/tv/${tmdbId}/content_ratings`)) as { results?: RateRow[] } | null);

  const certification =
    (answer?.results ?? []).find((entry) => entry.iso_3166_1 === "DE" && entry.certification)
      ?.certification ?? null;

  if (!certification) return null;

  if (kind === "movie") {
    db.update(tmdbMovies).set({ certification }).where(eq(tmdbMovies.tmdbId, tmdbId)).run();
  } else {
    db.update(tmdbSeries).set({ certification }).where(eq(tmdbSeries.tmdbId, tmdbId)).run();
  }

  return certification;
}

/** Stored episodes first; a refresh or an empty season asks tmdb and stores season
    plus episodes. */
export async function season(
  seriesTmdbId: number,
  seasonNumber: number,
  refresh = false,
): Promise<{ season: SeasonRow | null; episodes: EpisodeRow[] } | null> {
  const storedEpisodesOfSeason = storedEpisodes(seriesTmdbId, seasonNumber);
  if (!refresh && storedEpisodesOfSeason.length > 0) {
    return { season: storedSeason(seriesTmdbId, seasonNumber), episodes: storedEpisodesOfSeason };
  }

  const answer = (await tmdbGet(
    `/tv/${seriesTmdbId}/season/${seasonNumber}`,
  )) as SeasonAnswer | null;
  if (!answer) return null;

  saveSeason(seriesTmdbId, answer);
  saveEpisodes(seriesTmdbId, answer.episodes ?? []);

  return {
    season: storedSeason(seriesTmdbId, seasonNumber),
    episodes: storedEpisodes(seriesTmdbId, seasonNumber),
  };
}
