// NFO files and pictures the organizer adds to the library. The same function
// builds the plan entries and writes the files, so what the window shows is
// exactly what lands on disk. Words come from the database, and
// tmdb_fill_missing decides whether these files are built at all.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { DownloadPlan, PlanEntry } from "@shared/types/downloads";
import { nameInfoOf } from "../library/name-info";
import { on } from "../settings/store";
import { genreNames } from "../tmdb/store";
import {
  certificationOf,
  type EpisodeRow,
  movie as fetchMovie,
  season as fetchSeason,
  series as fetchSeries,
  type MovieRow,
  type SeriesRow,
  storedEpisodes,
  storedMovie,
  storedSeason,
  storedSeries,
} from "../tmdb/title";
import type { Mapping } from "./organize";

const PICTURE = { poster: "w500", backdrop: "w1280" };
const HOST = "https://image.tmdb.org/t/p";

/** What one organizing run added. */
export type Written = {
  nfo: string[];
  images: string[];
  /** The reason the run added zero files; null once the run wrote something. */
  skipped: string | null;
};

/** One file the organizer wants to leave in the library. */
export type MetadataTarget = {
  file: string;
  kind: "nfo" | "image";
  /** What the file is for: movie, episode, season, series, poster, backdrop. */
  role: string;
  /** NFO body; null for a picture. */
  text: string | null;
  /** Picture source; null for an NFO. */
  url: string | null;
  /** A file of that name already sits in the library. */
  exists: boolean;
};

/** The parts of a plan the metadata needs. */
export type Source = Pick<DownloadPlan, "threadId" | "folder" | "root" | "measured">;

const two = (value: number): string => String(value).padStart(2, "0");

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Field = [string, string | number | null | undefined];

/** NFO body out of label and value pairs; empty pairs fall away. */
function nfoText(root: string, pairs: Field[], raw: string[] = []): string {
  const lines = pairs
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([key, value]) => `  <${key}>${esc(String(value))}</${key}>`);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${[...lines, ...raw].join("\n")}\n</${root}>\n`;
}

const genresOf = (stored: string | null): Field[] =>
  genreNames(stored).map((genre): Field => ["genre", genre]);

function ratingOf(row: { voteAverage: number | null; voteCount: number | null }): Field[] {
  return [
    ["rating", row.voteAverage === null ? null : row.voteAverage.toFixed(2)],
    ["votes", row.voteCount],
  ];
}

function movieNfo(title: MovieRow, minutes: number | null): string {
  return nfoText(
    "movie",
    [
      ["title", title.title],
      ["originaltitle", title.originalTitle ?? title.title],
      ["plot", title.overview],
      ["year", title.year],
      ["releasedate", title.releaseDate],
      ["premiered", title.releaseDate],
      ["certification", title.certification],
      ["runtime", minutes],
      ["country", title.productionCountry],
      ["language", title.originalLanguage],
      ...genresOf(title.genres),
      ...ratingOf(title),
      ["imdbid", title.imdbId],
    ],
    [`  <uniqueid type="tmdb" default="true">${title.tmdbId}</uniqueid>`],
  );
}

function seriesNfo(title: SeriesRow): string {
  return nfoText(
    "tvshow",
    [
      ["title", title.title],
      ["originaltitle", title.originalTitle ?? title.title],
      ["plot", title.overview],
      ["year", title.firstAirYear],
      ["status", title.status],
      ["certification", title.certification],
      ["country", title.productionCountry],
      ["language", title.originalLanguage],
      ...genresOf(title.genres),
      ...ratingOf(title),
      ["imdbid", title.imdbId],
    ],
    [
      `  <uniqueid type="tmdb" default="true">${title.tmdbId}</uniqueid>`,
      "  <episodeguide>",
      `    <url>https://www.themoviedb.org/tv/${title.tmdbId}/season/1</url>`,
      "  </episodeguide>",
    ],
  );
}

function seasonNfo(
  title: SeriesRow,
  number: number,
  overview: string | null,
  name: string | null,
): string {
  return nfoText("season", [
    ["title", name ?? `Season ${number}`],
    ["showtitle", title.title],
    ["plot", overview],
    ["seasonnumber", number],
    ["tmdbid", title.tmdbId],
  ]);
}

function episodeNfo(title: SeriesRow, episode: EpisodeRow): string {
  return nfoText("episodedetails", [
    ["title", episode.name ?? episode.originalName],
    ["originaltitle", episode.originalName],
    ["showtitle", title.title],
    ["plot", episode.overview],
    ["aired", episode.airDate],
    ["season", episode.seasonNumber],
    ["episode", episode.episodeNumber],
    ["runtime", episode.runtimeMinutes],
  ]);
}

/** Season and episode a planned file names, in the target name first. */
function numbersOf(entry: PlanEntry): { season: number; episode: number } | null {
  for (const name of [basename(entry.to), basename(entry.from)]) {
    const info = nameInfoOf(name);
    const episode = info.episodes[0];

    if (info.season !== null && episode !== undefined) {
      return { season: info.season, episode };
    }
  }

  return null;
}

const stemOf = (file: string): string => file.slice(0, file.length - extname(file).length);

/**
 * Every NFO and picture the moved videos call for. With tmdb_fill_missing off
 * the run returns an empty target list, which leaves the write pass idle.
 */
export async function metadataTargets(
  source: Source,
  videos: PlanEntry[],
  link: Mapping,
): Promise<{ targets: MetadataTarget[]; skipped: string | null }> {
  const targets: MetadataTarget[] = [];

  // Off is a decision: the run returns an empty list and stays quiet.
  if (!on("tmdb_fill_missing")) return { targets, skipped: null };
  if (videos.length === 0) return { targets, skipped: "no video moved" };
  if (!link) return { targets, skipped: "no title linked" };

  const add = (
    file: string,
    kind: "nfo" | "image",
    role: string,
    text: string | null,
    url: string | null,
  ): void => {
    targets.push({ file, kind, role, text, url, exists: existsSync(file) });
  };

  if (link.kind === "movie") {
    let title = storedMovie(link.tmdbId);

    if (!title) title = await fetchMovie(link.tmdbId);
    if (!title) return { targets, skipped: "no title in the database" };

    // A stored row can still be short on imdb id or certification, so those two
    // are fetched and the row is read again.
    if (!title.imdbId || !title.certification) {
      if (!title.imdbId) await fetchMovie(link.tmdbId);
      if (!title.certification) await certificationOf("movie", link.tmdbId);
      title = storedMovie(link.tmdbId) ?? title;
    }

    for (const video of videos) {
      const folder = dirname(video.to);
      const minutes = source.measured[video.from]?.duration ?? null;

      add(`${stemOf(video.to)}.nfo`, "nfo", "movie", movieNfo(title, minutes), null);

      if (title.posterPath)
        add(
          join(folder, "poster.jpg"),
          "image",
          "poster",
          null,
          `${HOST}/${PICTURE.poster}${title.posterPath}`,
        );

      if (title.backdropPath)
        add(
          join(folder, "backdrop.jpg"),
          "image",
          "backdrop",
          null,
          `${HOST}/${PICTURE.backdrop}${title.backdropPath}`,
        );
    }

    return { targets, skipped: null };
  }

  let title = storedSeries(link.tmdbId);

  if (!title) title = await fetchSeries(link.tmdbId);
  if (!title) return { targets, skipped: "no title in the database" };

  // A stored row can still be short on imdb id or certification, so those two
  // are fetched and the row is read again.
  if (!title.imdbId || !title.certification) {
    if (!title.imdbId) await fetchSeries(link.tmdbId);
    if (!title.certification) await certificationOf("tv", link.tmdbId);
    title = storedSeries(link.tmdbId) ?? title;
  }

  // One season folder per season the planned files name, target side first.
  const seasonFolders = new Map<number, string>();

  for (const video of videos) {
    const numbers = numbersOf(video);
    if (numbers !== null && !seasonFolders.has(numbers.season))
      seasonFolders.set(numbers.season, dirname(video.to));
  }

  // Episodes for the season rows: stored first, one tmdb season fetch fills the
  // gap of a season the database has yet to see.
  const rows = new Map<number, EpisodeRow[]>();

  for (const number of seasonFolders.keys()) {
    let episodes = storedEpisodes(link.tmdbId, number);

    if (episodes.length === 0) {
      await fetchSeason(link.tmdbId, number);
      episodes = storedEpisodes(link.tmdbId, number);
    }

    rows.set(number, episodes);
  }

  for (const [number, folder] of seasonFolders) {
    const stored = storedSeason(link.tmdbId, number);

    add(
      join(folder, `season${two(number)}.nfo`),
      "nfo",
      "season",
      seasonNfo(title, number, stored?.overview ?? null, stored?.name ?? null),
      null,
    );

    if (stored?.posterPath)
      add(
        join(folder, "poster.jpg"),
        "image",
        "season poster",
        null,
        `${HOST}/${PICTURE.poster}${stored.posterPath}`,
      );

    // The series folder is the one above the season folders.
    const seriesFolder = dirname(folder);

    add(join(seriesFolder, "tvshow.nfo"), "nfo", "series", seriesNfo(title), null);

    if (title.posterPath)
      add(
        join(seriesFolder, "poster.jpg"),
        "image",
        "poster",
        null,
        `${HOST}/${PICTURE.poster}${title.posterPath}`,
      );

    if (title.backdropPath)
      add(
        join(seriesFolder, "fanart.jpg"),
        "image",
        "fanart",
        null,
        `${HOST}/${PICTURE.backdrop}${title.backdropPath}`,
      );
  }

  for (const video of videos) {
    const numbers = numbersOf(video);
    if (numbers === null) continue;

    const episode = (rows.get(numbers.season) ?? []).find(
      (row) => row.episodeNumber === numbers.episode,
    );

    if (!episode) continue;

    add(`${stemOf(video.to)}.nfo`, "nfo", "episode", episodeNfo(title, episode), null);
  }

  return { targets, skipped: null };
}

/** Fetches the picture bytes over https; a failing answer returns false. */
async function pull(url: string, file: string): Promise<boolean> {
  try {
    const answer = await fetch(url);
    if (!answer.ok) return false;

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, new Uint8Array(await answer.arrayBuffer()));

    return true;
  } catch {
    return false;
  }
}

/** Writes the checked targets; a file already in the library is left alone. */
export async function writeMetadata(
  plan: DownloadPlan,
  chosen: Set<string>,
  link: Mapping,
): Promise<Written> {
  const videos = plan.entries.filter(
    (entry) => entry.kind === "video" && entry.move && !entry.added && chosen.has(entry.from),
  );

  const { targets, skipped } = await metadataTargets(plan, videos, link);
  const written: Written = { nfo: [], images: [], skipped };

  for (const target of targets) {
    // An existing file or an unchecked target stays as it is.
    if (target.exists || !chosen.has(target.file)) continue;

    if (target.text !== null) {
      mkdirSync(dirname(target.file), { recursive: true });
      writeFileSync(target.file, target.text);
      written.nfo.push(target.file);
    } else if (target.url !== null && (await pull(target.url, target.file))) {
      written.images.push(target.file);
    }
  }

  // A word is worth telling when the list held targets and zero of them reached
  // the disk.
  if (
    targets.length > 0 &&
    written.nfo.length === 0 &&
    written.images.length === 0 &&
    written.skipped === null
  )
    written.skipped = "nothing checked to write";

  return written;
}
