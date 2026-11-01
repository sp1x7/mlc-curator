// The downloads table: one row per release thread, with its state, its note and
// the files it was started with. What the folder holds on disk is read in
// `fsview.ts`, which puts these rows in front of the Downloads window.

import type { DownloadState, ReleaseInfo } from "@shared/types/downloads";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/db";
import { downloads, mappings, releases } from "../db/schema";
import { storedMovie, storedSeries } from "../tmdb/title";

export type DownloadRecord = typeof downloads.$inferSelect;

/** One row by thread id. */
export function findDownload(threadId: number): DownloadRecord | null {
  return db.select().from(downloads).where(eq(downloads.threadId, threadId)).get() ?? null;
}

/** Every download row. */
export function allDownloads(): DownloadRecord[] {
  return db.select().from(downloads).all();
}

/** Writes folder and file list, inserting the row on the first start of a
    thread. */
export function saveDownload(threadId: number, folder: string, files: string[]): DownloadRecord {
  const existing = findDownload(threadId);

  if (existing) {
    db.update(downloads)
      .set({ folder, files: JSON.stringify(files) })
      .where(eq(downloads.threadId, threadId))
      .run();
  } else {
    db.insert(downloads)
      .values({ threadId, folder, files: JSON.stringify(files) })
      .run();
  }

  return findDownload(threadId) as DownloadRecord;
}

/** Writes state and note, plus the run stamps that come with the state. */
export function setState(
  threadId: number,
  state: DownloadState,
  note: string | null = null,
  run?: { startedAt?: number; finishedAt?: number },
): void {
  db.update(downloads)
    .set({ state, note, ...run })
    .where(eq(downloads.threadId, threadId))
    .run();
}

/** Stamps the time of the last organize pass. */
export function setOrganized(threadId: number): void {
  db.update(downloads)
    .set({ organizedAt: Date.now() / 1000 })
    .where(eq(downloads.threadId, threadId))
    .run();
}

/** Drops the row of one thread. */
export function removeDownload(threadId: number): void {
  db.delete(downloads).where(eq(downloads.threadId, threadId)).run();
}

/** The catalog row behind a download row. */
export function releaseOf(threadId: number): typeof releases.$inferSelect | null {
  return db.select().from(releases).where(eq(releases.threadId, threadId)).get() ?? null;
}

/**
 * The files a row was started with. A list that fails to parse reads as an
 * empty list, which keeps one damaged row inside its own row.
 */
export function filesOf(record: DownloadRecord): string[] {
  try {
    const parsed = JSON.parse(record.files) as unknown;

    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** The tmdb data a release is linked to; a thread whose link row is missing
    answers every field null. */
export function releaseInfoOf(threadId: number): ReleaseInfo {
  const link = db.select().from(mappings).where(eq(mappings.threadId, threadId)).get() ?? null;

  if (link === null) return { kind: null, tmdbId: null, title: null, year: null };

  if (link.kind === "movie") {
    const movie = storedMovie(link.tmdbId);

    return {
      kind: "movie",
      tmdbId: link.tmdbId,
      title: movie?.title ?? null,
      year: movie?.year ?? null,
    };
  }

  const series = storedSeries(link.tmdbId);

  return {
    kind: "tv",
    tmdbId: link.tmdbId,
    title: series?.title ?? null,
    year: series?.firstAirYear ?? null,
  };
}

/** Rows that were mid-flight when the server stopped. */
export function interruptedDownloads(): DownloadRecord[] {
  return db
    .select()
    .from(downloads)
    .where(inArray(downloads.state, ["queued", "listing", "downloading", "extracting"]))
    .all();
}
