// What the download folder says on disk: the files a release has already
// reached, and the rows of the Downloads window built from them. The stored row
// of a release lives in `store.ts`, together with the state the runner writes.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DownloadRow } from "@shared/types/downloads";
import { downloadFolder } from "./config";
import { allDownloads, filesOf, releaseInfoOf, releaseOf } from "./store";

/** Files under a folder with their bytes, named below that folder. A directory
 * recurses and its entries keep the directory name as prefix. */
export function diskFiles(folder: string): { path: string; bytes: number }[] {
  if (!existsSync(folder)) return [];

  const out: { path: string; bytes: number }[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      for (const child of diskFiles(path))
        out.push({ path: `${entry.name}/${child.path}`, bytes: child.bytes });
    } else if (entry.isFile()) {
      out.push({ path: path.slice(folder.length + 1), bytes: statSync(path).size });
    }
  }
  return out;
}

/** Paths of every file under a folder, absolute, the shape the runner uses to
    mark what it took. */
export function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];

  const out: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** What a download of one release is doing right now. */
export type LiveProgress = { bytes: number; speed: number; wanted: number | null };

/** One row per download: stored state, board title, live counters and what the
    disk holds. */
export function downloadRows(live: Map<number, LiveProgress>): DownloadRow[] {
  const root = downloadFolder();

  return allDownloads().map((record) => {
    const release = releaseOf(record.threadId);
    const folderPath = record.folder ? join(root, record.folder) : "";
    const progress = live.get(record.threadId);
    const disk = folderPath ? diskFiles(folderPath) : [];

    return {
      threadId: record.threadId,
      title: release?.title ?? record.folder,
      folder: record.folder,
      state: record.state,
      note: record.note,
      info: releaseInfoOf(record.threadId),
      bytesOnDisk: disk.reduce((total, file) => total + file.bytes, 0),
      disk,
      bytesWanted: progress?.wanted ?? null,
      speed: progress?.speed ?? null,
      files: filesOf(record),
      startedAt: record.startedAt ? new Date(record.startedAt * 1000).toISOString() : null,
      finishedAt: record.finishedAt ? new Date(record.finishedAt * 1000).toISOString() : null,
      organizedAt: record.organizedAt ? new Date(record.organizedAt * 1000).toISOString() : null,
    };
  });
}
