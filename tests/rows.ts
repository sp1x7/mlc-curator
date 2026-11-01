// Rows the tests write into the in-memory database: one board thread, its title
// mapping, its download row, one setting, one wish.

import { db } from "../server/db/db";
import {
  downloads,
  mappings,
  releases,
  settings,
  tmdbMovies,
  tmdbSeries,
  wishes,
} from "../server/db/schema";

// One day in seconds.
export const DAY = 86_400;

/** The states a download row can hold. */
export type DownloadState =
  | "queued"
  | "listing"
  | "downloading"
  | "extracting"
  | "measuring"
  | "planned"
  | "stopped"
  | "error";

/** The clock in whole seconds. */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** subcategory is the forum name the snapshot stored for the thread. */
export function threadRow(input: {
  threadId: number;
  tags: string[];
  forum?: string | null;
  publishedAt?: number;
  ftpPath?: string;
}): void {
  db.insert(releases)
    .values({
      threadId: input.threadId,
      title: `thread ${input.threadId}`,
      name: "the title",
      tags: JSON.stringify(input.tags),
      category: "Filme",
      subcategory: input.forum ?? null,
      publishedAt: input.publishedAt ?? now() - DAY,
      url: `showthread.php?${input.threadId}`,
      ftpPath: input.ftpPath ?? null,
      lastSeenAt: now(),
    })
    .run();
}

/** The link from a thread to a tmdb title. */
export function mapTitle(threadId: number, tmdbId: number, kind: "movie" | "tv" = "movie"): void {
  db.insert(mappings).values({ threadId, tmdbId, kind }).run();
}

/** A download row for a thread, with the release folder it points at. */
export function downloadRow(
  threadId: number,
  state: DownloadState,
  folder?: string,
  note?: string,
): void {
  db.insert(downloads)
    .values({ threadId, state, folder: folder ?? `thread-${threadId}`, note: note ?? null })
    .run();
}

/** A film row complete enough for the organizer to work from the table. */
export function movieRow(input: { tmdbId: number; title: string; year: number }): void {
  db.insert(tmdbMovies)
    .values({
      tmdbId: input.tmdbId,
      title: input.title,
      year: input.year,
      imdbId: "tt0000001",
      certification: "FSK 16",
      originalLanguage: "en",
      posterPath: "/poster.jpg",
      backdropPath: "/backdrop.jpg",
    })
    .run();
}

/** A series row complete enough for the organizer to work from the table. */
export function seriesRow(input: { tmdbId: number; title: string; year: number }): void {
  db.insert(tmdbSeries)
    .values({
      tmdbId: input.tmdbId,
      title: input.title,
      firstAirYear: input.year,
      imdbId: "tt0000002",
      certification: "FSK 16",
      originalLanguage: "en",
      numberOfSeasons: 1,
    })
    .run();
}

/** Where the release folders are and where the library is. */
export function folderRows(download: string, library: string): void {
  settingRow("download_folder", download);
  settingRow("library_root", library);
}

/** Writes one setting, an old value under the same key replaced. */
export function settingRow(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** A wish with its target. */
export function wishRow(input: {
  id: number;
  tmdbId: number;
  kind?: "movie" | "tv";
  minRes?: "720p" | "1080p" | "2160p" | "none";
}): void {
  db.insert(wishes)
    .values({
      id: input.id,
      tmdbId: input.tmdbId,
      kind: input.kind ?? "movie",
      minRes: input.minRes ?? "1080p",
    })
    .run();
}

/** The stand of a title the app owns: a thread that already delivered. */
export function owned(tmdbId: number, tags: string[], state: DownloadState = "planned"): number {
  const threadId = tmdbId + 500_000;

  threadRow({ threadId, tags, forum: null });
  mapTitle(threadId, tmdbId);
  downloadRow(threadId, state);

  return threadId;
}
