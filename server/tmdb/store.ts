// Rows of the tmdb tables: one writer per table, each endpoint answer reshaped
// into the column names of the schema.

import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { tmdbEpisodes, tmdbMovies, tmdbSeasons, tmdbSeries } from "../db/schema";

/** The movie endpoint fields this module writes. */
export interface MovieAnswer {
  id: number;
  imdb_id?: string | null;
  title: string;
  original_title?: string | null;
  release_date?: string | null;
  overview?: string | null;
  original_language?: string | null;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  genres?: Array<{ id: number; name: string }> | null;
  vote_average?: number | null;
  vote_count?: number | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

/** The series endpoint fields this module writes. */
export interface SeriesAnswer {
  id: number;
  imdb_id?: string | null;
  name: string;
  original_name?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  status?: string | null;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  overview?: string | null;
  original_language?: string | null;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  genres?: Array<{ id: number; name: string }> | null;
  vote_average?: number | null;
  vote_count?: number | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  logo_path?: string | null;
}

/** One episode of a season endpoint. */
export interface EpisodeAnswer {
  episode_number: number;
  season_number: number;
  name?: string | null;
  original_name?: string | null;
  air_date?: string | null;
  overview?: string | null;
  runtime?: number | null;
  still_path?: string | null;
}

/** One season of a series endpoint, with its episodes. */
export interface SeasonAnswer {
  season_number: number;
  name?: string | null;
  overview?: string | null;
  air_date?: string | null;
  poster_path?: string | null;
  episodes?: EpisodeAnswer[];
}

/** The year out of a date string, null outside the range 1850..2100. */
export function yearOf(date: string | null | undefined): number | null {
  const year = Number((date ?? "").slice(0, 4));
  return year >= 1850 && year <= 2100 ? year : null;
}

/** Genre names as a json array text, null for an empty list. */
export function genreText(genres: Array<{ name: string }> | null | undefined): string | null {
  const names = (genres ?? []).map((genre) => genre.name).filter(Boolean);
  return names.length ? JSON.stringify(names) : null;
}

/** The genre names of a stored json array; other content answers an empty list. */
export function genreNames(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === "string")
      : [];
  } catch {
    return [];
  }
}

/** Writes one movie row: update on an existing id, insert for a new one. */
export function saveMovie(answer: MovieAnswer): void {
  const where = eq(tmdbMovies.tmdbId, answer.id);
  const values = {
    tmdbId: answer.id,
    imdbId: answer.imdb_id ?? null,
    title: answer.title,
    originalTitle: answer.original_title ?? null,
    year: yearOf(answer.release_date),
    releaseDate: answer.release_date ?? null,
    overview: answer.overview ?? null,
    originalLanguage: answer.original_language ?? null,
    productionCountry: answer.production_countries?.[0]?.name ?? null,
    genres: genreText(answer.genres),
    voteAverage: answer.vote_average ?? null,
    voteCount: answer.vote_count ?? null,
    posterPath: answer.poster_path ?? null,
    backdropPath: answer.backdrop_path ?? null,
    fetchedAt: Date.now() / 1000,
  };

  if (db.select({ id: tmdbMovies.tmdbId }).from(tmdbMovies).where(where).get()) {
    db.update(tmdbMovies).set(values).where(where).run();
    return;
  }

  db.insert(tmdbMovies).values(values).run();
}

/** Writes one series row: update on an existing id, insert for a new one. */
export function saveSeries(answer: SeriesAnswer): void {
  const where = eq(tmdbSeries.tmdbId, answer.id);
  const values = {
    tmdbId: answer.id,
    imdbId: answer.imdb_id ?? null,
    title: answer.name,
    originalTitle: answer.original_name ?? null,
    firstAirYear: yearOf(answer.first_air_date),
    lastAirYear: yearOf(answer.last_air_date),
    status: answer.status ?? null,
    numberOfSeasons: answer.number_of_seasons ?? null,
    numberOfEpisodes: answer.number_of_episodes ?? null,
    overview: answer.overview ?? null,
    originalLanguage: answer.original_language ?? null,
    productionCountry: answer.production_countries?.[0]?.name ?? null,
    genres: genreText(answer.genres),
    voteAverage: answer.vote_average ?? null,
    voteCount: answer.vote_count ?? null,
    posterPath: answer.poster_path ?? null,
    backdropPath: answer.backdrop_path ?? null,
    logoPath: answer.logo_path ?? null,
    fetchedAt: Date.now() / 1000,
  };

  if (db.select({ id: tmdbSeries.tmdbId }).from(tmdbSeries).where(where).get()) {
    db.update(tmdbSeries).set(values).where(where).run();
    return;
  }

  db.insert(tmdbSeries).values(values).run();
}

/** Writes one season row, keyed by show id and season number. */
export function saveSeason(tmdbId: number, answer: SeasonAnswer): void {
  const where = and(
    eq(tmdbSeasons.tmdbId, tmdbId),
    eq(tmdbSeasons.seasonNumber, answer.season_number),
  );
  const values = {
    tmdbId,
    seasonNumber: answer.season_number,
    name: answer.name ?? null,
    overview: answer.overview ?? null,
    year: yearOf(answer.air_date),
    episodeCount: answer.episodes?.length ?? 0,
    posterPath: answer.poster_path ?? null,
    fetchedAt: Date.now() / 1000,
  };

  if (db.select({ id: tmdbSeasons.tmdbId }).from(tmdbSeasons).where(where).get()) {
    db.update(tmdbSeasons).set(values).where(where).run();
    return;
  }

  db.insert(tmdbSeasons).values(values).run();
}

/** Writes one row per episode, keyed by show, season number and episode number. */
export function saveEpisodes(tmdbId: number, episodes: EpisodeAnswer[]): void {
  for (const episode of episodes) {
    const where = and(
      eq(tmdbEpisodes.tmdbId, tmdbId),
      eq(tmdbEpisodes.seasonNumber, episode.season_number),
      eq(tmdbEpisodes.episodeNumber, episode.episode_number),
    );
    const values = {
      tmdbId,
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      name: episode.name ?? null,
      originalName: episode.original_name ?? null,
      airDate: episode.air_date ?? null,
      overview: episode.overview ?? null,
      runtimeMinutes: episode.runtime ?? null,
      stillPath: episode.still_path ?? null,
      fetchedAt: Date.now() / 1000,
    };

    if (db.select({ id: tmdbEpisodes.episodeNumber }).from(tmdbEpisodes).where(where).get()) {
      db.update(tmdbEpisodes).set(values).where(where).run();
      continue;
    }

    db.insert(tmdbEpisodes).values(values).run();
  }
}
